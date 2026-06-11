'use client';
import { useEffect, useRef, useState } from 'react';
import { Panel } from '../Panel';
import type { CalEvent } from '@/app/api/calendar/route';
import { homeDateStr } from '@/lib/dates';

// ── Mode config ───────────────────────────────────────────────────────────────

const MODES = ['FOCUS', 'PATROL', 'FLOW', 'OFF'] as const;
type Mode = typeof MODES[number];

const MODE_CFG: Record<Mode, {
  color: string; bg: string; border: string;
  dot: string; glyph: string; label: string;
}> = {
  FOCUS:  {
    color:  'var(--ok)',
    bg:     'oklch(0.74 0.10 155 / .10)',
    border: 'oklch(0.74 0.10 155 / .28)',
    dot:    '#52a874',
    glyph:  '◉',
    label:  'Deep work — no interrupts',
  },
  PATROL: {
    color:  'var(--warn)',
    bg:     'oklch(0.80 0.10 80 / .10)',
    border: 'oklch(0.80 0.10 80 / .28)',
    dot:    '#c9a84c',
    glyph:  '◎',
    label:  'Responsive — checking in',
  },
  FLOW: {
    color:  'var(--accent)',
    bg:     'var(--accent-soft)',
    border: 'color-mix(in oklch, var(--accent), transparent 72%)',
    dot:    'var(--accent)',
    glyph:  '◐',
    label:  'Creative — loose agenda',
  },
  OFF: {
    color:  'var(--faint)',
    bg:     'rgba(255,255,255,.04)',
    border: 'rgba(255,255,255,.10)',
    dot:    '#636a78',
    glyph:  '○',
    label:  'Signed off for the day',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function countdown(isoStart: string, nowMs: number): string {
  const diff = new Date(isoStart).getTime() - nowMs;
  if (diff <= 0) return 'now';
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function urgency(isoStart: string, nowMs: number): string {
  const mins = Math.round((new Date(isoStart).getTime() - nowMs) / 60_000);
  if (mins <= 10)  return '#52a874';
  if (mins <= 30)  return '#c9a84c';
  return 'var(--mut)';
}

function focusDur(sinceMs: number, nowMs: number): string {
  const m = Math.floor((nowMs - sinceMs) / 60_000);
  if (m < 1)  return 'just started';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OperatorCard({ delay }: { delay?: number }) {
  // Persistent state — don't read localStorage until mounted (SSR safe)
  const [mounted,    setMounted]    = useState(false);
  const [mode,       setMode]       = useState<Mode>('FOCUS');
  const [focusName,  setFocusName]  = useState('Personal OS');
  const [focusTarget, setFocusTarget] = useState('');
  const [modeSince,  setModeSince]  = useState(0);

  // Live state
  const [nowMs,      setNowMs]      = useState(Date.now());
  const [events,     setEvents]     = useState<CalEvent[]>([]);
  const [editing,    setEditing]    = useState<'name' | 'target' | null>(null);

  const nameRef   = useRef<HTMLInputElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);

  // Hydrate from localStorage
  useEffect(() => {
    const m  = localStorage.getItem('os-mode') as Mode | null;
    const fn = localStorage.getItem('os-focus-name');
    const ft = localStorage.getItem('os-focus-target');
    const ms = localStorage.getItem('os-mode-since');
    if (m  && MODES.includes(m))  setMode(m);
    if (fn) setFocusName(fn);
    if (ft) setFocusTarget(ft);
    setModeSince(ms ? Number(ms) : Date.now());
    setMounted(true);
  }, []);

  // Live tick every 30 s
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Focus input when editing starts
  useEffect(() => {
    if (editing === 'name')   nameRef.current?.select();
    if (editing === 'target') targetRef.current?.select();
  }, [editing]);

  // Fetch today's calendar events
  useEffect(() => {
    fetch('/api/calendar')
      .then(r => r.json())
      .then(({ events: evts }) => setEvents(Array.isArray(evts) ? evts : []))
      .catch(() => {});
  }, []);

  // ── Interactions ─────────────────────────────────────────────────────────────

  function cycleMode() {
    const next  = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    const since = Date.now();
    setMode(next); setModeSince(since);
    localStorage.setItem('os-mode',       next);
    localStorage.setItem('os-mode-since', String(since));
  }

  function saveName(val: string) {
    const v = val.trim() || focusName;
    setFocusName(v);
    localStorage.setItem('os-focus-name', v);
    setEditing(null);
  }

  function saveTarget(val: string) {
    setFocusTarget(val.trim());
    localStorage.setItem('os-focus-target', val.trim());
    setEditing(null);
  }

  // ── Calendar derived data ─────────────────────────────────────────────────────

  const todayKey   = homeDateStr(new Date(nowMs));
  const todayTimed = events
    .filter(e => !e.allDay && !e.calendar && e.start.slice(0, 10) === todayKey)
    .sort((a, b) => a.start.localeCompare(b.start));

  const upcoming    = todayTimed.filter(e => new Date(e.start).getTime() > nowMs - 60_000);
  const nextEvent   = upcoming[0] ?? null;
  const aheadCount  = upcoming.length;
  const totalToday  = todayTimed.length;

  const cfg = MODE_CFG[mode];

  // ── Render ────────────────────────────────────────────────────────────────────

  const modeBadge = (
    <button
      onClick={cycleMode}
      title="Click to change mode"
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        borderRadius: 20, padding: '2px 9px 2px 7px',
        cursor: 'pointer', fontSize: 11, fontWeight: 700,
        color: cfg.color, letterSpacing: '.05em',
        transition: 'background .2s, border-color .2s, color .2s',
        fontFamily: 'var(--sans)',
      }}
    >
      <span style={{ fontSize: 10 }}>{cfg.glyph}</span>
      {mode}
    </button>
  );

  return (
    <Panel glyph="⊕" title="Operator" meta={mounted ? modeBadge : undefined} delay={delay}>

      {/* ── Focus block ── */}
      <div style={{
        borderLeft: `2.5px solid ${cfg.dot}`,
        paddingLeft: 12,
        transition: 'border-color .3s',
      }}>
        {/* Project name (editable) */}
        {editing === 'name' ? (
          <input
            ref={nameRef}
            defaultValue={focusName}
            onBlur={e  => saveName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveName((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') setEditing(null);
            }}
            style={{
              fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 700,
              background: 'var(--ph)', border: `1px solid ${cfg.border}`,
              borderRadius: 7, padding: '3px 8px', color: 'var(--n1)',
              outline: 'none', width: '100%',
            }}
          />
        ) : (
          <div
            onClick={() => setEditing('name')}
            title="Click to edit"
            style={{
              fontSize: 14, fontWeight: 700, cursor: 'text',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {focusName}
            <span style={{ fontSize: 10, color: 'var(--faint)', opacity: 0.6 }}>✎</span>
          </div>
        )}

        {/* Mode label + timer + target */}
        <div style={{
          fontSize: 11.5, color: 'var(--mut)', marginTop: 3,
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <span>{cfg.label}</span>
          {mounted && modeSince > 0 && mode !== 'OFF' && (
            <>
              <span style={{ opacity: .4 }}>·</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: cfg.color }}>
                {focusDur(modeSince, nowMs)}
              </span>
            </>
          )}
          {(focusTarget || editing === 'target') && (
            <>
              <span style={{ opacity: .4 }}>·</span>
              {editing === 'target' ? (
                <input
                  ref={targetRef}
                  defaultValue={focusTarget}
                  placeholder="target time"
                  onBlur={e  => saveTarget(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  saveTarget((e.target as HTMLInputElement).value);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  style={{
                    fontFamily: 'var(--mono)', fontSize: 11,
                    background: 'var(--ph)', border: `1px solid ${cfg.border}`,
                    borderRadius: 5, padding: '1px 6px', color: 'var(--mut)',
                    outline: 'none', width: 80,
                  }}
                />
              ) : (
                <span
                  onClick={() => setEditing('target')}
                  style={{ fontFamily: 'var(--mono)', fontSize: 11, cursor: 'text' }}
                  title="Click to edit target"
                >
                  → {focusTarget}
                </span>
              )}
            </>
          )}
          {!focusTarget && editing !== 'target' && (
            <span
              onClick={() => setEditing('target')}
              style={{ fontSize: 10, color: 'var(--faint)', cursor: 'pointer', opacity: .5 }}
              title="Set a target time"
            >
              + target
            </span>
          )}
        </div>
      </div>

      {/* ── Next event ── */}
      {nextEvent && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 12px',
          background: 'var(--ph)', borderRadius: 10,
          border: '1px solid var(--ph-bd)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--faint)', flexShrink: 0 }}>↑ next</span>
          <span style={{
            fontSize: 13, fontWeight: 600, flex: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {nextEvent.title}
          </span>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, flexShrink: 0,
            color: urgency(nextEvent.start, nowMs),
          }}>
            {countdown(nextEvent.start, nowMs)}
          </span>
        </div>
      )}

      {/* ── Stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          {
            n:     totalToday > 0 ? String(totalToday) : '—',
            label: 'events today',
          },
          {
            n:     aheadCount > 0 ? String(aheadCount) : '—',
            label: 'still ahead',
          },
          {
            n:     mounted && mode !== 'OFF' ? focusDur(modeSince, nowMs) : mode,
            label: mode !== 'OFF' ? 'in mode' : 'status',
          },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--ph)', borderRadius: 10,
            padding: '9px 11px', border: '1px solid var(--ph-bd)',
          }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700,
              lineHeight: 1, color: 'var(--n1)',
            }}>
              {s.n}
            </div>
            <div style={{
              fontSize: 10.5, color: 'var(--faint)',
              textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 4,
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Mini event dots ── */}
      {todayTimed.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          paddingTop: 2,
        }}>
          <span style={{ fontSize: 10, color: 'var(--faint)', marginRight: 2 }}>today</span>
          {todayTimed.slice(0, 10).map(e => {
            const ms    = new Date(e.start).getTime();
            const done  = ms < nowMs - 60_000;
            const soon  = !done && (ms - nowMs) < 30 * 60_000;
            const now_  = !done && (ms - nowMs) < 60_000;
            return (
              <div
                key={e.start + e.title}
                title={`${e.title} · ${e.start.slice(11, 16)}`}
                style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: done   ? 'rgba(255,255,255,.12)'
                            : now_   ? cfg.dot
                            : soon   ? '#c9a84c'
                            : 'rgba(255,255,255,.35)',
                  transition: 'background .4s',
                }}
              />
            );
          })}
          {todayTimed.length > 10 && (
            <span style={{ fontSize: 10, color: 'var(--faint)' }}>+{todayTimed.length - 10}</span>
          )}
        </div>
      )}
    </Panel>
  );
}
