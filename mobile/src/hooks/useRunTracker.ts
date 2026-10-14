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
import { classifyActivity, type Activity } from '../lib/activity';
import {
  readLivePoints,
  resetLivePoints,
} from '../background/locationTask';
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
  /** AVERAGE over the whole run — what gets saved. */
  avgSpeedKmh: number;
  avgPaceSecPerKm: number;
  maxSpeedKmh: number;
  elevationGainMeters: number;
  /** RIGHT NOW, straight from the GPS chip. 0 when standing still. */
  currentSpeedKmh: number;
  currentPaceSecPerKm: number;
  isMoving: boolean;
  /** walk / jog / run / sprint — derived from current speed. */
  activity: Activity;
  points: TrackPoint[];
  coords: { latitude: number; longitude: number; heading: number | null } | null;
}

const EMPTY: Snapshot = {
  elapsedSeconds: 0,
  distanceMeters: 0,
  avgSpeedKmh: 0,
  avgPaceSecPerKm: 0,
  maxSpeedKmh: 0,
  elevationGainMeters: 0,
  currentSpeedKmh: 0,
  currentPaceSecPerKm: 0,
  isMoving: false,
  activity: 'still',
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
  /** False when the OS refused background location — runs may drop on screen-off. */
  backgroundTracking: boolean;
  fixCount: number;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
  retrySave: () => void;
  discardRun: () => Promise<void>;
  reset: () => Promise<void>;
}

/** One PAUSE → RESUME interval. Used to label stored fixes with a segment. */
interface SegmentRange {
  start: number;
  end: number | null;
  seg: number;
}

/**
 * The heart of RunTrack.
 *
 * Two independent GPS sources, deliberately writing to different places:
 *
 *   background task ──► AsyncStorage   (survives screen-off / app blur)
 *   foreground watch ─► routeRef       (instant on-screen feedback)
 *                              ▲
 *                              └── polled ~1×/s and merged by timestamp
 *
 * The clock is *derived* from timestamps, never a +1 counter:
 *     elapsed = now − startedAt − pausedDuration
 *
 * Status flips BEFORE any `await` so a tap paints on the next frame.
 */
