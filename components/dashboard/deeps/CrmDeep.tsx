'use client';
import { useEffect, useState } from 'react';
import { Panel } from '../Panel';
import { useDashboard } from '../context';
import type { CrmContact, CrmStage } from '@/app/api/crm/route';
import type { CrmActivity } from '@/app/api/crm/[id]/activities/route';

// ── Stage config ──────────────────────────────────────────────────────────────

const STAGES: { id: CrmStage; label: string; color: string }[] = [
  { id: 'lead',      label: 'Leads',     color: 'oklch(0.70 0.08 250)' },
  { id: 'contacted', label: 'Contacted', color: 'oklch(0.75 0.10 200)' },
  { id: 'proposal',  label: 'Proposal',  color: 'oklch(0.80 0.10 80)'  },
  { id: 'active',    label: 'Active',    color: 'var(--accent)'        },
  { id: 'won',       label: 'Won',       color: 'oklch(0.74 0.10 155)' },
];
const BOARD_ORDER = STAGES.map(s => s.id);

const ACTIVITY_TYPES: CrmActivity['type'][] = ['call', 'email', 'dm', 'meeting', 'shoot', 'delivery', 'invoice', 'note'];

const fmt$ = (n: number) => '$' + n.toLocaleString();
const todayStr = () => new Intl.DateTimeFormat('en-CA').format(new Date());

type Draft = {
  name: string; company: string; role: string; email: string; phone: string;
  instagram: string; source: string; value: string;
  next_action: string; next_action_date: string; notes: string;
};

