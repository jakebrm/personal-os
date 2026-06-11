// ── Strava ────────────────────────────────────────────────────────────────────

export type StravaActivity = {
  id:                    number;
  name:                  string;
  sport_type:            string;
  distance:              number;       // metres
  moving_time:           number;       // seconds
  elapsed_time:          number;
  total_elevation_gain:  number;       // metres
  average_speed:         number;       // m/s
  max_speed:             number;
  average_heartrate?:    number;
  max_heartrate?:        number;
  kilojoules?:           number;
  calories?:             number;
  start_date_local:      string;       // ISO local
  suffer_score?:         number;
};

// ── Intervals.icu / Garmin Wellness ──────────────────────────────────────────

export type WellnessDay = {
  id:                string;   // YYYY-MM-DD
  ctl?:              number;   // chronic training load (fitness)
  atl?:              number;   // acute training load (fatigue)
  form?:             number;   // TSB = CTL − ATL
  restingHR?:        number;
  hrv?:              number;
  bodyBattery?:      number;
  sleepSecs?:        number;
  sleepScore?:       number;
  sleepDeepSecs?:    number;
  sleepLightSecs?:   number;
  sleepRemSecs?:     number;
  sleepAwakeSecs?:   number;
  vo2max?:           number;
  steps?:            number;
  dailyStressAvg?:   number;
  intensityMins?:    number;
  highIntensityMins?:number;
  floorsClimbed?:    number;
  calories?:         number;
};

// ── Manual entry types ────────────────────────────────────────────────────────

export type WeightEntry = {
  date:   string;  // YYYY-MM-DD
  weight: number;  // lbs
};

export type BiomarkerDef = {
  key:   string;
  label: string;
  unit:  string;
};

export type BiomarkerEntry = {
  date:   string;
  values: Record<string, number>;
};

// ── Formatters ────────────────────────────────────────────────────────────────

export function mToMi(m: number):  string { return (m / 1609.34).toFixed(1); }
export function mToKm(m: number):  string { return (m / 1000).toFixed(1); }

export function secToHM(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// metres/second → min/mile pace string
export function msToMinMi(ms: number): string {
  const mpm = 1609.34 / ms / 60;
  const mins = Math.floor(mpm);
  const secs = Math.round((mpm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')} /mi`;
}

// metres/second → mph
export function msToMph(ms: number): string { return (ms * 2.237).toFixed(1); }

export function sportIcon(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('run') || t.includes('hike') || t.includes('walk')) return '↗';
  if (t.includes('ride') || t.includes('bike') || t.includes('cycling') || t.includes('virtual')) return '◎';
  if (t.includes('swim')) return '≈';
  if (t.includes('weight') || t.includes('strength') || t.includes('crossfit')) return '◰';
  if (t.includes('yoga') || t.includes('stretch')) return '◈';
  return '◇';
}

export function sportLabel(type: string): string {
  const map: Record<string, string> = {
    WeightTraining: 'Weights', VirtualRide: 'Virtual Ride',
    EBikeRide: 'E-Bike', Workout: 'Workout', GravelRide: 'Gravel Ride',
  };
  return map[type] ?? type;
}

// ── Training load / recovery ──────────────────────────────────────────────────

export function recoveryStatus(form: number) {
  if (form > 5)   return { label: 'Fresh',      color: 'var(--ok)',     rec: 'Hard effort OK' };
  if (form > -10) return { label: 'Neutral',    color: 'var(--accent)', rec: 'Moderate effort' };
  if (form > -20) return { label: 'Tired',      color: 'var(--warn)',   rec: 'Easy day recommended' };
  return               { label: 'Very tired', color: 'var(--danger)', rec: 'Rest day recommended' };
}

// ── Statistics ────────────────────────────────────────────────────────────────

export function rollingAvg(data: number[], window: number): number[] {
  return data.map((_, i) => {
    const sl = data.slice(Math.max(0, i - window + 1), i + 1);
    return sl.reduce((a, b) => a + b, 0) / sl.length;
  });
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysAgoKey(n: number): string {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]} ${d.getDate()}`;
}

// ── Weekly volume helpers ─────────────────────────────────────────────────────

export function thisWeekStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); // Monday
  return d.toISOString().slice(0, 10);
}

export function lastWeekStart(): string {
  const d = new Date(thisWeekStart());
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
