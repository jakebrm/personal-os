'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel } from './Panel';
import { useDemo } from './DemoContext';
import { localDateKey } from '@/lib/habits';

const QUICK_TIMES = ['05:30', '06:00', '06:30', '07:00', '07:30'];
const DEFAULT_TIME = '06:30';

// ── time helpers ────────────────────────────────────────────────────────────

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type Parts = { h12: number; min: number; ap: 'AM' | 'PM' };

function toParts(hhmm: string): Parts {
  const [h, m] = hhmm.split(':').map(Number);
  return { h12: h % 12 || 12, min: m, ap: h < 12 ? 'AM' : 'PM' };
}

function toHHMM({ h12, min, ap }: Parts): string {
  let h = h12 % 12;
  if (ap === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function avgTime(times: string[]): string | null {
  if (!times.length) return null;
  const mins = times.map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
  return `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`;
}

// ── stepper segment ─────────────────────────────────────────────────────────

function Segment({ value, onType, onStep, ariaLabel, width = 52 }: {
  value:     string;
  onType:    (v: string) => void;
  onStep:    (dir: 1 | -1) => void;
  ariaLabel: string;
  width?:    number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <button className="wt-step" aria-label={`${ariaLabel} up`} onClick={() => onStep(1)}>▲</button>
      <input
        className="wt-seg"
        inputMode="numeric"
        value={value}
        aria-label={ariaLabel}
        style={{ width }}
        onChange={e => onType(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
        onKeyDown={e => {
          if (e.key === 'ArrowUp')   { e.preventDefault(); onStep(1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); onStep(-1); }
        }}
        onFocus={e => e.currentTarget.select()}
      />
      <button className="wt-step" aria-label={`${ariaLabel} down`} onClick={() => onStep(-1)}>▼</button>
    </div>
  );
}

// ── card ────────────────────────────────────────────────────────────────────

export function WakeTimeCard() {
  const { isDemo, notifyWrite } = useDemo();
  const today = localDateKey();

  const [value, setValue]   = useState('');                              // today's HH:MM ('' = not logged)
  const [recent, setRecent] = useState<{ date: string; wakeTime: string }[]>([]);
  // Local editable parts (so partial typing doesn't fight the saved value)
  const [hStr, setHStr] = useState('6');
  const [mStr, setMStr] = useState('30');
  const [ap,   setAp]   = useState<'AM' | 'PM'>('AM');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // sync local parts from a HH:MM string
  const syncParts = (hhmm: string) => {
    const p = toParts(hhmm);
    setHStr(String(p.h12)); setMStr(String(p.min).padStart(2, '0')); setAp(p.ap);
  };

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isDemo) {
      const demo = [
        { date: today, wakeTime: '06:15' },
        { date: '—1', wakeTime: '06:30' },
        { date: '—2', wakeTime: '05:55' },
        { date: '—3', wakeTime: '06:40' },
      ];
      setRecent(demo); setValue('06:15'); syncParts('06:15');
      return;
    }
    let cancelled = false;
    fetch('/api/habits/wake?days=14')
      .then(r => r.json())
      .then(({ logs }: { logs: { date: string; wakeTime: string }[] }) => {
        if (cancelled || !Array.isArray(logs)) return;
        setRecent(logs);
        const t = logs.find(l => l.date === today);
        if (t) { setValue(t.wakeTime); syncParts(t.wakeTime); }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isDemo, today]);

  // ── Save (debounced) ──────────────────────────────────────────────────────
  const save = useCallback((next: string) => {
    setValue(next);
    if (next) syncParts(next);
    setRecent(prev => {
      const without = prev.filter(l => l.date !== today);
      return next ? [...without, { date: today, wakeTime: next }] : without;
    });
    if (isDemo) { notifyWrite(); return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/habits/wake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: today, wakeTime: next || null }),
      }).catch(() => {});
      // Logging a wake time doubles as the morning-brief trigger —
      // the endpoint dedupes, so edits later in the day are no-ops.
      if (next) {
        fetch('/api/brief/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ trigger: 'wake' }),
        }).catch(() => {});
      }
    }, 400);
  }, [isDemo, notifyWrite, today]);

  // commit current local parts → save
  const commit = (p: Parts) => save(toHHMM(p));

  const curParts = (): Parts => ({
    h12: Math.min(12, Math.max(1, parseInt(hStr, 10) || 12)),
    min: Math.min(59, Math.max(0, parseInt(mStr, 10) || 0)),
    ap,
  });

  const stepHour = (dir: 1 | -1) => {
    const p = curParts();
    p.h12 = ((p.h12 - 1 + dir + 12) % 12) + 1;
    commit(p);
  };
  const stepMin = (dir: 1 | -1) => {
    const p = curParts();
    p.min = (p.min + dir + 60) % 60;
    commit(p);
  };
  const typeHour = (v: string) => {
    setHStr(v);
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 1 && n <= 12) commit({ ...curParts(), h12: n });
  };
  const typeMin = (v: string) => {
    setMStr(v);
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 0 && n <= 59) commit({ ...curParts(), min: n });
  };
  const toggleAp = () => { const p = curParts(); p.ap = ap === 'AM' ? 'PM' : 'AM'; commit(p); };

  const loggedDays = recent.filter(l => !l.date.startsWith('—') || isDemo);
  const avg7 = avgTime(loggedDays.slice(-7).map(l => l.wakeTime));

  return (
    <Panel
      glyph="☀"
      title="Wake-up"
      meta={value
        ? <span className="pill">{to12h(value)}</span>
        : <span className="pill" style={{ opacity: 0.6 }}>not set</span>}
    >
      {/* Time steppers — type or tap to adjust */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 2 }}>
        <Segment value={hStr} onType={typeHour} onStep={stepHour} ariaLabel="Hour" />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, color: 'var(--faint)' }}>:</span>
        <Segment value={mStr} onType={typeMin} onStep={stepMin} ariaLabel="Minute" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 4 }}>
          {(['AM', 'PM'] as const).map(x => (
            <button
              key={x}
              className={`wt-ap${ap === x ? ' on' : ''}`}
              onClick={() => { if (ap !== x) toggleAp(); }}
            >
              {x}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 7, justifyContent: 'center' }}>
        <button className="btn" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => save(nowHHMM())}>
          ☀ Just woke up
        </button>
        {value && (
          <button className="btn ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => save('')}>
            Clear
          </button>
        )}
      </div>

      {/* Quick chips */}
      <div className="chips wake-quick" style={{ justifyContent: 'center' }}>
        {QUICK_TIMES.map(t => (
          <button key={t} className={`chip${value === t ? ' acc' : ''}`} onClick={() => save(t)}>
            {to12h(t)}
          </button>
        ))}
      </div>

      {avg7 && (
        <div className="wake-avg" style={{ textAlign: 'center' }}>
          7-day average <b>{to12h(avg7)}</b> · {loggedDays.length} day{loggedDays.length !== 1 ? 's' : ''} logged
        </div>
      )}
    </Panel>
  );
}
