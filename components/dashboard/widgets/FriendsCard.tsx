'use client';
import { useEffect, useState } from 'react';
import { Panel } from '../Panel';
import { useDemo } from '../DemoContext';
import { buildDemoContacts } from '@/lib/demoData';

interface FriendRow {
  id: string;
  name: string;
  days_since_last_contact: number | null;
  contact_frequency_days: number;
  overdue: boolean;
  days_overdue: number;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function lastLabel(days: number | null): string {
  if (days === null) return 'never';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export function FriendsCard({ delay }: { delay?: number }) {
  const { isDemo } = useDemo();
  const [rows, setRows]     = useState<FriendRow[]>([]);
  const [overdue, setOverdue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemo) {
      const contacts = buildDemoContacts();
      const sorted = [...contacts]
        .sort((a, b) => {
          if (a.overdue && b.overdue) return b.days_overdue - a.days_overdue;
          const aRem = a.contact_frequency_days - (a.days_since_last_contact ?? 0);
          const bRem = b.contact_frequency_days - (b.days_since_last_contact ?? 0);
          return aRem - bRem;
        })
        .slice(0, 3);
      setRows(sorted as FriendRow[]);
      setOverdue(contacts.filter(c => c.overdue).length);
      setLoading(false);
      return;
    }
    fetch('/api/friends')
      .then(r => r.ok ? r.json() : { friends: [] })
      .then(d => {
        const all: FriendRow[] = d.friends ?? [];
        const sorted = [...all]
          .sort((a, b) => {
            if (a.overdue && b.overdue) return b.days_overdue - a.days_overdue;
            const aRem = a.contact_frequency_days - (a.days_since_last_contact ?? 0);
            const bRem = b.contact_frequency_days - (b.days_since_last_contact ?? 0);
            return aRem - bRem;
          })
          .slice(0, 3);
        setRows(sorted);
        setOverdue(all.filter(f => f.overdue).length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isDemo]);

  const meta = overdue > 0
    ? <span className="pill danger">{overdue} due</span>
    : rows.length > 0 ? <span className="pill ok">all ok</span> : null;

  return (
    <Panel glyph="❀" title="Keep in touch" meta={meta} deepTab="friends" delay={delay}>
      {loading ? (
        <div className="hm-empty" style={{ fontSize: 12 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="hm-empty" style={{ fontSize: 12 }}>No contacts yet — open to add friends.</div>
      ) : (
        <div className="rows">
          {rows.map(f => {
            const dotCls = f.overdue ? 'danger' : (f.contact_frequency_days - (f.days_since_last_contact ?? 0)) <= 7 ? 'warn' : 'ok';
            const statusLabel = f.overdue
              ? `${f.days_overdue}d overdue`
              : `${lastLabel(f.days_since_last_contact)} · every ${f.contact_frequency_days}d`;
            return (
              <div key={f.id} className="row">
                <div className="rg">{initials(f.name)}</div>
                <div className="rb">
                  <div className="rt">{f.name}</div>
                  <div className="rmeta">{statusLabel}</div>
                </div>
                <div className="raside"><span className={`dot ${dotCls}`} /></div>
              </div>
            );
          })}
        </div>
      )}
      <div className="chips">
        <span className="chip acc">↗ open tracker</span>
        <span className="chip">+ add friend</span>
      </div>
    </Panel>
  );
}
