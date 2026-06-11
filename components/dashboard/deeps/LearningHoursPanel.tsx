'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel } from '../Panel';
import { chicagoWeekStart, shiftWeeks } from '@/lib/worklog';
import {
  formatDuration, hoursLabel, chicagoDayKey, dayLabel, timeLabel, toDatetimeLocal,
  type LearningEntry,
} from '@/lib/learning';

// ── Form state shared by add + edit ──────────────────────────────────────────

interface FormState {
  hours: string;
  minutes: string;
  startedAt: string;  // datetime-local string
  note: string;
}

function emptyForm(): FormState {
  return { hours: '', minutes: '', startedAt: toDatetimeLocal(), note: '' };
}

function formToBody(f: FormState) {
  const duration_minutes = (Number(f.hours) || 0) * 60 + (Number(f.minutes) || 0);
  // datetime-local is browser-local with no zone; let the Date constructor read it as local.
  const started_at = f.startedAt ? new Date(f.startedAt).toISOString() : new Date().toISOString();
  return { duration_minutes, started_at, note: f.note };
}

// ── Entry form (add + edit reuse this) ───────────────────────────────────────

function EntryForm({ initial, submitLabel, onSubmit, onCancel, busy }: {
  initial: FormState;
  submitLabel: string;
  onSubmit: (f: FormState) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));

  const totalMin = (Number(form.hours) || 0) * 60 + (Number(form.minutes) || 0);
  const canSubmit = totalMin > 0 && !busy;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={labelStyle}>How long</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input className="hs-input" type="number" min={0} inputMode="numeric" placeholder="0"
              style={{ width: 64, textAlign: 'right' }}
              value={form.hours} onChange={e => set('hours', e.target.value)} />
            <span style={unitStyle}>h</span>
            <input className="hs-input" type="number" min={0} max={59} inputMode="numeric" placeholder="0"
              style={{ width: 64, textAlign: 'right' }}
              value={form.minutes} onChange={e => set('minutes', e.target.value)} />
            <span style={unitStyle}>m</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={labelStyle}>When you started</label>
          <input className="hs-input" type="datetime-local"
            value={form.startedAt} onChange={e => set('startedAt', e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={labelStyle}>What you worked on</label>
        <textarea
          className="hs-input"
          style={{ resize: 'vertical', minHeight: 56, fontFamily: 'var(--sans)' }}
          value={form.note}
          onChange={e => set('note', e.target.value)}
          placeholder="Optional — e.g. Google Ads course, module 3"
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={!canSubmit} onClick={() => onSubmit(form)}
          style={{ opacity: canSubmit ? 1 : 0.5 }}>
          {busy ? '…' : submitLabel}
        </button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

// ── Totals ────────────────────────────────────────────────────────────────────

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
        {value}<span style={{ fontSize: 13, color: 'var(--mut)', marginLeft: 2 }}>h</span>
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--faint)' }}>
        {label}
      </span>
    </div>
  );
}

// ── Session row ─────────────────────────────────────────────────────────────────

function EntryRow({ entry, onEdit, onDelete }: {
  entry: LearningEntry; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="card" style={{ padding: '11px 14px', gap: 4, display: 'flex', flexDirection: 'column', cursor: 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>
          {formatDuration(entry.duration_minutes)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--mut)' }}>{timeLabel(entry.started_at)}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button onClick={onEdit} style={actionBtn} aria-label="Edit session">Edit</button>
          <button onClick={onDelete} style={{ ...actionBtn, color: 'var(--danger)' }} aria-label="Delete session">Delete</button>
        </div>
      </div>
      {entry.note && (
        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
          {entry.note}
        </p>
      )}
    </div>
  );
}

// ── Main panel (rendered inside the Work Log deep) ───────────────────────────

export function LearningHoursPanel() {
  const [entries, setEntries]   = useState<LearningEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(false);
  const [editingId, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetch('/api/learning')
      .then(r => (r.ok ? r.json() : { entries: [] }))
      .then(d => setEntries(d.entries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Totals, bucketed in Chicago time.
  const { todayMin, weekMin } = useMemo(() => {
    const today = chicagoDayKey();
    const weekStart = chicagoWeekStart();
    const weekEnd = shiftWeeks(weekStart, 0, 6);
    let todayMin = 0, weekMin = 0;
    for (const e of entries) {
      const day = chicagoDayKey(e.started_at);
      if (day === today) todayMin += e.duration_minutes;
      if (day >= weekStart && day <= weekEnd) weekMin += e.duration_minutes;
    }
    return { todayMin, weekMin };
  }, [entries]);

  // Group sessions by Chicago day for the list.
  const groups = useMemo(() => {
    const map = new Map<string, LearningEntry[]>();
    for (const e of entries) {
      const day = chicagoDayKey(e.started_at);
      (map.get(day) ?? map.set(day, []).get(day)!).push(e);
    }
    return [...map.entries()]; // already DESC because entries come back DESC
  }, [entries]);

  async function handleAdd(form: FormState) {
    setBusy(true);
    try {
      const res = await fetch('/api/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToBody(form)),
      });
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit(id: string, form: FormState) {
    setBusy(true);
    try {
      const res = await fetch('/api/learning', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...formToBody(form) }),
      });
      if (res.ok) {
        setEditing(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this learning session?')) return;
    const res = await fetch(`/api/learning?id=${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  return (
    <Panel
      glyph="◷"
      title="Agency"
      meta={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
          <Stat value={hoursLabel(todayMin)} label="Today" />
          <Stat value={hoursLabel(weekMin)}  label="This week" />
        </span>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <EntryForm initial={emptyForm()} submitLabel="Log time" onSubmit={handleAdd} busy={busy} />

        <div style={{ borderTop: '1px solid var(--card-bd)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading && <div className="tsk-loading">Loading…</div>}
          {!loading && entries.length === 0 && (
            <div className="tsk-empty">No Agency hours logged yet</div>
          )}

          {groups.map(([day, rows]) => {
            const dayMin = rows.reduce((s, e) => s + e.duration_minutes, 0);
            return (
              <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mut)' }}>{dayLabel(rows[0].started_at)}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--faint)' }}>{formatDuration(dayMin)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map(e => (
                    editingId === e.id ? (
                      <Panel key={e.id} glyph="✎" title="Editing session">
                        <EntryForm
                          initial={{
                            hours: String(Math.floor(e.duration_minutes / 60) || ''),
                            minutes: String(e.duration_minutes % 60 || ''),
                            startedAt: toDatetimeLocal(new Date(e.started_at)),
                            note: e.note ?? '',
                          }}
                          submitLabel="Save changes"
                          onSubmit={f => handleEdit(e.id, f)}
                          onCancel={() => setEditing(null)}
                          busy={busy}
                        />
                      </Panel>
                    ) : (
                      <EntryRow
                        key={e.id}
                        entry={e}
                        onEdit={() => setEditing(e.id)}
                        onDelete={() => handleDelete(e.id)}
                      />
                    )
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--faint)',
};
const unitStyle: React.CSSProperties = {
  fontSize: 13, color: 'var(--mut)', fontWeight: 600,
};
const actionBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--mut)', cursor: 'pointer',
  fontSize: 11, fontWeight: 600, padding: '2px 6px', fontFamily: 'var(--sans)',
};
