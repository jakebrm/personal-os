'use client';
import { useState, useEffect, useCallback } from 'react';
import { useDemo } from '../dashboard/DemoContext';
import { buildDemoWellness, buildDemoActivities, buildDemoWeight } from '@/lib/demoData';

export type WellnessRow = {
  id?: string;
  date: string;
  user_id?: string;
  sleep_score:         number | null;
  sleep_duration_min:  number | null;
  sleep_deep_min:      number | null;
  sleep_light_min:     number | null;
  sleep_rem_min:       number | null;
  sleep_awake_min:     number | null;
  hrv:                 number | null;
  resting_hr:          number | null;
  vo2_max:             number | null;
  body_battery:        number | null;  // null for Garmin via Intervals.icu
  respiration_rate:    number | null;
  spo2:                number | null;
  stress:              number | null;
  steps:               number | null;  // daily steps from Intervals.icu
  ctl:                 number | null;  // chronic training load (fitness)
  atl:                 number | null;  // acute training load (fatigue)
  source?:             string;
};

export type StravaRow = {
  id: number; name: string; sport_type: string; distance_m: number;
  duration_sec: number; elevation_m: number; avg_hr: number | null;
  max_hr: number | null; calories: number | null; date: string; source: string;
  // Enriched summary fields (0019 migration) — null on rows synced before it
  relative_effort?: number | null;
  avg_speed_ms?: number | null;
  max_speed_ms?: number | null;
  avg_cadence?: number | null;
  avg_watts?: number | null;
  pr_count?: number | null;
  achievement_count?: number | null;
  kudos_count?: number | null;
};

// ── Strava HR zones ───────────────────────────────────────────────────────────

export type HrZone = { min: number; max: number | null };

export function useStravaZones() {
  return useFetch<{ zones: HrZone[]; source: string }>('/api/health/strava/zones');
}

/** Which 1-5 zone an avg HR falls in, using real Strava boundaries. */
export function hrZoneIndex(avgHr: number, zones: HrZone[]): number {
  for (let i = zones.length - 1; i >= 0; i--) {
    if (avgHr >= zones[i].min) return i + 1;
  }
  return 1;
}

export type BodyLog = {
  id: string; date: string; weight_lbs: number; body_fat_pct: number | null; notes: string | null; source: string;
};

export type Biomarker = {
  id: string; date: string; test_source: string; marker_name: string;
  value: number | null; unit: string; reference_low: number | null; reference_high: number | null; notes: string | null;
};

export type BiomarkerGroup = {
  date: string; test_source: string; markers: Biomarker[];
};

export type NutritionLog = {
  id: string; date: string; calories: number | null; protein_g: number | null;
  carbs_g: number | null; fat_g: number | null; fiber_g: number | null;
  water_ml: number | null; source: string; meals: unknown;
};

// ── Weekly nutrition targets (set by the nutritionist skill) ──────────────────

export type DayType = 'rest' | 'lift' | 'run' | 'double';

export type NutritionTargets = {
  id: string;
  week_start: string;
  weight_lb: number | null;
  goal: 'cut' | 'maintain' | 'lean-bulk';
  protein_g: number;
  fat_g: number;
  water_ml: number;
  kcal_rest: number;
  kcal_lift: number;
  kcal_run: number;
  kcal_double: number;
  carbs_rest: number | null;
  carbs_lift: number | null;
  carbs_run: number | null;
  carbs_double: number | null;
  rationale: string | null;
};

// ── Fetch hook ────────────────────────────────────────────────────────────────

