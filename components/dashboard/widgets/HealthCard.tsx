'use client';
import { useEffect, useState } from 'react';
import { Panel }  from '../Panel';
import { Sparkline } from '../helpers';
import type { WellnessRow, StravaRow } from '../../health/useHealthData';
import { computeReadiness } from '../../health/useHealthData';
import { homeDateStr } from '@/lib/dates';

type LiveData = {
  wellness: WellnessRow[];
  activities: StravaRow[];
};

function ReadinessMini({ score }: { score: number | null }) {
  const R = 16, C = 2 * Math.PI * R;
  const pct = score ?? 0;
  const color = pct >= 75 ? 'var(--ok)' : pct >= 50 ? 'var(--warn)' : 'var(--danger)';
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: 'rotate(-90deg)', flex: 'none' }}>
      <circle cx="20" cy="20" r={R} fill="none" stroke="var(--ph)" strokeWidth="5" />
      <circle cx="20" cy="20" r={R} fill="none" stroke={color} strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={C.toFixed(1)}
        strokeDashoffset={(C * (1 - pct / 100)).toFixed(1)}
        style={{ transition: 'stroke-dashoffset .8s ease' }}
      />
      <g transform="rotate(90 20 20)">
        <text x="20" y="24" textAnchor="middle"
          style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, fill: 'var(--n1)' }}>
          {score ?? '—'}
        </text>
      </g>
    </svg>
  );
}

function trainingNote(activities: StravaRow[]): string {
  const today = homeDateStr();
  const yesterday = homeDateStr(new Date(Date.now() - 86400_000));
  const todayActs = activities.filter(a => a.date === today);
  if (todayActs.length > 0) {
    const names = todayActs.map(a => a.name).join(' + ');
    return names.length > 28 ? names.slice(0, 25) + '…' : names;
  }
  const ystActs = activities.filter(a => a.date === yesterday);
  if (ystActs.length > 0) return 'Rest day';
  return 'No activity logged';
}

export function HealthCard({ delay }: { delay?: number }) {
  const [data, setData] = useState<LiveData | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/health/garmin').then(r => r.json()).catch(() => []),
      fetch('/api/health/strava').then(r => r.json()).catch(() => []),
    ]).then(([wellness, activities]) => {
      if (!cancelled) setData({ wellness: Array.isArray(wellness) ? wellness : [], activities: Array.isArray(activities) ? activities : [] });
    });
    return () => { cancelled = true; };
  }, []);

  const wellness   = data?.wellness   ?? [];
  const activities = data?.activities ?? [];
  const last       = wellness[wellness.length - 1];
  const score      = data ? computeReadiness(wellness) : null;
  const thisWeek   = (() => { const d = new Date(); d.setHours(0,0,0,0); const dow = d.getDay(); d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); return d.toISOString().slice(0, 10); })();
  const activeDays = new Set(activities.filter(a => a.date >= thisWeek).map(a => a.date)).size;

  return (
    <Panel glyph="♡" title="Health"
      meta={<span className="pill">{data ? 'live' : 'loading'}</span>}
      deepTab="health" delay={delay}>

      {/* Readiness ring + stats row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ReadinessMini score={score} />
        <div style={{ flex: 1, display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          <div className="stat">
            <div className="n" style={{ fontSize: 22 }}>
              {last?.sleep_duration_min != null ? `${(last.sleep_duration_min / 60).toFixed(1)}h` : '—'}
              <small>sleep</small>
            </div>
            <div className="l">last night</div>
          </div>
          <div className="stat">
            <div className="n" style={{ fontSize: 22 }}>
              {last?.resting_hr ?? '—'}<small>bpm</small>
            </div>
            <div className="l">resting HR</div>
          </div>
        </div>
      </div>

      {wellness.length > 1 && (
        <Sparkline data={wellness.slice(-7).map(r => r.hrv ?? 0).filter(Boolean)} h={26} />
      )}

      <div className="chips">
        {last?.steps != null && <span className="chip">{(last.steps / 1000).toFixed(1)}k steps</span>}
        <span className="chip">{activeDays}/7 active days</span>
      </div>

      <div className="row" style={{ padding: '4px 0' }}>
        <div className="rg">◉</div>
        <div className="rb">
          <div className="rt" style={{ fontSize: 13 }}>{trainingNote(activities)}</div>
          <div className="rmeta">today</div>
        </div>
      </div>
    </Panel>
  );
}