function toDraft(c: CrmContact): Draft {
  return {
    name: c.name, company: c.company ?? '', role: c.role ?? '',
    email: c.email ?? '', phone: c.phone ?? '', instagram: c.instagram ?? '',
    source: c.source ?? '', value: c.value_usd ? String(c.value_usd) : '',
    next_action: c.next_action ?? '', next_action_date: c.next_action_date ?? '',
    notes: c.notes ?? '',
  };
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function CrmDeep() {
  const { setTab } = useDashboard();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selId, setSelId]       = useState<string | null>(null);
  const [draft, setDraft]       = useState<Draft | null>(null);
  const [saving, setSaving]     = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [addStage, setAddStage] = useState<CrmStage | null>(null);
  const [addName, setAddName]   = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [acts, setActs]         = useState<CrmActivity[]>([]);
  const [actType, setActType]   = useState<CrmActivity['type']>('note');
  const [actNote, setActNote]   = useState('');

  useEffect(() => {
    fetch('/api/crm')
      .then(r => (r.ok ? r.json() : { contacts: [] }))
      .then(d => setContacts(d.contacts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sel = contacts.find(c => c.id === selId) ?? null;

  function patchLocal(updated: CrmContact) {
    setContacts(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  }

  async function patchContact(id: string, patch: Record<string, unknown>) {
    const r = await fetch(`/api/crm/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.contact) patchLocal(d.contact);
    }
  }

  function select(c: CrmContact) {
    if (selId === c.id) { setSelId(null); setDraft(null); return; }
    setSelId(c.id); setDraft(toDraft(c)); setConfirmDel(false);
    setActs([]); setActNote(''); setActType('note');
    fetch(`/api/crm/${c.id}/activities`)
      .then(r => (r.ok ? r.json() : { activities: [] }))
      .then(d => setActs(d.activities ?? []))
      .catch(() => {});
  }

  async function quickAdd() {
    const name = addName.trim();
    if (!name || !addStage) return;
    setAddName('');
    const r = await fetch('/api/crm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stage: addStage }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.contact) setContacts(prev => [d.contact, ...prev]);
    }
  }

  function move(c: CrmContact, dir: -1 | 1) {
    const idx = BOARD_ORDER.indexOf(c.stage as typeof BOARD_ORDER[number]);
    if (idx === -1) return;
    const next = BOARD_ORDER[idx + dir];
    if (!next) return;
    patchLocal({ ...c, stage: next });           // optimistic
    void patchContact(c.id, { stage: next });
  }

  async function saveDraft() {
    if (!sel || !draft) return;
    setSaving(true);
    await patchContact(sel.id, {
      name: draft.name.trim() || sel.name,
      company: draft.company.trim() || null,
      role: draft.role.trim() || null,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      instagram: draft.instagram.trim() || null,
      source: draft.source.trim() || null,
      value_usd: Math.max(0, Math.round(Number(draft.value) || 0)),
      next_action: draft.next_action.trim() || null,
      next_action_date: draft.next_action_date || null,
      notes: draft.notes.trim() || null,
    });
    setSaving(false);
  }

  async function logActivity() {
    if (!sel) return;
    const note = actNote.trim();
    setActNote('');
    const r = await fetch(`/api/crm/${sel.id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: actType, notes: note || null }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.activity) setActs(prev => [d.activity, ...prev]);
      patchLocal({ ...sel, last_touch_at: todayStr(), days_since_touch: 0 });
    }
  }

  async function removeContact() {
    if (!sel) return;
    const id = sel.id;
    setSelId(null); setDraft(null); setConfirmDel(false);
    setContacts(prev => prev.filter(c => c.id !== id));
    await fetch(`/api/crm/${id}`, { method: 'DELETE' });
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const byStage = (s: CrmStage) => contacts.filter(c => c.stage === s);
  const sum     = (cs: CrmContact[]) => cs.reduce((t, c) => t + c.value_usd, 0);
  const pipeline = sum(contacts.filter(c => ['lead', 'contacted', 'proposal'].includes(c.stage)));
  const activeVal = sum(byStage('active'));
  const wonVal   = sum(byStage('won'));
  const dueCount = contacts.filter(c => c.action_due && c.stage !== 'won' && c.stage !== 'lost').length;
  const lost     = byStage('lost');

  const setD = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft(d => (d ? { ...d, [k]: e.target.value } : d));

  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>

      <div className="deep-head">
        <div>
          <h1>Agency</h1>
          <div className="sub">
            {loading ? 'Loading pipeline…'
              : `${contacts.length - lost.length} contacts · ${fmt$(pipeline)} in pipeline${dueCount > 0 ? ` · ${dueCount} follow-up${dueCount !== 1 ? 's' : ''} due` : ''}`}
          </div>
        </div>
        <div className="actions">
          {lost.length > 0 && (
            <button className="btn ghost" onClick={() => setShowLost(v => !v)}>
              {showLost ? 'Hide' : 'Show'} lost ({lost.length})
            </button>
          )}
          <button className="btn" onClick={() => { setAddStage('lead'); setAddName(''); }}>+ New lead</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="crm-kpis">
        <Panel className="metric"><div className="stat"><div className="n">{fmt$(pipeline)}</div><div className="l">Pipeline</div></div></Panel>
        <Panel className="metric"><div className="stat"><div className="n">{fmt$(activeVal)}</div><div className="l">Active work</div></div></Panel>
        <Panel className="metric"><div className="stat"><div className="n">{fmt$(wonVal)}</div><div className="l">Won</div></div></Panel>
        <Panel className="metric"><div className="stat"><div className="n" style={dueCount > 0 ? { color: 'var(--warn)' } : undefined}>{dueCount}</div><div className="l">Follow-ups due</div></div></Panel>
      </div>

      {/* Pipeline board */}
      <div className="crm-board">
        {STAGES.map(stage => {
          const deals = byStage(stage.id);
          return (
            <div key={stage.id} className="crm-col" style={{ '--sc': stage.color } as React.CSSProperties}>
              <div className="crm-col-head">
                <span className="crm-col-dot" />
                <span className="crm-col-label">{stage.label}</span>
                <span className="crm-col-meta">{deals.length}{sum(deals) > 0 ? ` · ${fmt$(sum(deals))}` : ''}</span>
              </div>

              {deals.map(c => (
                <button key={c.id} className={`crm-deal${selId === c.id ? ' sel' : ''}`} onClick={() => select(c)}>
                  <span className="crm-deal-name">{c.name}</span>
                  {(c.company || c.value_usd > 0) && (
                    <span className="crm-deal-sub">
                      {c.company ?? ''}{c.company && c.value_usd > 0 ? ' · ' : ''}{c.value_usd > 0 ? fmt$(c.value_usd) : ''}
                    </span>
                  )}
                  <span className="crm-deal-meta">
                    {c.action_due && <span className="crm-due">⚑ due</span>}
                    {c.days_since_touch != null && <span>{c.days_since_touch}d ago</span>}
                    {c.days_since_touch == null && <span>never touched</span>}
                  </span>
                  <span className="crm-move">
                    {stage.id !== 'lead' && <i onClick={e => { e.stopPropagation(); move(c, -1); }}>‹</i>}
                    {stage.id !== 'won'  && <i onClick={e => { e.stopPropagation(); move(c, 1); }}>›</i>}
                  </span>
                </button>
              ))}

              {addStage === stage.id ? (
                <input
                  className="hs-input"
                  autoFocus
                  placeholder="Name, then ⏎"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void quickAdd();
                    if (e.key === 'Escape') setAddStage(null);
                  }}
                  onBlur={() => setAddStage(null)}
                />
              ) : (
                <button className="crm-add" onClick={() => { setAddStage(stage.id); setAddName(''); }}>+ add</button>
              )}
            </div>
          );
        })}
      </div>

      {/* Lost bin */}
      {showLost && lost.length > 0 && (
        <Panel glyph="✕" title="Lost" meta={<span className="pill">{lost.length}</span>}>
          {lost.map(c => (
            <div key={c.id} className="row" style={{ alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--mut)' }}>{c.name}{c.company ? ` · ${c.company}` : ''}</span>
              <button className="tsk-urgency-btn" onClick={() => void patchContact(c.id, { stage: 'lead' })}>revive</button>
            </div>
          ))}
        </Panel>
      )}

      {/* Detail editor */}
      {sel && draft && (
        <Panel glyph="✎" title={sel.name} className="crm-detail"
          meta={
            <>
              {sel.value_usd > 0 && <span className="pill" style={{ fontFamily: 'var(--mono)' }}>{fmt$(sel.value_usd)}</span>}
              <button className="tr-close" onClick={() => { setSelId(null); setDraft(null); }}>✕</button>
            </>
          }>
          {/* Stage chips */}
          <div className="tsk-urgency-btns">
            {STAGES.map(s => (
              <button key={s.id}
                className={`tsk-urgency-btn${sel.stage === s.id ? ' on' : ''}`}
                onClick={() => { patchLocal({ ...sel, stage: s.id }); void patchContact(sel.id, { stage: s.id }); }}>
                {s.label}
              </button>
            ))}
            <button
              className={`tsk-urgency-btn${sel.stage === 'lost' ? ' on' : ''}`}
              style={{ color: 'var(--danger)' }}
              onClick={() => { patchLocal({ ...sel, stage: 'lost' }); void patchContact(sel.id, { stage: 'lost' }); }}>
              Lost
            </button>
          </div>

          <div className="crm-form">
            <input className="hs-input" placeholder="Name"          value={draft.name}      onChange={setD('name')} />
            <input className="hs-input" placeholder="Company"       value={draft.company}   onChange={setD('company')} />
            <input className="hs-input" placeholder="Role / title"  value={draft.role}      onChange={setD('role')} />
            <input className="hs-input" placeholder="Deal value $"  value={draft.value}     onChange={setD('value')} inputMode="numeric" />
            <input className="hs-input" placeholder="Email"         value={draft.email}     onChange={setD('email')} />
            <input className="hs-input" placeholder="Phone"         value={draft.phone}     onChange={setD('phone')} />
            <input className="hs-input" placeholder="Instagram"     value={draft.instagram} onChange={setD('instagram')} />
            <input className="hs-input" placeholder="Source (referral, IG…)" value={draft.source} onChange={setD('source')} />
            <input className="hs-input" placeholder="Next action"   value={draft.next_action} onChange={setD('next_action')} />
            <input className="hs-input tsk-date-input" type="date"  value={draft.next_action_date} onChange={setD('next_action_date')} />
          </div>
          <textarea className="tsk-expand-notes" placeholder="Notes…" value={draft.notes} onChange={setD('notes')} />

          <div className="tsk-expand-actions">
            <button className="btn" onClick={() => void saveDraft()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            {!confirmDel
              ? <button className="btn ghost tsk-delete-btn" onClick={() => setConfirmDel(true)}>Delete</button>
              : <button className="btn ghost tsk-delete-btn" onClick={() => void removeContact()}>Really delete?</button>}
          </div>

          {/* Activity log */}
          <div className="sdiv" />
          <div className="crm-act-add">
            <select className="hs-input crm-act-type" value={actType}
              onChange={e => setActType(e.target.value as CrmActivity['type'])}>
              {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className="hs-input" placeholder="Log a touch — call, shoot, invoice…" value={actNote}
              onChange={e => setActNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void logActivity(); }} />
            <button className="btn ghost" onClick={() => void logActivity()}>Log</button>
          </div>
          {acts.length > 0 && (
            <div className="crm-acts">
              {acts.map(a => (
                <div key={a.id} className="crm-act">
                  <span className="tr-tag">{a.type}</span>
                  <span className="crm-act-note">{a.notes ?? '—'}</span>
                  <span className="crm-act-date">{a.date}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {!loading && contacts.length === 0 && (
        <Panel glyph="◆" title="Start your pipeline">
          <p style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.6 }}>
            No contacts yet. Hit <b>+ New lead</b> to add your first Agency prospect —
            then move them through the pipeline with the ‹ › arrows as things progress:
            contacted → proposal → active → won.
          </p>
        </Panel>
      )}
    </div>
  );
}
