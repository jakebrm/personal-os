'use client';
import { useEffect, useState } from 'react';
import { Panel } from '../Panel';
import { useDashboard } from '../context';
import { Sparkline, Ph } from '../helpers';
import type { PixelDay } from '@/app/api/year-pixels/route';

// ── Year in Pixels ────────────────────────────────────────────────────────────
// 12 month columns × 31 day rows; intensity = habits done + workout that day.

const MONTH_ABBR = ['J','F','M','A','M','J','J','A','S','O','N','D'];

const LEVEL_BG = [
  'var(--ph)',                                          // 0 — logged, nothing done
  'color-mix(in oklch, var(--accent), transparent 75%)',
  'color-mix(in oklch, var(--accent), transparent 55%)',
  'color-mix(in oklch, var(--accent), transparent 30%)',
  'var(--accent)',                                      // 4 — full day
];

function YearPixels() {
  const [days, setDays] = useState<PixelDay[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  // Keep the previous year's grid on screen while the next one loads.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/year-pixels?year=${year}`)
      .then(r => (r.ok ? r.json() : { days: [] }))
      .then(d => { if (!cancelled) setDays(d.days ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  const today = new Intl.DateTimeFormat('en-CA').format(new Date());
  const byMonth: PixelDay[][] = Array.from({ length: 12 }, () => []);
  for (const d of days) byMonth[parseInt(d.date.slice(5, 7), 10) - 1].push(d);

  const activeDays = days.filter(d => d.level > 0).length;

  return (
    <Panel glyph="▦" title="Year in pixels"
      meta={
        <>
          <button className="tr-nav" style={{ width: 24, height: 24 }} onClick={() => setYear(y => y - 1)} aria-label="Previous year">‹</button>
          <span className="pill" style={{ fontFamily: 'var(--mono)' }}>{year}</span>
          <button className="tr-nav" style={{ width: 24, height: 24 }} onClick={() => setYear(y => y + 1)}
            disabled={year >= new Date().getFullYear()} aria-label="Next year">›</button>
        </>
      }>
      {loading ? (
        <div className="tsk-loading">Loading…</div>
      ) : (
        <>
          <div className="yp-grid">
            {byMonth.map((month, mi) => (
              <div key={mi} className="yp-month">
                <div className="yp-label">{MONTH_ABBR[mi]}</div>
                {month.map(d => (
                  <span
                    key={d.date}
                    className={`yp-cell${d.date === today ? ' yp-today' : ''}`}
                    style={{ background: d.level < 0 ? 'transparent' : LEVEL_BG[d.level] }}
                    title={`${d.date} · ${d.habitsDone}/${d.habitsTotal} habits${d.workout ? ' · workout ✓' : ''}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="chips" style={{ alignItems: 'center' }}>
            <span className="chip">{activeDays} active day{activeDays !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: 11, color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
              less {LEVEL_BG.map((bg, i) => (
                <span key={i} style={{ width: 10, height: 10, borderRadius: 3, background: bg, display: 'inline-block', border: '1px solid var(--card-bd)' }} />
              ))} more
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

function Metric({ label, val, src, children }: { label: string; val: string; src: string; children?: React.ReactNode }) {
  return (
    <section className="card metric">
      <div className="mhead">{label}<span className="pill">{src}</span></div>
      <div className="stat"><div className="n">{val}</div></div>
      {children}
    </section>
  );
}

export function StatsDeep() {
  const { setTab } = useDashboard();
  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>
      <div className="deep-head">
        <div><h1>This week</h1><div className="sub">MAY 26 – JUN 1 · STREAK 5 DAYS · YOUR BEST: 14 DAYS</div></div>
        <div className="actions">
          <button className="btn ghost">← prev</button>
          <button className="btn ghost">next →</button>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <YearPixels />
      </div>

      <div className="metricrow" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Metric label="Tasks done" val="12" src="this wk"><Sparkline data={[4,6,8,5,10,9,12]} h={36} /></Metric>
        <Metric label="Focus time" val="3.2h" src="tracked"><Sparkline data={[0.5,1,0.8,1.5,2,1.2,3.2]} h={36} /></Metric>
        <Metric label="Habits" val="86%" src="avg"><Sparkline data={[71,86,86,86,100,57,86]} h={36} /></Metric>
        <Metric label="Friends ✓" val="4" src="contacts"><Sparkline data={[0,1,2,0,1,0,4]} h={36} /></Metric>
      </div>
      <div className="two-col">
        <div className="stack">
          <Panel glyph="▦" title="Habit consistency" meta={<span className="pill">30 days</span>}>
            <Ph cap="habit heatmap · 30-day grid" h={160} />
          </Panel>
          <Panel glyph="◷" title="Focus time">
            <Ph cap="daily focus hours · 7 days" h={100} />
            <div className="chips"><span className="chip acc">peak: 2–4 PM</span><span className="chip">avg 1.8h/day</span></div>
          </Panel>
        </div>
        <div className="stack">
          <Panel glyph="◈" title="Productivity score">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <div className="nw">82</div>
              <div className="delta up" style={{ marginBottom: 6 }}>▲ 6 pts vs last wk</div>
            </div>
            <Sparkline data={[74,70,78,76,82,80,82]} h={36} />
          </Panel>
          <Panel glyph="❀" title="Social">
            <div className="statgrid">
              <div className="stat"><div className="n">4</div><div className="l">contacted</div></div>
              <div className="stat"><div className="n">3</div><div className="l">still due</div></div>
            </div>
            <div className="rows" style={{ marginTop: 4 }}>
              <div className="row"><div className="rg">MO</div><div className="rb"><div className="rt">Mom</div><div className="rmeta">called · 20 min</div></div><div className="raside"><span className="dot ok" />done</div></div>
              <div className="row"><div className="rg">DT</div><div className="rb"><div className="rt">Devon T.</div><div className="rmeta">texted</div></div><div className="raside"><span className="dot ok" />done</div></div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
