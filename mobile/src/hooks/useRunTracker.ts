import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  MOVING_MIN_MPS,
  appendPoint,
  emptyRoute,
  haversineMeters,
  type LiveRouteState,
  type TrackPoint,
} from '../lib/geo';
import { api, ApiError } from '../api/client';
import type { CreateRunPayload, Run } from '../api/types';

export type TrackerStatus =
  | 'idle'
  | 'requesting'
  | 'running'
  | 'paused'
  | 'saving'
  | 'saved'
  | 'error';

export interface Snapshot {
  /** Moving time only — pauses are subtracted. */
  elapsedSeconds: number;
  distanceMeters: number;
  /** Seconds per kilometer. */
  paceSecPerKm: number;
  speedKmh: number;
  maxSpeedKmh: number;
  elevationGainMeters: number;
  /** AVERAGE since start — what the finished run will be scored on. */
  avgSpeedKmh: number;
  avgPaceSecPerKm: number;
  /** RIGHT NOW, straight from the GPS chip. 0 when you are standing still. */
  currentSpeedKmh: number;
  currentPaceSecPerKm: number;
  isMoving: boolean;
  points: TrackPoint[];
  coords: { latitude: number; longitude: number; heading: number | null } | null;
}

const EMPTY: Snapshot = {
  elapsedSeconds: 0,
  distanceMeters: 0,
  paceSecPerKm: 0,
  speedKmh: 0,
  maxSpeedKmh: 0,
  elevationGainMeters: 0,
  avgSpeedKmh: 0,
  avgPaceSecPerKm: 0,
  currentSpeedKmh: 0,
  currentPaceSecPerKm: 0,
  isMoving: false,
  points: [],
  coords: null,
};

export interface RunTracker {
  status: TrackerStatus;
  snapshot: Snapshot;
  error: string | null;
  savedRun: Run | null;
  /** True when a finished run is waiting to be uploaded (save failed). */
  canRetry: boolean;
  /** Increments every GPS fix — handy to prove the stream is alive. */
  fixCount: number;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
  retrySave: () => void;
  discardRun: () => Promise<void>;
  reset: () => Promise<void>;
}

/**
 * The heart of RunTrack.
 *
 *   GPS watch  ──► routeRef (points + distance)   ─┐
 *                                                  ├─► snapshot ─► UI
 *   clock refs ──► elapsed (now − started − paused)┘
 *
 * Two rules the UI depends on:
 *
 *  1. The clock is *derived* from timestamps, never a +1 counter, so a GC
 *     pause or an incoming call cannot make the stopwatch drift:
 *         elapsed = now − startedAt − pausedDuration
 *
 *  2. Status flips BEFORE any `await`. Pressing STOP must paint "SAVING…"
 *     on the next frame — waiting for the network first feels broken.
 */
