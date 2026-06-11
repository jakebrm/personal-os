'use client';
import type { StravaRow } from './useHealthData';
import { sportTab } from './useHealthData';
import { Skel, CardHead } from './shared';

type Props = { activities: StravaRow[]; loading: boolean };

function getWeekStart(offsetWeeks = 0): string {
  const d = new Date(); d.setHours(0,0,0,0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) - offsetWeeks * 7);
  return d.toISOString().slice(0, 10);
}

function fmtHrs(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function WeeklyVolume({ activities, loading }: Props) {
  const thisWeek = getWeekStart(0);
  const lastWeek = getWeekStart(1);
  const nextWeek = new Date(new Date(thisWeek).getTime() + 7 * 86400_000).toISOString().slice(0, 10);

  const thisActs = activities.filter(a => a.date >= thisWeek && a.date < nextWeek);
  const lastActs = activities.filter(a => a.date >= lastWeek && a.date < thisWeek);

  const M_PER_MI = 1609.344;

  function sumMi(acts: StravaRow[], type: ReturnType<typeof sportTab>) {
    return acts.filter(a => sportTab(a.sport_type) === type)
      .reduce((s, a) => s + a.distance_m / M_PER_MI, 0);
  }
  function sumMins(acts: StravaRow[]) {
    return Math.round(acts.reduce((s, a) => s + a.duration_sec / 60, 0));
  }

  const thisRunMi  = sumMi(thisActs, 'run');
  const thisBikeMi = sumMi(thisActs, 'bike');
  const thisSwimM  = thisActs.filter(a => sportTab(a.sport_type) === 'swim')
    .reduce((s, a) => s + a.distance_m, 0);
  const thisMins   = sumMins(thisActs);
  const lastMins   = sumMins(lastActs);

  const pctVsLast = lastMins > 0 ? Math.round((thisMins - lastMins) / lastMins * 100) : null;

  const bars = [
    { label: 'Workouts',  val: `${thisActs.length} sessions`,  pct: Math.min(100, thisActs.length / 10 * 100) },
    { label: 'Run',  val: `${thisRunMi.toFixed(1)} mi`,          pct: Math.min(100, thisRunMi  / 30  * 100) },
    { label: 'Bike', val: `${thisBikeMi.toFixed(1)} mi`,         pct: Math.min(100, thisBikeMi / 60  * 100) },
    { label: 'Swim', val: `${thisSwimM.toFixed(0)} m`,           pct: Math.min(100, thisSwimM  / 3000 * 100) },
  ];

  return (
    <div className="card" style={{ gap: 14 }}>
      <CardHead icon="volume" title="Weekly Volume" source="strava" />

      {loading ? (
        <Skel h={100} />
      ) : (
        <>
          <div className="budget">
            {bars.map(b => (
              <div key={b.label} className="bgt">
                <div className="bl">
                  <span>{b.label}</span>
                  <span className="bv">{b.val}</span>
                </div>
                <div className="bbar"><i style={{ width: `${b.pct}%` }} /></div>
              </div>
            ))}
          </div>

          <div className="chips">
            <span className="chip">{fmtHrs(thisMins)} this week</span>
            {pctVsLast != null && (
              <span className={`chip ${pctVsLast >= 0 ? 'acc' : ''}`}>
                {pctVsLast >= 0 ? '↑' : '↓'} {Math.abs(pctVsLast)}% vs last wk
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