function useFetch<T>(url: string, enabled = true) {
  const [data, setData]         = useState<T | null>(null);
  const [loading, setLoading]   = useState(enabled);
  const [error, setError]       = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true); setError(null); setNeedsAuth(false);
    try {
      const res  = await fetch(url);
      const json = await res.json() as { error?: string; needsAuth?: boolean };
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setNeedsAuth(json.needsAuth ?? res.status === 401);
        setData(null);
      } else {
        setData(json as unknown as T);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [url, enabled]);

  useEffect(() => { load(); }, [load]);

  // Cross-tab refresh: anything that writes health data (e.g. the Water habit
  // filling nutrition_logs) dispatches 'health:refetch' with a url fragment.
  useEffect(() => {
    const onRefetch = (e: Event) => {
      const tag = (e as CustomEvent).detail as string | undefined;
      if (!tag || url.includes(tag)) load();
    };
    window.addEventListener('health:refetch', onRefetch);
    return () => window.removeEventListener('health:refetch', onRefetch);
  }, [url, load]);

  return { data, loading, error, needsAuth, refetch: load };
}

const DEMO_NOOP = () => Promise.resolve();

export function useWellness() {
  const { isDemo } = useDemo();
  const real = useFetch<WellnessRow[]>('/api/health/garmin', !isDemo);
  if (isDemo) return { data: buildDemoWellness() as unknown as WellnessRow[], loading:false, error:null, needsAuth:false, refetch:DEMO_NOOP };
  return real;
}
export function useActivities() {
  const { isDemo } = useDemo();
  const real = useFetch<StravaRow[]>('/api/health/strava', !isDemo);
  if (isDemo) return { data: buildDemoActivities() as unknown as StravaRow[], loading:false, error:null, needsAuth:false, refetch:DEMO_NOOP };
  return real;
}
export function useWeight() {
  const { isDemo } = useDemo();
  const real = useFetch<BodyLog[]>('/api/health/weight', !isDemo);
  if (isDemo) return { data: buildDemoWeight() as unknown as BodyLog[], loading:false, error:null, needsAuth:false, refetch:DEMO_NOOP };
  return real;
}
export function useBiomarkers()  { return useFetch<BiomarkerGroup[]>('/api/health/biomarkers'); }
export function useNutrition()   { return useFetch<NutritionLog[]>('/api/health/nutrition'); }
export function useNutritionTargets() {
  return useFetch<{ current: NutritionTargets | null; history: NutritionTargets[] }>('/api/health/nutrition-targets');
}

export type WorkoutRow = {
  id: string;
  date: string;
  type: string;
  name: string;
  duration_min: number | null;
  distance_m:   number | null;
  calories:     number | null;
  avg_hr:       number | null;
};

export function useWorkouts() {
  return useFetch<WorkoutRow[]>('/api/health/workouts');
}


// ── Statistics helpers ────────────────────────────────────────────────────────

