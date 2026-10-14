/** Mirror of the shapes produced by the RunTrack API. */

export type RunStatus = 'active' | 'completed' | 'discarded';

export interface Run {
  id: string;
  status: RunStatus;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  distanceMeters: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  avgPaceSecPerKm: number;
  calories: number;
  elevationGainMeters: number;
  steps: number;
  note: string | null;
  createdAt: string;
}

export interface RoutePoint {
  id: number;
  runId: string;
  seq: number;
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  accuracy: number | null;
  recordedAt: string;
}

export interface RunSplit {
  id: number;
  runId: string;
  index: number;
  distanceMeters: number;
  durationSeconds: number;
  paceSecPerKm: number;
  elevationGainMeters: number;
}

export interface RunDetail {
  run: Run;
  points: RoutePoint[];
  splits: RunSplit[];
}

export interface PeriodStats {
  distanceMeters: number;
  durationSeconds: number;
  calories: number;
  runCount: number;
  avgPaceSecPerKm: number;
  avgSpeedKmh: number;
}

export interface Dashboard {
  today: PeriodStats;
  week: PeriodStats;
  month: PeriodStats;
  allTime: PeriodStats;
  streakDays: number;
  totalRuns: number;
}

export interface ChartBucket {
  key: string;
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  runCount: number;
}

export interface PersonalRecords {
  longestRunMeters: number;
  longestDurationSeconds: number;
  fastestKmPaceSec: number | null;
  bestWeekKm: number;
  bestMonthKm: number;
  totalRuns: number;
  totalDistanceMeters: number;
}

export interface Profile {
  id: string;
  displayName: string;
  weightKg: number;
  strideMeters: number;
  createdAt: string;
}

export interface CreateRunPayload {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  note?: string;
  steps?: number;
  points: {
    lat: number;
    lon: number;
    time: number;
    altitude?: number | null;
    speed?: number | null;
    accuracy?: number | null;
    segment?: number;
  }[];
}

export interface CreateRunResponse {
  run: Run;
  splits: Omit<RunSplit, 'id' | 'runId'>[];
  pointsSaved: number;
}