export function useRunTracker(): RunTracker {
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [savedRun, setSavedRun] = useState<Run | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [fixCount, setFixCount] = useState(0);

  const routeRef = useRef<LiveRouteState>(emptyRoute());
  const startedAtRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const segmentRef = useRef(0);
  const statusRef = useRef<TrackerStatus>('idle');
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  /** Survives a failed upload so the run is never lost. */
  const pendingRef = useRef<CreateRunPayload | null>(null);
  /** Chip speed of the newest fix. -1 means "provider gave no speed". */
  const chipSpeedRef = useRef(-1);
  /** Epoch ms of the newest fix that actually counted towards distance. */
  const lastAcceptedAtRef = useRef(0);

  const setStatusBoth = (s: TrackerStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const elapsedNow = useCallback(() => {
    if (startedAtRef.current === 0) return 0;
    const pausedAt = pausedAtRef.current;
    const paused =
      pausedMsRef.current + (pausedAt != null ? Date.now() - pausedAt : 0);
    return Math.max(0, (Date.now() - startedAtRef.current - paused) / 1000);
  }, []);

  const sync = useCallback(
    (coords?: { latitude: number; longitude: number; heading: number | null }) => {
      const route = routeRef.current;
      const elapsed = elapsedNow();
      const km = route.distanceMeters / 1000;
      const hours = elapsed / 3600;

      // ---- average over the whole run (what gets saved) ----
      const avgSpeedKmh = km > 0 && hours > 0 ? km / hours : 0;
      const avgPaceSecPerKm = km > 0 ? elapsed / km : 0;

      // ---- what is happening THIS second ----
      // Prefer the chip; fall back to the last step we actually counted.
      const pts = route.points;
      let impliedMps = 0;
      if (pts.length >= 2) {
        const a = pts[pts.length - 2];
        const b = pts[pts.length - 1];
        const dt = (b.time - a.time) / 1000;
        if (dt > 0) impliedMps = haversineMeters(a, b) / dt;
      }

      const chip = chipSpeedRef.current;
      let currentMps = chip > 0 ? chip : impliedMps;

      // If nothing has counted for 6 s you are not covering ground, even if
      // the last accepted step said otherwise (that value has gone stale).
      const fresh = Date.now() - lastAcceptedAtRef.current < 6000;
      const isMoving = currentMps >= MOVING_MIN_MPS && (chip > 0 || fresh);
      if (!isMoving) currentMps = 0;

      setSnapshot((prev) => ({
        elapsedSeconds: elapsed,
        distanceMeters: route.distanceMeters,
        paceSecPerKm: avgPaceSecPerKm,
        speedKmh: avgSpeedKmh,
        maxSpeedKmh: route.maxSpeedKmh,
        elevationGainMeters: route.elevationGainMeters,
        avgSpeedKmh,
        avgPaceSecPerKm,
        currentSpeedKmh: currentMps * 3.6,
        currentPaceSecPerKm: currentMps > 0 ? 1000 / currentMps : 0,
        isMoving,
        points: route.points,
        coords: coords ?? prev.coords,
      }));
    },
    [elapsedNow],
  );

  /* ---------------- stopwatch ticker ---------------- */
  useEffect(() => {
    if (status !== 'running' && status !== 'paused') return;
    const id = setInterval(() => sync(), 250);
    return () => clearInterval(id);
  }, [status, sync]);

  /* ---------------- GPS stream ---------------- */
  const stopWatch = useCallback(async () => {
    watchRef.current?.remove();
    watchRef.current = null;
  }, []);

  const startWatch = useCallback(async () => {
    await stopWatch();
    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 3,
        mayShowUserSettingsDialog: true,
      },
      (loc) => {
        if (statusRef.current !== 'running') return;

        const c = loc.coords;
        const before = routeRef.current.points.length;
        const point: TrackPoint = {
          lat: c.latitude,
          lon: c.longitude,
          time: loc.timestamp,
          altitude: c.altitude ?? null,
          speed: c.speed ?? null,
          accuracy: c.accuracy ?? null,
          segment: segmentRef.current,
        };
        routeRef.current = appendPoint(routeRef.current, point);

        // Remember whether this fix counted, and what the chip said.
        chipSpeedRef.current = c.speed != null && c.speed > 0 ? c.speed : -1;
        if (routeRef.current.points.length > before) lastAcceptedAtRef.current = Date.now();

        setFixCount((n) => n + 1);
        sync({
          latitude: c.latitude,
          longitude: c.longitude,
          heading: c.heading ?? null,
        });
      },
    );
  }, [stopWatch, sync]);

  useEffect(() => () => void stopWatch(), [stopWatch]);

  /* ---------------- upload ---------------- */
  const persist = useCallback(async () => {
    const payload = pendingRef.current;
    if (!payload) return;

    setError(null);
    try {
      const res = await api.createRun(payload);
      pendingRef.current = null;
      setCanRetry(false);
      setSavedRun(res.run);
      setStatusBoth('saved');
    } catch (err) {
      // pendingRef is kept on purpose → the runner can press RETRY.
      setCanRetry(true);
      setError(err instanceof ApiError ? err.message : `Save failed: ${String(err)}`);
      setStatusBoth('error');
    }
  }, []);

  /* ---------------- public actions ---------------- */
  const start = useCallback(async () => {
    setError(null);
    setSavedRun(null);
    setCanRetry(false);
    pendingRef.current = null;

    // Cheap check first — avoids the "Requesting…" flash when already granted.
    let { status: permission } = await Location.getForegroundPermissionsAsync();
    if (permission !== 'granted') {
      setStatusBoth('requesting');
      ({ status: permission } = await Location.requestForegroundPermissionsAsync());
    }
    if (permission !== 'granted') {
      setError('Location permission is required to track a run.');
      setStatusBoth('error');
      return;
    }

    routeRef.current = emptyRoute();
    startedAtRef.current = Date.now();
    pausedMsRef.current = 0;
    pausedAtRef.current = null;
    segmentRef.current = 0;
    setFixCount(0);
    setSnapshot(EMPTY);
    chipSpeedRef.current = -1;
    lastAcceptedAtRef.current = Date.now();

    // Flip to running FIRST so the tap paints immediately; the GPS watch
    // attaches right after without blocking the UI.
    setStatusBoth('running');
    startWatch().catch((err: unknown) => {
      // A rejected watch must never become an unhandled rejection — that is
      // a silent crash on Android release builds.
      setError(
        `Could not start GPS tracking: ${err instanceof Error ? err.message : String(err)}`,
      );
      setStatusBoth('error');
    });
  }, [startWatch]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'running') return;
    pausedAtRef.current = Date.now();
    setStatusBoth('paused');
    sync();
  }, [sync]);

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return;
    const at = pausedAtRef.current;
    if (at != null) pausedMsRef.current += Date.now() - at;
    pausedAtRef.current = null;
    // Everything from here belongs to a new segment, so the distance
    // covered while paused is never folded into the total.
    segmentRef.current += 1;
    setStatusBoth('running');
    sync();
  }, [sync]);

  const stop = useCallback(async () => {
    const current = statusRef.current;
    if (current !== 'running' && current !== 'paused') return;

    // 1. Freeze the clock NOW — before any await.
    const durationSeconds = Math.round(elapsedNow());
    if (pausedAtRef.current != null) {
      pausedMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }

    const points = routeRef.current.points;
    const startedAtMs = startedAtRef.current;

    if (points.length < 2) {
      setStatusBoth('saving'); // still paint something
      await stopWatch();
      setError('Not enough GPS data yet — walk or run a little further.');
      setStatusBoth('error');
      return;
    }

    // 2. Paint "SAVING…" immediately, then tear down GPS.
    setStatusBoth('saving');
    void stopWatch();

    // 3. Build the payload up-front so a failed upload can be retried.
    pendingRef.current = {
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(startedAtMs + durationSeconds * 1000).toISOString(),
      durationSeconds,
      points: points.map((p) => ({
        lat: p.lat,
        lon: p.lon,
        time: p.time,
        altitude: p.altitude ?? null,
        speed: p.speed ?? null,
        accuracy: p.accuracy ?? null,
        segment: p.segment ?? 0,
      })),
    };

    await persist();
  }, [elapsedNow, persist, stopWatch]);

  const retrySave = useCallback(() => {
    if (!pendingRef.current || statusRef.current !== 'error') return;
    setStatusBoth('saving');
    void persist();
  }, [persist]);

  const reset = useCallback(async () => {
    await stopWatch();
    routeRef.current = emptyRoute();
    startedAtRef.current = 0;
    pausedMsRef.current = 0;
    pausedAtRef.current = null;
    segmentRef.current = 0;
    pendingRef.current = null;
    chipSpeedRef.current = -1;
    lastAcceptedAtRef.current = 0;
    setFixCount(0);
    setSavedRun(null);
    setCanRetry(false);
    setError(null);
    setSnapshot(EMPTY);
    setStatusBoth('idle');
  }, [stopWatch]);

  const discardRun = useCallback(async () => {
    pendingRef.current = null;
    setCanRetry(false);
    await reset();
  }, [reset]);

  return {
    status,
    snapshot,
    error,
    savedRun,
    canRetry,
    fixCount,
    start,
    pause,
    resume,
    stop,
    retrySave,
    discardRun,
    reset,
  };
}