export function useRunTracker(): RunTracker {
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [savedRun, setSavedRun] = useState<Run | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [backgroundTracking, setBackgroundTracking] = useState(false);
  const [fixCount, setFixCount] = useState(0);

  const routeRef = useRef<LiveRouteState>(emptyRoute());
  const startedAtRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const statusRef = useRef<TrackerStatus>('idle');
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const chipSpeedRef = useRef(-1);
  const lastAcceptedAtRef = useRef(0);
  const pendingRef = useRef<CreateRunPayload | null>(null);
  /** Times already folded into routeRef, so a point is never counted twice. */
  const mergedTimesRef = useRef<Set<number>>(new Set());
  const rangesRef = useRef<SegmentRange[]>([]);
  const bgRunningRef = useRef(false);

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

  /** Which PAUSE→RESUME interval did this fix fall into? */
  const segmentForTime = (t: number): number => {
    const ranges = rangesRef.current;
    for (const r of ranges) {
      if (t >= r.start && (r.end == null || t <= r.end)) return r.seg;
    }
    return ranges[ranges.length - 1]?.seg ?? 0;
  };

  const sync = useCallback(() => {
    const route = routeRef.current;
    const elapsed = elapsedNow();
    const km = route.distanceMeters / 1000;
    const hours = elapsed / 3600;

    const avgSpeedKmh = km > 0 && hours > 0 ? km / hours : 0;
    const avgPaceSecPerKm = km > 0 ? elapsed / km : 0;

    const pts = route.points;
    let impliedMps = 0;
    if (pts.length >= 2) {
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      const dt = (b.time - a.time) / 1000;
      if (dt > 0) impliedMps = haversineMeters(a, b) / dt;
    }

    const chip = chipSpeedRef.current;
    const rawMps = chip > 0 ? chip : impliedMps;
    const fresh = Date.now() - lastAcceptedAtRef.current < 6000;
    const isMoving = rawMps >= MOVING_MIN_MPS && (chip > 0 || fresh);
    const currentMps = isMoving ? rawMps : 0;

    setSnapshot({
      elapsedSeconds: elapsed,
      distanceMeters: route.distanceMeters,
      avgSpeedKmh,
      avgPaceSecPerKm,
      maxSpeedKmh: route.maxSpeedKmh,
      elevationGainMeters: route.elevationGainMeters,
      currentSpeedKmh: currentMps * 3.6,
      currentPaceSecPerKm: currentMps > 0 ? 1000 / currentMps : 0,
      isMoving,
      activity: classifyActivity(currentMps),
      points: route.points,
      // Keep the last known position so the camera does not jump to null.
      coords: route.points.length
        ? {
            latitude: route.points[route.points.length - 1].lat,
            longitude: route.points[route.points.length - 1].lon,
            heading: null,
          }
        : null,
    });
  }, [elapsedNow]);

  /* ---------------- stopwatch ticker ---------------- */
  useEffect(() => {
    if (status !== 'running' && status !== 'paused') return;
    const id = setInterval(() => sync(), 250);
    return () => clearInterval(id);
  }, [status, sync]);

  /* ---------------- merge the background track ---------------- */
  useEffect(() => {
    if (status !== 'running' && status !== 'paused') return;

    let cancelled = false;
    const mergeOnce = async () => {
      const stored = await readLivePoints();
      if (cancelled || stored.length === 0) return;

      const seen = mergedTimesRef.current;
      let added = false;
      for (const p of stored) {
        if (seen.has(p.time)) continue;
        seen.add(p.time);
        // The task cannot know the segment, so we stamp it from the clock.
        routeRef.current = appendPoint(routeRef.current, {
          ...p,
          segment: segmentForTime(p.time),
        });
        added = true;
      }
      if (added) {
        lastAcceptedAtRef.current = Date.now();
        setFixCount(seen.size);
        sync();
      }
    };

    void mergeOnce();
    const id = setInterval(() => void mergeOnce(), 700);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [status, sync]);

  /* ---------------- foreground watch (instant feedback) ---------------- */
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
        const time = loc.timestamp;
        if (mergedTimesRef.current.has(time)) return;
        mergedTimesRef.current.add(time);

        const before = routeRef.current.points.length;
        routeRef.current = appendPoint(routeRef.current, {
          lat: c.latitude,
          lon: c.longitude,
          time,
          altitude: c.altitude ?? null,
          speed: c.speed ?? null,
          accuracy: c.accuracy ?? null,
          segment: segmentForTime(time),
        });

        chipSpeedRef.current = c.speed != null && c.speed > 0 ? c.speed : -1;
        if (routeRef.current.points.length > before) {
          lastAcceptedAtRef.current = Date.now();
        }

        setFixCount(mergedTimesRef.current.size);
        sync();
      },
    );
  }, [stopWatch, sync]);

  useEffect(() => () => void stopWatch(), [stopWatch]);

  /* ---------------- background location ---------------- */
  const startBackground = useCallback(async () => {
    try {
      await Location.startLocationUpdatesAsync('runtrack-bg-location', {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 3,
        deferredUpdatesInterval: 2000,
        foregroundService: {
          notificationTitle: 'RunTrack is tracking your run',
          notificationBody: 'Distance, pace and your route are being recorded.',
          notificationColor: '#22D3EE',
          killServiceOnDestroy: false,
        },
      });
      bgRunningRef.current = true;
      setBackgroundTracking(true);
      return true;
    } catch (err) {
      console.warn('[runtrack] background location unavailable:', err);
      bgRunningRef.current = false;
      setBackgroundTracking(false);
      return false;
    }
  }, []);

  const stopBackground = useCallback(async () => {
    if (!bgRunningRef.current) return;
    bgRunningRef.current = false;
    try {
      await Location.stopLocationUpdatesAsync('runtrack-bg-location');
    } catch {
      // Already stopped — nothing to do.
    }
  }, []);

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

    // Foreground permission is mandatory.
    let { status: perm } = await Location.getForegroundPermissionsAsync();
    if (perm !== 'granted') {
      setStatusBoth('requesting');
      ({ status: perm } = await Location.requestForegroundPermissionsAsync());
    }
    if (perm !== 'granted') {
      setError('Location permission is required to track a run.');
      setStatusBoth('error');
      return;
    }

    // Background permission is what keeps the GPS alive once the screen
    // locks — without it a 20 minute run records about 20 seconds.
    setBackgroundTracking(false);
    setStatusBoth('requesting');
    try {
      const bg = await Location.getBackgroundPermissionsAsync();
      if (bg.status !== 'granted') {
        await Location.requestBackgroundPermissionsAsync();
      }
    } catch {
      // iOS without the background mode, or the dialog was dismissed.
    }

    routeRef.current = emptyRoute();
    mergedTimesRef.current = new Set();
    rangesRef.current = [{ start: Date.now(), end: null, seg: 0 }];
    startedAtRef.current = Date.now();
    pausedMsRef.current = 0;
    pausedAtRef.current = null;
    chipSpeedRef.current = -1;
    lastAcceptedAtRef.current = Date.now();
    setFixCount(0);
    setSnapshot(EMPTY);

    await resetLivePoints();

    setStatusBoth('running');
    void startWatch();
    void startBackground();
  }, [startBackground, startWatch]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'running') return;
    pausedAtRef.current = Date.now();
    // Close the current segment so post-resume fixes are stamped correctly.
    const ranges = rangesRef.current;
    const current = ranges[ranges.length - 1];
    if (current && current.end == null) current.end = pausedAtRef.current;
    void stopBackground();
    setStatusBoth('paused');
    sync();
  }, [stopBackground, sync]);

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return;
    const at = pausedAtRef.current;
    if (at != null) pausedMsRef.current += Date.now() - at;
    pausedAtRef.current = null;

    const ranges = rangesRef.current;
    const nextSeg = (ranges[ranges.length - 1]?.seg ?? 0) + 1;
    ranges.push({ start: Date.now(), end: null, seg: nextSeg });

    setStatusBoth('running');
    void startBackground();
    sync();
  }, [startBackground, sync]);

  const stop = useCallback(async () => {
    const current = statusRef.current;
    if (current !== 'running' && current !== 'paused') return;

    // 1. Freeze the clock BEFORE any await.
    const durationSeconds = Math.round(elapsedNow());
    if (pausedAtRef.current != null) {
      pausedMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }

    const ranges = rangesRef.current;
    const open = ranges[ranges.length - 1];
    if (open && open.end == null) open.end = Date.now();

    // 2. Paint "SAVING…" immediately, then tear both GPS sources down.
    setStatusBoth('saving');
    void stopWatch();
    await stopBackground();

    // 3. Pull in anything the background task collected that the foreground
    //    watch never saw (the screen-off stretch).
    const stored = await readLivePoints();
    const seen = mergedTimesRef.current;
    for (const p of stored) {
      if (seen.has(p.time)) continue;
      seen.add(p.time);
      routeRef.current = appendPoint(routeRef.current, {
        ...p,
        segment: segmentForTime(p.time),
      });
    }

    const points = routeRef.current.points;
    const startedAtMs = startedAtRef.current;

    if (points.length < 2) {
      setError('Not enough GPS data yet — walk or run a little further.');
      setStatusBoth('error');
      return;
    }

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
  }, [elapsedNow, persist, stopBackground, stopWatch]);

  const retrySave = useCallback(() => {
    if (!pendingRef.current || statusRef.current !== 'error') return;
    setStatusBoth('saving');
    void persist();
  }, [persist]);

  const reset = useCallback(async () => {
    await stopWatch();
    await stopBackground();
    await resetLivePoints();
    routeRef.current = emptyRoute();
    mergedTimesRef.current = new Set();
    rangesRef.current = [];
    startedAtRef.current = 0;
    pausedMsRef.current = 0;
    pausedAtRef.current = null;
    pendingRef.current = null;
    chipSpeedRef.current = -1;
    lastAcceptedAtRef.current = 0;
    setFixCount(0);
    setSavedRun(null);
    setCanRetry(false);
    setError(null);
    setBackgroundTracking(false);
    setSnapshot(EMPTY);
    setStatusBoth('idle');
  }, [stopBackground, stopWatch]);

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
    backgroundTracking,
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
