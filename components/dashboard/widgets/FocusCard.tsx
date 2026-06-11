'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Panel } from '../Panel';

// Pomodoro-style focus timer. Daily completed-session count lives in
// localStorage (focus-sessions-YYYY-MM-DD) via useSyncExternalStore so it's
// SSR-safe and updates if logged from elsewhere.

const BREAK_SECS = 5 * 60;
const dayKey = () => 'focus-sessions-' + new Intl.DateTimeFormat('en-CA').format(new Date());

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener('os:focus', cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener('os:focus', cb);
  };
}
const getCount = () => Number(localStorage.getItem(dayKey()) ?? 0);

function bumpCount() {
  try {
    localStorage.setItem(dayKey(), String(getCount() + 1));
    window.dispatchEvent(new Event('os:focus'));
  } catch { /* ignore */ }
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function FocusCard({ delay }: { delay?: number }) {
  const [lenMin, setLenMin]   = useState(25);
  const [mode, setMode]       = useState<'focus' | 'break'>('focus');
  const [left, setLeft]       = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const endRef = useRef(0);
  const done = useSyncExternalStore(subscribe, getCount, () => 0);

  // Tick — remaining time is derived from a wall-clock deadline so background
  // tabs / throttled intervals can't drift the timer.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const rem = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      if (rem > 0) { setLeft(rem); return; }
      if (mode === 'focus') {
        bumpCount();
        setMode('break');
        endRef.current = Date.now() + BREAK_SECS * 1000;
        setLeft(BREAK_SECS);
      } else {
        setRunning(false);
        setMode('focus');
        setLeft(lenMin * 60);
      }
    }, 300);
    return () => clearInterval(id);
  }, [running, mode, lenMin]);

  // Surface the countdown in the browser tab while running.
  useEffect(() => {
    if (!running) return;
    document.title = `${fmt(left)} · ${mode === 'focus' ? 'Focus' : 'Break'}`;
    return () => { document.title = 'Personal OS'; };
  }, [left, running, mode]);

  function start() {
    endRef.current = Date.now() + left * 1000;
    setRunning(true);
  }
  function reset() {
    setRunning(false);
    setMode('focus');
    setLeft(lenMin * 60);
  }
  function pickLen(m: number) {
    setLenMin(m);
    if (!running && mode === 'focus') setLeft(m * 60);
  }

  const total = mode === 'focus' ? lenMin * 60 : BREAK_SECS;
  const pct   = Math.round(((total - left) / total) * 100);

  return (
    <Panel
      glyph="◉"
      title="Focus"
      meta={<span className="pill">{done} today</span>}
      delay={delay}
    >
      <div className="focus-row">
        <div>
          <div className="focus-time">{fmt(left)}</div>
          <div className="focus-mode">{running ? mode : 'paused'}</div>
        </div>
        <div className="focus-ctl">
          {!running
            ? <button className="btn" onClick={start}>▶ Start</button>
            : <button className="btn ghost" onClick={() => setRunning(false)}>⏸ Pause</button>}
          <button className="iconbtn" title="Reset" onClick={reset}>↺</button>
        </div>
      </div>

      <div className="prog"><i style={{ width: `${pct}%` }} /></div>

      <div className="chips">
        {[25, 50].map(m => (
          <button key={m}
            className={`chip${lenMin === m && mode === 'focus' ? ' acc' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => pickLen(m)}>
            {m}m
          </button>
        ))}
        <span className="chip">5m break after</span>
      </div>
    </Panel>
  );
}
