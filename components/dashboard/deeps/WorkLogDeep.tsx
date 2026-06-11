'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel } from '../Panel';
import { useDashboard } from '../context';
import { LearningHoursPanel } from './LearningHoursPanel';
import {
  WORKLOG_CATEGORIES, CATEGORY_LABELS,
  chicagoWeekStart, shiftWeeks, weekRangeLabel,
  type WorkLogEntry, type WorkLogCategory, type WorkLogVisibility,
} from '@/lib/worklog';

// ── Form state shared by add + edit ──────────────────────────────────────────

interface FormState {
  client_project: string;
  category: WorkLogCategory;
  visibility: WorkLogVisibility;
  description: string;
  impact: string;
}

const EMPTY_FORM: FormState = {
  client_project: '',
  category: 'delivery',
  visibility: 'internal',
  description: '',
  impact: '',
};

// ── Small UI bits ─────────────────────────────────────────────────────────────

function CategoryPill({ category }: { category: WorkLogCategory }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
      color: 'var(--accent)', padding: '2px 8px', borderRadius: 99,
      background: 'var(--accent-soft)', border: '1px solid color-mix(in oklch, var(--accent), transparent 68%)',
    }}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

// Visibility is stored as one of internal | client_facing | both. The picker
// exposes it as two independent toggles so a single weekly entry can be marked
// as both internal AND client-facing.
function visFlags(v: WorkLogVisibility) {
  return { internal: v === 'internal' || v === 'both', client: v === 'client_facing' || v === 'both' };
}
function toVisibility(internal: boolean, client: boolean): WorkLogVisibility | null {
  if (internal && client) return 'both';
  if (internal) return 'internal';
  if (client)   return 'client_facing';
  return null; // nothing selected — caller keeps the previous value
}

function VisibilityTag({ visibility }: { visibility: WorkLogVisibility }) {
  const flags = visFlags(visibility);
  const tags: { label: string; color: string }[] = [];
  if (flags.internal) tags.push({ label: 'internal', color: 'var(--mut)' });
  if (flags.client)   tags.push({ label: 'client',   color: 'var(--warn)' });
  return (
    <>
      {tags.map(t => (
        <span key={t.label} style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
          color: t.color, padding: '2px 8px', borderRadius: 99,
          background: 'var(--chip-bg)', border: '1px solid var(--card-bd)',
        }}>
          {t.label}
        </span>
      ))}
    </>
  );
}