export function rollingAvg(vals: (number | null)[], window: number): (number | null)[] {
  return vals.map((_, i) => {
    const slice = vals.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

export function avg(vals: (number | null)[], n?: number): number | null {
  const recent = n != null ? vals.slice(-n) : vals;
  const valid  = recent.filter((v): v is number => v != null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

// ── Readiness score ───────────────────────────────────────────────────────────

export type ReadinessFactor = {
  label: string;
  value: string;
  score: number;    // 0-100 for this factor
  note:  string;
};

// Lightweight version used by the dashboard mini-card (HealthCard.tsx)
export function computeReadiness(rows: WellnessRow[]): number | null {
  const full = computeReadinessFull(rows);
  return full?.score ?? null;
}

// Full version used by ReadinessRing in the Health deep view
export function computeReadinessFull(
  rows: WellnessRow[],
): { score: number; factors: ReadinessFactor[] } | null {
  if (!rows.length) return null;
  // Use most recent row that has at least one key metric — today's Garmin sync
  // can arrive with nulls for HRV/sleep while the day before is fully populated.
  const last = [...rows].reverse().find(r => r.hrv || r.resting_hr || r.sleep_score)
    ?? rows[rows.length - 1];
  if (!last.hrv && !last.resting_hr && !last.sleep_score) return null;

  const r7 = rows.slice(-7);
  const hrv7   = avg(r7.map(r => r.hrv));
  const rhr7   = avg(r7.map(r => r.resting_hr));

  // HRV: today vs 7-day avg — higher is better; ratio·50 gives 50 at neutral
  const hrvScore = (last.hrv && hrv7)
    ? Math.min(100, Math.max(0, (last.hrv / hrv7) * 50))
    : 50;

  // RHR: lower than avg is better; 50 at neutral
  const rhrScore = (last.resting_hr && rhr7)
    ? Math.min(100, Math.max(0, ((rhr7 - last.resting_hr) / rhr7 + 1) * 50))
    : 50;

  // Sleep: direct 0-100 score
  const sleepScore = last.sleep_score ?? 50;

  // Load: CTL-ATL (Training Stress Balance). Positive TSB = more rested.
  // +25 → 100, 0 → 50, -25 → 0.  Falls back to 50 when unavailable.
  const tsb = (last.ctl != null && last.atl != null) ? last.ctl - last.atl : null;
  const loadScore = tsb != null ? Math.min(100, Math.max(0, 50 + tsb * 2)) : 50;

  const score = Math.round(hrvScore * 0.35 + rhrScore * 0.25 + sleepScore * 0.25 + loadScore * 0.15);

  const factors: ReadinessFactor[] = [
    {
      label: 'HRV',
      value: last.hrv != null ? `${last.hrv} ms` : '—',
      score: Math.round(hrvScore),
      note:  hrv7 ? `7d avg ${Math.round(hrv7)} ms` : '',
    },
    {
      label: 'Resting HR',
      value: last.resting_hr != null ? `${last.resting_hr} bpm` : '—',
      score: Math.round(rhrScore),
      note:  rhr7 ? `7d avg ${Math.round(rhr7)} bpm` : '',
    },
    {
      label: 'Sleep',
      value: last.sleep_score != null ? `${last.sleep_score}/100` : '—',
      score: Math.round(sleepScore),
      note:  '',
    },
    {
      label: 'Training Load',
      value: tsb != null ? `TSB ${tsb > 0 ? '+' : ''}${tsb.toFixed(1)}` : '—',
      score: Math.round(loadScore),
      note:  last.ctl != null ? `CTL ${Math.round(last.ctl)}` : '',
    },
  ];

  return { score, factors };
}

export function readinessLabel(score: number): { label: string; note: string; color: string } {
  if (score >= 75) return { label: 'Ready',    note: 'Recovery is strong — good day to train hard',    color: 'var(--ok)'     };
  if (score >= 50) return { label: 'Moderate', note: 'Solid recovery — moderate effort is fine',       color: 'var(--warn)'   };
  if (score >= 25) return { label: 'Easy day', note: 'Low recovery — keep it light or rest',           color: 'oklch(0.72 0.12 40)' };
  return               { label: 'Rest',      note: 'Recovery priority — avoid hard training today', color: 'var(--danger)' };
}

// ── Date / format helpers ─────────────────────────────────────────────────────

export function fmtMin(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtHrs(min: number): string {
  return `${(min / 60).toFixed(1)}h`;
}

export const RACE_DATE = new Date('2026-09-12');
export function weeksToRace(): number {
  return Math.max(0, Math.ceil((RACE_DATE.getTime() - Date.now()) / (7 * 86400_000)));
}

// ── Sport classifiers ─────────────────────────────────────────────────────────

export function sportIcon(type: string): string {
  const t = (type ?? '').toLowerCase();
  if (t.includes('run') || t.includes('hike')) return '↗';
  if (t.includes('ride') || t.includes('bike') || t.includes('cycling')) return '◎';
  if (t.includes('swim')) return '≈';
  if (t.includes('weight') || t.includes('strength') || t.includes('workout')) return '◰';
  return '◇';
}

export function sportTab(type: string): 'run' | 'bike' | 'swim' | 'lift' | 'other' {
  const t = (type ?? '').toLowerCase();
  if (t.includes('run') || t.includes('hike')) return 'run';
  if (t.includes('ride') || t.includes('bike') || t.includes('cycling')) return 'bike';
  if (t.includes('swim')) return 'swim';
  if (t.includes('weight') || t.includes('strength') || t.includes('workout') || t.includes('crossfit')) return 'lift';
  return 'other';
}
