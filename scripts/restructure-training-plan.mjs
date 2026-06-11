// One-off: restructure the half-marathon plan into a push/pull/legs split
// with runs in between, no rest days, and doubles on some days.
// Preserves every existing run session verbatim; rebuilds the strength side.
import { readFileSync, writeFileSync } from 'fs';

const FILE = 'red-white-blue-half-2026-07-18.json';
const MI = 1609.34;
const plan = JSON.parse(readFileSync(FILE, 'utf8'));

const miToM = (mi) => Math.round(mi * MI);

// ── Strength session library (running-specific) ──────────────────────────────
const LIFTS = {
  push: (min) => ({
    sport: 'strength', type: 'push', name: 'Push (Chest/Shoulders/Tri)',
    description: 'Upper-body push. Legs stay fresh for running.',
    durationMinutes: min, primaryZone: 'Strength',
    humanReadable:
`Warm-up: band pull-aparts, arm circles — 5min
Main:
- DB Bench Press        4x8
- Standing OHP          3x8
- Incline DB Press      3x10
- Lateral Raises        3x12
- Triceps Pushdown      3x12
Keep 1-2 reps in reserve. Upper-body only — this won't touch your run legs.`,
  }),
  pull: (min) => ({
    sport: 'strength', type: 'pull', name: 'Pull (Back/Biceps)',
    description: 'Upper-body pull for posture and arm drive.',
    durationMinutes: min, primaryZone: 'Strength',
    humanReadable:
`Warm-up: scap pull-ups, band face pulls — 5min
Main:
- Pull-ups / Lat Pulldown  4x8
- One-Arm DB Row           3x10/side
- Seated Cable Row         3x10
- Face Pulls               3x15
- DB Biceps Curl           3x12
Controlled tempo, full range of motion.`,
  }),
  legs: (min, light = false) => ({
    sport: 'strength', type: 'legs', name: light ? 'Legs (Light/Maintenance)' : 'Legs (Strength-Endurance)',
    description: light
      ? 'Light leg maintenance — stay sharp without soreness.'
      : 'Runner-focused leg strength. Run FIRST, lift second.',
    durationMinutes: min, primaryZone: 'Strength',
    humanReadable: light
      ? `Warm-up: leg swings, glute bridges — 5min
Main (light, 3 RIR):
- Goblet Squat           3x8
- Romanian Deadlift      2x8
- Single-Leg Calf Raise  3x15/side
Stay well shy of failure. Goal is freshness, not fatigue.`
      : `Warm-up: leg swings, bodyweight squats, glute bridges — 8min
Main (moderate, 2 RIR):
- Back / Goblet Squat       4x6
- Romanian Deadlift         3x8
- Walking Lunges            3x10/side
- Single-Leg Calf Raise     3x15/side
- Nordic / Hamstring Curl   3x6
Run first, lift second. Moderate loads — strong, not sore. Skip if legs are trashed.`,
  }),
  core: (min) => ({
    sport: 'strength', type: 'core', name: 'Core',
    description: 'Trunk stability for running economy.',
    durationMinutes: min, primaryZone: 'Core',
    humanReadable:
`3 rounds:
- Front Plank        45s
- Side Plank         30s/side
- Dead Bug           10/side
- Pallof Press       12/side
- Hanging Leg Raise  10
Brace and breathe — no momentum.`,
  }),
};

function z2Run(miles, min, note) {
  return {
    sport: 'run', type: 'easy', name: 'Zone 2 Easy Run',
    description: 'Pure aerobic base — fully conversational.',
    durationMinutes: min, distanceMeters: miToM(miles), primaryZone: 'Zone 2',
    humanReadable:
`${miles}mi easy @ 10:00-10:30/mi (HR 139-153)
Fully aerobic, conversation pace the whole way.
${note}`,
  };
}

// Strip ids so the seed/DB get a clean rebuild; assign fresh per-day ids below.
const clean = (w) => { const { id, completed, ...rest } = w; return rest; };