function VisibilityPicker({ value, onChange }: {
  value: WorkLogVisibility; onChange: (v: WorkLogVisibility) => void;
}) {
  const flags = visFlags(value);
  const opts: [keyof typeof flags, string][] = [['internal', 'Internal'], ['client', 'Client-Facing']];
  return (
    <div style={{ display: 'inline-flex', background: 'var(--chip-bg)', border: '1px solid var(--card-bd)', borderRadius: 10, padding: 2, gap: 2 }}>
      {opts.map(([k, label]) => {
        const on = flags[k];
        return (
          <button key={k} type="button" aria-pressed={on}
            onClick={() => {
              const next = toVisibility(
                k === 'internal' ? !flags.internal : flags.internal,
                k === 'client'   ? !flags.client   : flags.client,
              );
              if (next) onChange(next); // ignore the toggle that would clear both
            }}
            style={{
              fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              padding: '6px 12px', borderRadius: 8, border: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: on ? 'var(--accent)' : 'transparent',
              color: on ? '#fff' : 'var(--mut)',
              transition: '.12s',
            }}>
            <span style={{ fontSize: 11, lineHeight: 1 }}>{on ? '☑' : '☐'}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Entry form (add + edit reuse this) ───────────────────────────────────────

function EntryForm({ initial, clients, submitLabel, onSubmit, onCancel, busy }: {
  initial: FormState;
  clients: string[];
  submitLabel: string;
  onSubmit: (f: FormState) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [showImpact, setShowImpact] = useState(Boolean(initial.impact));

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));
  const canSubmit = form.client_project.trim() && form.description.trim() && !busy;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={labelStyle}>Client / Project</label>
          <input
            className="hs-input"
            list="worklog-clients"
            value={form.client_project}
            onChange={e => set('client_project', e.target.value)}
            placeholder="e.g. client engagement or internal"
          />
          <datalist id="worklog-clients">
            {clients.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={labelStyle}>Category</label>
          <select
            className="hs-input"
            value={form.category}
            onChange={e => set('category', e.target.value as WorkLogCategory)}
          >
            {WORKLOG_CATEGORIES.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={labelStyle}>Visibility <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--mut)' }}>· pick one or both</span></label>
        <VisibilityPicker value={form.visibility} onChange={v => set('visibility', v)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={labelStyle}>Description</label>
        <textarea
          className="hs-input"
          style={{ resize: 'vertical', minHeight: 64, fontFamily: 'var(--sans)' }}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="What did you do?"
        />
      </div>

      {showImpact ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={labelStyle}>Impact / outcome</label>
          <textarea
            className="hs-input"
            style={{ resize: 'vertical', minHeight: 48, fontFamily: 'var(--sans)' }}
            value={form.impact}
            onChange={e => set('impact', e.target.value)}
            placeholder="Optional — measurable outcome or result"
          />
        </div>
      ) : (
        <button type="button" onClick={() => setShowImpact(true)}
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'var(--sans)' }}>
          + Add impact
        </button>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={!canSubmit} onClick={() => onSubmit(form)}
          style={{ opacity: canSubmit ? 1 : 0.5 }}>
          {busy ? '…' : submitLabel}
        </button>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--faint)',
};

// ── Entry row ─────────────────────────────────────────────────────────────────

function EntryRow({ entry, onEdit, onDelete }: {
  entry: WorkLogEntry; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="card" style={{ padding: '13px 16px', gap: 8, display: 'flex', flexDirection: 'column', cursor: 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{entry.client_project}</span>
        <CategoryPill category={entry.category} />
        <VisibilityTag visibility={entry.visibility} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button onClick={onEdit} style={actionBtn} aria-label="Edit entry">Edit</button>
          <button onClick={onDelete} style={{ ...actionBtn, color: 'var(--danger)' }} aria-label="Delete entry">Delete</button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>
        {entry.description}
      </p>
      {entry.impact && (
        <p style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
          Impact: {entry.impact}
        </p>
      )}
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--mut)', cursor: 'pointer',
  fontSize: 11, fontWeight: 600, padding: '2px 6px', fontFamily: 'var(--sans)',
};

// ── Main deep ─────────────────────────────────────────────────────────────────

export function WorkLogDeep() {
  const { setTab } = useDashboard();

  const currentWeek = useMemo(() => chicagoWeekStart(), []);
  const [week, setWeek]         = useState(currentWeek);
  const [entries, setEntries]   = useState<WorkLogEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [clients, setClients]   = useState<string[]>([]);
  const [busy, setBusy]         = useState(false);
  const [editingId, setEditing] = useState<string | null>(null);

  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterClient, setFilterClient]     = useState<string>('');

  const loadEntries = useCallback((w: string, category: string, client: string) => {
    setLoading(true);
    const params = new URLSearchParams({ week: w });
    if (category) params.set('category', category);
    if (client)   params.set('client', client);
    return fetch(`/api/worklog?${params}`)
      .then(r => (r.ok ? r.json() : { entries: [] }))
      .then(d => setEntries(d.entries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadClients = useCallback(() => {
    fetch('/api/worklog?clients=1')
      .then(r => (r.ok ? r.json() : { clients: [] }))
      .then(d => setClients(d.clients ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadEntries(week, filterCategory, filterClient); }, [week, filterCategory, filterClient, loadEntries]);
  useEffect(() => { loadClients(); }, [loadClients]);

  const isCurrentWeek = week >= currentWeek;

  async function handleAdd(form: FormState) {
    setBusy(true);
    try {
      const res = await fetch('/api/worklog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        // New entries always land in the current week — jump there to show it.
        setFilterCategory(''); setFilterClient('');
        if (week !== currentWeek) setWeek(currentWeek);
        else await loadEntries(currentWeek, '', '');
        loadClients();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit(id: string, form: FormState) {
    setBusy(true);
    try {
      const res = await fetch('/api/worklog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...form }),
      });
      if (res.ok) {
        setEditing(null);
        await loadEntries(week, filterCategory, filterClient);
        loadClients();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this work log entry?')) return;
    const res = await fetch(`/api/worklog?id=${id}`, { method: 'DELETE' });
    if (res.ok) await loadEntries(week, filterCategory, filterClient);
  }

  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>

      <div className="deep-head">
        <div>
          <h1>Work Log</h1>
          <div className="sub">Consulting work on the left · agency hours on the right</div>
        </div>
      </div>

      <div className="two-col">
        {/* ── LEFT · Consulting ─────────────────────────────────────────── */}
        <div className="stack">
          <div>
            <div style={sectionTitle}>Consulting</div>
            <div style={sectionSub}>Consulting job — weekly entries, internal &amp; client-facing</div>
          </div>

        {/* Add entry */}
        <Panel glyph="＋" title="Log a Consulting entry">
          <EntryForm
            initial={EMPTY_FORM}
            clients={clients}
            submitLabel="Add entry"
            onSubmit={handleAdd}
            busy={busy}
          />
        </Panel>

        {/* Week navigator + filters */}
        <Panel
          glyph="▤"
          title="This week"
          meta={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setWeek(shiftWeeks(week, -1))} style={navBtn} aria-label="Previous week">‹</button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', minWidth: 150, textAlign: 'center' }}>
                {weekRangeLabel(week)}
              </span>
              <button onClick={() => !isCurrentWeek && setWeek(shiftWeeks(week, 1))} disabled={isCurrentWeek}
                style={{ ...navBtn, opacity: isCurrentWeek ? 0.3 : 1, cursor: isCurrentWeek ? 'default' : 'pointer' }}
                aria-label="Next week">›</button>
            </span>
          }
        >
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <select className="hs-input" style={{ flex: '0 1 auto', maxWidth: 180 }}
              value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="">All categories</option>
              {WORKLOG_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
            <select className="hs-input" style={{ flex: '0 1 auto', maxWidth: 180 }}
              value={filterClient} onChange={e => setFilterClient(e.target.value)}>
              <option value="">All clients</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(filterCategory || filterClient) && (
              <button className="btn ghost" style={{ padding: '7px 12px', fontSize: 12 }}
                onClick={() => { setFilterCategory(''); setFilterClient(''); }}>
                Clear
              </button>
            )}
          </div>

          {loading && <div className="tsk-loading">Loading…</div>}

          {!loading && entries.length === 0 && (
            <div className="tsk-empty">
              {filterCategory || filterClient ? 'No entries match these filters' : 'Nothing logged for this week'}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {entries.map(e => (
              editingId === e.id ? (
                <Panel key={e.id} glyph="✎" title={`Editing — ${e.client_project}`}>
                  <EntryForm
                    initial={{
                      client_project: e.client_project,
                      category: e.category,
                      visibility: e.visibility,
                      description: e.description,
                      impact: e.impact ?? '',
                    }}
                    clients={clients}
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
        </Panel>
        </div>{/* left stack · Consulting */}

        {/* ── RIGHT · Agency ──────────────────────────────────────── */}
        <div className="stack">
          <div>
            <div style={sectionTitle}>Agency</div>
            <div style={sectionSub}>Digital marketing agency — logged hours</div>
          </div>
          <LearningHoursPanel />
        </div>
      </div>{/* two-col */}
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 16, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--text)',
};
const sectionSub: React.CSSProperties = {
  fontSize: 12, color: 'var(--mut)', marginTop: 1,
};

const navBtn: React.CSSProperties = {
  background: 'var(--chip-bg)', border: '1px solid var(--card-bd)', borderRadius: 8,
  color: 'var(--text)', cursor: 'pointer', width: 26, height: 26, lineHeight: 1,
  display: 'grid', placeItems: 'center', fontSize: 15, fontFamily: 'var(--sans)',
};
