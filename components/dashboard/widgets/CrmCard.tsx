'use client';
import { useEffect, useState } from 'react';
import { Panel } from '../Panel';
import type { CrmContact } from '@/app/api/crm/route';

const fmt$ = (n: number) => '$' + n.toLocaleString();

const FUNNEL: { id: CrmContact['stage']; label: string }[] = [
  { id: 'lead',      label: 'Leads' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'proposal',  label: 'Proposal' },
  { id: 'active',    label: 'Active' },
];

export function CrmCard({ delay }: { delay?: number }) {
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch('/api/crm')
      .then(r => (r.ok ? r.json() : { contacts: [] }))
      .then(d => setContacts(d.contacts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const open     = contacts.filter(c => c.stage !== 'won' && c.stage !== 'lost');
  const pipeline = open.reduce((t, c) => t + c.value_usd, 0);
  const due      = open.filter(c => c.action_due);
  const counts   = FUNNEL.map(f => contacts.filter(c => c.stage === f.id).length);
  const maxCount = Math.max(1, ...counts);

  return (
    <Panel
      glyph="◆"
      title="CRM"
      meta={<span className="pill" style={{ fontFamily: 'var(--mono)' }}>{loading ? '…' : fmt$(pipeline)}</span>}
      deepTab="crm"
      delay={delay}
    >
      {loading && <div className="tsk-loading">Loading…</div>}

      {!loading && contacts.length === 0 && (
        <div className="tsk-empty">No pipeline yet — open to add your first lead</div>
      )}

      {!loading && contacts.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: 'var(--mut)' }}>
            <b style={{ color: 'var(--text)' }}>{open.length}</b> open deal{open.length !== 1 ? 's' : ''}
            {due.length > 0 && <span style={{ color: 'var(--warn)' }}> · ⚑ {due.length} follow-up{due.length !== 1 ? 's' : ''} due</span>}
          </div>

          <div className="crm-funnel">
            {FUNNEL.map((f, i) => (
              <div key={f.id} className="crm-funnel-row">
                <span className="crm-funnel-label">{f.label}</span>
                <span className="crm-funnel-bar">
                  <i style={{ width: `${(counts[i] / maxCount) * 100}%` }} />
                </span>
                <span className="crm-funnel-n">{counts[i]}</span>
              </div>
            ))}
          </div>

          {due.slice(0, 2).map(c => (
            <div key={c.id} style={{ fontSize: 12, color: 'var(--mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              ⚑ <b style={{ color: 'var(--text)' }}>{c.name}</b>{c.next_action ? ` — ${c.next_action}` : ''}
            </div>
          ))}
        </>
      )}
    </Panel>
  );
}