// ── Per-week rebuild ─────────────────────────────────────────────────────────
// Weeks 1-5 get the new structure. Week 6 (taper/race) is left untouched.
for (const week of plan.weeks) {
  const N = week.weekNumber;
  if (N === 6) continue; // protect the taper

  const runs = week.days.flatMap((d) => d.workouts).filter((w) => w.sport === 'run');
  const longRun     = runs.find((w) => w.type === 'long');
  const recoveryRun = runs.find((w) => w.type === 'recovery');
  const otherRuns   = runs.filter((w) => w !== longRun && w !== recoveryRun); // [quality, easy]
  const qualityRun = otherRuns[0];
  const easyRun    = otherRuns[1] ?? otherRuns[0];

  const sharpen = N === 5;
  const peak    = N === 4;

  // Lift durations taper across the block.
  const upperMin = sharpen ? 30 : 40;
  const legsMin  = sharpen ? 30 : 45;
  const coreMin  = sharpen ? 20 : 25;
  const monMiles = sharpen ? 2.5 : 3;
  const friMiles = peak ? 2 : sharpen ? 2 : 3;

  const byDow = Object.fromEntries(week.days.map((d) => [d.dayOfWeek, d]));
  const dows = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const layout = {
    Monday:    [z2Run(monMiles, sharpen ? 25 : 30, 'No rest today — easy aerobic spin to open the week.'),
                LIFTS.push(upperMin)],
    Tuesday:   [clean(qualityRun), LIFTS.legs(legsMin, sharpen)],
    Wednesday: [LIFTS.pull(upperMin), LIFTS.core(coreMin)],
    Thursday:  [clean(easyRun)],
    Friday:    [z2Run(friMiles, friMiles <= 2 ? 22 : 30, 'Short and easy — keep the legs fresh for the long run.')],
    Saturday:  [clean(longRun)],
    Sunday:    [clean(recoveryRun), LIFTS.core(20)],
  };

  // Reassign clean per-day ids and write back into each day.
  week.days = dows.map((dow) => {
    const day = byDow[dow];
    const workouts = layout[dow].map((w, i) => ({
      id: `w${N}-${dow.slice(0, 3).toLowerCase()}-${w.sport === 'run' ? 'run' : w.type}${layout[dow].filter((x, j) => j < i && (x.type === w.type)).length ? '2' : ''}`,
      ...w,
      completed: false,
    }));
    return { date: day.date, dayOfWeek: dow, workouts };
  });

  // Recompute the week summary from the new sessions.
  const all = week.days.flatMap((d) => d.workouts);
  const runWk = all.filter((w) => w.sport === 'run');
  const strWk = all.filter((w) => w.sport === 'strength');
  const sum = (arr, f) => arr.reduce((s, w) => s + (f(w) || 0), 0);
  week.summary = {
    totalHours: Math.round((sum(all, (w) => w.durationMinutes) / 60) * 10) / 10,
    bySport: {
      run: {
        sessions: runWk.length,
        hours: Math.round((sum(runWk, (w) => w.durationMinutes) / 60) * 10) / 10,
        miles: Math.round(sum(runWk, (w) => w.distanceMeters) / MI * 10) / 10,
      },
      strength: {
        sessions: strWk.length,
        hours: Math.round((sum(strWk, (w) => w.durationMinutes) / 60) * 10) / 10,
        miles: 0,
      },
    },
  };
  week.targetHours = week.summary.totalHours;
  week.focus = week.focus + ' · PPL strength + doubles';
}

plan.meta.updatedAt = new Date().toISOString();
writeFileSync(FILE, JSON.stringify(plan, null, 2));

// Report
console.log('Plan restructured. New weekly layout:\n');
for (const w of plan.weeks) {
  console.log(`── Week ${w.weekNumber} (${w.phase}) — ${w.summary?.bySport?.run?.miles ?? '?'}mi run, ${w.summary?.bySport?.strength?.sessions ?? 0} lifts, ${w.targetHours}h`);
  for (const d of w.days) {
    const s = d.workouts.map((x) => `${x.sport}/${x.type}`).join('  +  ');
    console.log(`   ${d.dayOfWeek.padEnd(10)} ${s}`);
  }
}
