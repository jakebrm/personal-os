'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useDashboard } from '../context';
import { useDemo } from '../DemoContext';
import { buildDemoContacts } from '@/lib/demoData';
import { homeDateStr } from '@/lib/dates';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tier = 'close' | 'good' | 'acquaintance' | 'professional';
type InteractionType = 'call' | 'text' | 'coffee' | 'dinner' | 'visit' | 'other';
type Initiator = 'me' | 'them' | 'mutual';
type FriendStatus = 'active' | 'cooling' | 'written_off';
type NavView = 'upnext' | 'all' | Tier | 'fading' | 'inbox';

interface Friend {
  id: string;
  name: string;
  nickname: string | null;
  tier: Tier;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  birthday: string | null;
  city: string | null;
  notes: string | null;
  photo_url: string | null;
  contact_frequency_days: number;
  last_contacted_at: string | null;
  status: FriendStatus;
  consecutive_me_count: number;
  reply_median_minutes: number | null;
  reply_samples: number;
  awaiting_reply_since: string | null;
  created_at: string;
  updated_at: string;
  days_since_last_contact: number | null;
  overdue: boolean;
  days_overdue: number;
  days_awaiting_reply: number | null;
}

interface Interaction {
  id: string;
  date: string;
  type: InteractionType;
  initiated_by: Initiator;
  notes: string | null;
  source?: 'manual' | 'imessage' | 'call_log';
}

/** Address-book contact awaiting triage (synced by scripts/sync-contacts.ts). */
interface InboxContact {
  id: string;
  name: string;
  nickname: string | null;
  organization: string | null;
  phones: string[];
  emails: string[];
  birthday: string | null;
  city: string | null;
  status: 'pending' | 'dismissed' | 'imported';
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIERS: { id: Tier; label: string; days: number; glyph: string }[] = [
  { id: 'close',        label: 'Close Friends',         days: 14,  glyph: '❤' },
  { id: 'good',         label: 'Good Friends',          days: 35,  glyph: '◈' },
  { id: 'acquaintance', label: 'Acquaintances',         days: 70,  glyph: '◇' },
  { id: 'professional', label: 'Professional Contacts', days: 140, glyph: '◎' },
];
const TIER_MAP = Object.fromEntries(TIERS.map(t => [t.id, t])) as Record<Tier, typeof TIERS[0]>;

const INTERACTION_TYPES: InteractionType[] = ['call', 'text', 'coffee', 'dinner', 'visit', 'other'];
const INITIATOR_LABEL: Record<Initiator, string> = { me: 'Me', them: 'Them', mutual: 'Both' };
const INITIATOR_ARROW: Record<Initiator, string> = { me: '↑', them: '↓', mutual: '↕' };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts?.headers ?? {}) } });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

function todayStr() { return homeDateStr(); }

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function monthLabel(date: string): string {
  const [y, m] = date.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function lastLabel(days: number | null): string {
  if (days === null) return 'never';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function nextLabel(f: Friend): string {
  if (!f.overdue) {
    const rem = f.contact_frequency_days - (f.days_since_last_contact ?? 0);
    if (rem <= 0) return 'due today';
    return `in ${rem}d`;
  }
  return `${f.days_overdue}d overdue`;
}

function upcomingBirthdays(friends: Friend[], withinDays = 14) {
  const today = new Date();
  return friends
    .filter(f => f.birthday && f.status !== 'written_off')
    .map(f => {
      const [, m, d] = f.birthday!.split('-').map(Number);
      let next = new Date(today.getFullYear(), m - 1, d);
      if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
      return { ...f, daysUntil: Math.round((next.getTime() - today.getTime()) / 86_400_000) };
    })
    .filter(f => f.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

const byUrgency = (a: Friend, b: Friend) => {
  if (a.overdue && b.overdue) return b.days_overdue - a.days_overdue;
  const aRem = a.contact_frequency_days - (a.days_since_last_contact ?? 0);
  const bRem = b.contact_frequency_days - (b.days_since_last_contact ?? 0);
  return aRem - bRem;
};

function fmtReplyTime(min: number): string {
  if (min < 60) return `${Math.max(1, min)}m`;
  if (min < 2880) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

// ── No-reply chip (row inline) ────────────────────────────────────────────────

function NoReplyChip({ days }: { days: number | null }) {
  // 60d+ unanswered threads are dormant, not "being ignored" — cadence covers those
  if (days == null || days < 3 || days > 60) return null;
  const color = days >= 7 ? 'var(--danger)' : 'oklch(0.78 0.17 65)';
  return (
    <span
      title={`No reply since your text ${days} days ago`}
      style={{ fontFamily: 'var(--mono)', fontSize: 10, color, marginLeft: 5 }}
    >
      ⏳{days}d
    </span>
  );
}

// ── Effort chip (row inline) ──────────────────────────────────────────────────

function EffortChip({ count }: { count: number }) {
  if (count < 3) return null;
  const color = count >= 5 ? 'var(--danger)' : 'oklch(0.78 0.17 65)';
  return (
    <span
      title={`You've reached out ${count} times in a row without them initiating`}
      style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, color, marginLeft: 5 }}
    >
      {'↑'.repeat(Math.min(count, 6))}
    </span>
  );
}

// ── Effort section (drawer) ───────────────────────────────────────────────────

function EffortSection({ friend, onSetStatus }: {
  friend: Friend;
  onSetStatus: (id: string, status: FriendStatus) => void;
}) {
  const n = friend.consecutive_me_count;
  const warn = n >= 3, crit = n >= 5;
  if (n === 0 && friend.status === 'active') return null;

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: crit ? 'oklch(0.22 0.08 25 / 0.5)' : warn ? 'oklch(0.25 0.06 65 / 0.4)' : 'var(--bg2)',
      border: `1px solid ${crit ? 'oklch(0.4 0.12 25 / 0.4)' : warn ? 'oklch(0.45 0.1 65 / 0.3)' : 'var(--n4)'}`,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {n > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: 1 }}>Effort streak</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: Math.min(n, 7) }).map((_, i) => (
              <span key={i} style={{ fontSize: 16, color: crit ? 'var(--danger)' : warn ? 'oklch(0.78 0.17 65)' : 'var(--mut)' }}>↑</span>
            ))}
            {n > 7 && <span style={{ fontSize: 11, color: 'var(--mut)', alignSelf: 'center' }}>+{n - 7}</span>}
          </div>
          <div style={{ fontSize: 12, color: crit ? 'oklch(0.8 0.1 25)' : 'var(--mut)' }}>
            {crit
              ? `You've reached out ${n} times in a row — they haven't initiated once.`
              : `You've reached out ${n} times in a row without them initiating.`}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {friend.status === 'active' && (
          <>
            {warn && (
              <button className="btn ghost"
                style={{ fontSize: 11, padding: '4px 10px', color: 'oklch(0.78 0.17 65)', borderColor: 'oklch(0.45 0.1 65 / 0.4)' }}
                onClick={() => onSetStatus(friend.id, 'cooling')}>~ Cool off</button>
            )}
            {crit && (
              <button className="btn ghost"
                style={{ fontSize: 11, padding: '4px 10px', color: 'var(--danger)', borderColor: 'oklch(0.4 0.12 25 / 0.4)' }}
                onClick={() => onSetStatus(friend.id, 'written_off')}>✕ Write off</button>
            )}
          </>
        )}
        {(friend.status === 'cooling' || friend.status === 'written_off') && (
          <>
            <span style={{ fontSize: 11, color: friend.status === 'written_off' ? 'var(--faint)' : 'oklch(0.78 0.17 65)', alignSelf: 'center' }}>
              {friend.status === 'written_off' ? 'Written off' : '~ Cooling off'}
            </span>
            <button className="btn ghost" style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => onSetStatus(friend.id, 'active')}>↑ Restore</button>
            {friend.status === 'cooling' && (
              <button className="btn ghost"
                style={{ fontSize: 11, padding: '4px 10px', color: 'var(--danger)', borderColor: 'oklch(0.4 0.12 25 / 0.4)' }}
                onClick={() => onSetStatus(friend.id, 'written_off')}>✕ Write off</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────

function FriendDrawer({ friend, isDemo, onMarkContacted, onChangeTier, onEditFreq, onDelete, onSetStatus }: {
  friend: Friend;
  isDemo: boolean;
  onMarkContacted: (id: string, type: InteractionType, date: string, notes: string, initiatedBy: Initiator) => void;
  onChangeTier: (id: string, tier: Tier) => void;
  onEditFreq: (id: string, days: number) => void;
  onDelete: (id: string) => void;
  onSetStatus: (id: string, status: FriendStatus) => void;
}) {
  const [interactions, setInteractions] = useState<Interaction[] | null>(null);
  const [logging, setLogging]           = useState(false);
  const [logType, setLogType]           = useState<InteractionType>('call');
  const [logDate, setLogDate]           = useState(todayStr);
  const [logNotes, setLogNotes]         = useState('');
  const [logBy, setLogBy]               = useState<Initiator>('me');
  const [editingTier, setEditingTier]   = useState(false);
  const [editingFreq, setEditingFreq]   = useState(false);
  const [freqVal, setFreqVal]           = useState(String(friend.contact_frequency_days));
  const [showAll, setShowAll]           = useState(false);

  useEffect(() => {
    setShowAll(false);
    if (isDemo) { setInteractions([]); return; }
    apiFetch<{ interactions: Interaction[] }>(`/api/friends/${friend.id}/interaction`)
      .then(d => setInteractions(d.interactions))
      .catch(() => setInteractions([]));
  }, [friend.id, isDemo]);

  const submitLog = () => {
    if (!logDate) return;
    onMarkContacted(friend.id, logType, logDate, logNotes, logBy);
    setLogging(false); setLogNotes(''); setLogDate(todayStr()); setLogBy('me');
  };

  const submitFreq = () => {
    const n = parseInt(freqVal);
    if (!n || n < 1) return;
    onEditFreq(friend.id, n);
    setEditingFreq(false);
  };

  return (
    <div style={{
      padding: '12px 14px 14px',
      background: friend.status === 'written_off' ? 'var(--bg2)' : 'var(--accent-soft)',
      borderTop: '1px solid var(--accent-glow)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Meta */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--mut)' }}>
        {friend.city && <span>📍 {friend.city}</span>}
        {friend.birthday && <span>🎂 {friend.birthday.slice(5).replace('-', '/')}</span>}
        {friend.phone && <span>📞 {friend.phone}</span>}
        {friend.email && <span>✉ {friend.email}</span>}
        <span style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
          onClick={() => { setEditingTier(v => !v); setEditingFreq(false); }}>
          {TIER_MAP[friend.tier].label.toLowerCase()}
        </span>
        <span style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
          onClick={() => { setEditingFreq(v => !v); setEditingTier(false); setFreqVal(String(friend.contact_frequency_days)); }}>
          every {friend.contact_frequency_days}d
        </span>
      </div>

      {editingTier && (
        <select value={friend.tier} autoFocus
          onChange={e => { onChangeTier(friend.id, e.target.value as Tier); setEditingTier(false); }}
          onBlur={() => setEditingTier(false)}
          style={{ background:'var(--bg2)', border:'1px solid var(--accent)', borderRadius:6,
                   color:'var(--text)', fontSize:12, padding:'3px 8px', outline:'none', cursor:'pointer' }}>
          {TIERS.map(t => <option key={t.id} value={t.id} style={{ background:'var(--bg2)' }}>{t.label}</option>)}
        </select>
      )}

      {editingFreq && (
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'var(--mut)' }}>Remind every</span>
          <input type="number" min={1} max={365} className="tsk-date-input"
            value={freqVal} onChange={e => setFreqVal(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter') submitFreq(); if (e.key==='Escape') setEditingFreq(false); }}
            style={{ width:60 }} autoFocus />
          <span style={{ fontSize:12, color:'var(--mut)' }}>days</span>
          <button className="btn" style={{ fontSize:11, padding:'4px 10px' }} onClick={submitFreq}>Save</button>
          <button className="btn ghost" style={{ fontSize:11, padding:'4px 10px' }} onClick={() => setEditingFreq(false)}>Cancel</button>
        </div>
      )}

      {friend.notes && <div style={{ fontSize:12, color:'var(--mut)', fontStyle:'italic' }}>{friend.notes}</div>}

      {/* Reply behavior (from comms sync) */}
      {(friend.reply_samples > 0 || (friend.days_awaiting_reply ?? 0) >= 1) && (
        <div style={{ fontSize:12, color:'var(--mut)', display:'flex', gap:14, flexWrap:'wrap', alignItems:'baseline' }}>
          {friend.reply_samples > 0 && friend.reply_median_minutes != null && (
            <span>
              ↩ usually replies in <b style={{ color:'var(--text)' }}>{fmtReplyTime(friend.reply_median_minutes)}</b>
              <span style={{ color:'var(--faint)' }}> · median of {friend.reply_samples} (90d)</span>
            </span>
          )}
          {(friend.days_awaiting_reply ?? 0) >= 1 && friend.days_awaiting_reply! <= 60 && (
            <span style={{
              fontWeight: 600,
              color: friend.days_awaiting_reply! >= 7 ? 'var(--danger)'
                   : friend.days_awaiting_reply! >= 3 ? 'oklch(0.78 0.17 65)' : 'var(--mut)',
            }}>
              ⏳ no reply for {friend.days_awaiting_reply}d
            </span>
          )}
        </div>
      )}

      <EffortSection friend={friend} onSetStatus={onSetStatus} />

      {/* History */}
      {interactions === null ? (
        <div style={{ fontSize:12, color:'var(--faint)' }}>Loading…</div>
      ) : interactions.length > 0 ? (
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          {(() => {
            const counted = interactions.filter(i => i.initiated_by === 'me' || i.initiated_by === 'them');
            if (counted.length < 3) return null;
            const themCount = counted.filter(i => i.initiated_by === 'them').length;
            const themPct = Math.round(themCount / counted.length * 100);
            return (
              <div style={{ fontSize:11, color:'var(--mut)', marginBottom:3 }}>
                They start the conversation{' '}
                <span style={{ color: themPct >= 50 ? 'var(--accent)' : 'var(--text)', fontWeight:700 }}>{themPct}%</span>
                {' '}of the time ·{' '}
                <span style={{ color:'var(--accent)' }}>↓ them {themCount}</span>
                {' · '}
                <span>↑ you {counted.length - themCount}</span>
              </div>
            );
          })()}
          <div style={{
            display:'flex', flexDirection:'column', gap:3,
            ...(showAll ? { maxHeight:300, overflowY:'auto', paddingRight:6 } : {}),
          }}>
            {(showAll ? interactions : interactions.slice(0, 4)).map((i, idx, arr) => (
              <div key={i.id}>
                {showAll && (idx === 0 || arr[idx-1].date.slice(0, 7) !== i.date.slice(0, 7)) && (
                  <div style={{
                    fontSize:10, fontFamily:'var(--mono)', letterSpacing:1, color:'var(--faint)',
                    textTransform:'uppercase', padding: idx === 0 ? '0 0 3px' : '8px 0 3px',
                  }}>{monthLabel(i.date)}</div>
                )}
                <div style={{ display:'flex', gap:8, fontSize:12, color:'var(--mut)', alignItems:'baseline' }}>
                  <span style={{ color:'var(--faint)', fontFamily:'var(--mono)', fontSize:11, flexShrink:0 }}>{i.date}</span>
                  <span style={{
                    fontSize:13, lineHeight:1, flexShrink:0,
                    color: i.initiated_by==='them' ? 'var(--accent)' : i.initiated_by==='mutual' ? 'var(--mut)' : 'var(--faint)',
                  }} title={`Initiated by: ${i.initiated_by}`}>{INITIATOR_ARROW[i.initiated_by]}</span>
                  <span>{i.type}</span>
                  {i.notes && <span style={{ color:'var(--text)' }}>{i.notes}</span>}
                  {i.source && i.source !== 'manual' && (
                    <span style={{ fontSize:9, color:'var(--faint)', border:'1px solid var(--card-bd)', borderRadius:20, padding:'0 5px', flexShrink:0 }}>auto</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {interactions.length > 4 && (
            <button className="btn ghost"
              style={{ fontSize:11, padding:'4px 10px', alignSelf:'flex-start', marginTop:3 }}
              onClick={() => setShowAll(v => !v)}>
              {showAll ? '▲ Show recent only' : `▼ Show all ${interactions.length} interactions`}
            </button>
          )}
        </div>
      ) : (
        <div style={{ fontSize:12, color:'var(--faint)' }}>No interactions logged yet.</div>
      )}

      {/* Log form */}
      {logging ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <select value={logType} onChange={e => setLogType(e.target.value as InteractionType)}
              style={{ background:'var(--ph)', border:'1px solid var(--card-bd)', borderRadius:8,
                       padding:'6px 10px', color:'var(--text)', fontSize:12, outline:'none', cursor:'pointer' }}>
              {INTERACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="date" className="tsk-date-input" value={logDate} max={todayStr()}
              onChange={e => setLogDate(e.target.value)} />
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <span style={{ fontSize:12, color:'var(--mut)', whiteSpace:'nowrap' }}>Who reached out?</span>
            <div style={{ display:'flex', gap:4 }}>
              {(['me','them','mutual'] as Initiator[]).map(v => (
                <button key={v} onClick={() => setLogBy(v)} style={{
                  padding:'3px 10px', fontSize:11, borderRadius:20, cursor:'pointer', border:'1px solid',
                  borderColor: logBy===v ? 'var(--accent)' : 'var(--n4)',
                  background: logBy===v ? 'var(--accent-soft)' : 'transparent',
                  color: logBy===v ? 'var(--accent)' : 'var(--mut)',
                }}>{INITIATOR_LABEL[v]}</button>
              ))}
            </div>
          </div>
          <input className="hs-input" placeholder="Notes (optional)…" value={logNotes}
            onChange={e => setLogNotes(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter') submitLog(); if (e.key==='Escape') setLogging(false); }}
            style={{ fontSize:12 }} />
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" style={{ fontSize:12, padding:'5px 12px' }} onClick={submitLog} disabled={!logDate}>Log contact</button>
            <button className="btn ghost" style={{ fontSize:12, padding:'5px 10px' }} onClick={() => setLogging(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {friend.status !== 'written_off' && (
            <button className="btn" style={{ fontSize:12, padding:'5px 12px' }} onClick={() => setLogging(true)}>+ Log contact</button>
          )}
          <button className="btn ghost"
            style={{ fontSize:12, padding:'5px 10px', color:'var(--faint)' }}
            onMouseEnter={e => (e.currentTarget.style.color='var(--danger)')}
            onMouseLeave={e => (e.currentTarget.style.color='var(--faint)')}
            onClick={() => onDelete(friend.id)}>Delete</button>
        </div>
      )}
    </div>
  );
}

// ── Friend row ────────────────────────────────────────────────────────────────

function FriendRow({ friend, expanded, onToggle, isDemo, onMarkContacted, onChangeTier, onEditFreq, onDelete, onSetStatus, notFirst }: {
  friend: Friend; expanded: boolean; onToggle: () => void; isDemo: boolean; notFirst: boolean;
  onMarkContacted: (id: string, type: InteractionType, date: string, notes: string, initiatedBy: Initiator) => void;
  onChangeTier: (id: string, tier: Tier) => void;
  onEditFreq: (id: string, days: number) => void;
  onDelete: (id: string) => void;
  onSetStatus: (id: string, status: FriendStatus) => void;
}) {
  const isCooling    = friend.status === 'cooling';
  const isWrittenOff = friend.status === 'written_off';
  const overdueCls   = friend.overdue && !isWrittenOff ? ' over' : '';

  return (
    <div style={{ borderTop: notFirst ? '1px solid var(--n4)' : 'none' }}>
      <div className="frow" style={{ borderTop:'none', cursor:'pointer', userSelect:'none',
        opacity: isCooling || isWrittenOff ? 0.55 : 1 }}
        onClick={onToggle}>
        <div className="fperson">
          <div className="fav" style={{
            fontSize: 13,
            background: friend.overdue && !isWrittenOff ? 'oklch(0.35 0.12 25 / 0.6)' : undefined,
            ...(isWrittenOff ? { filter:'grayscale(1)', opacity:0.5 } : {}),
          }}>{initials(friend.name)}</div>
          <div>
            <div className="fn" style={{ textDecoration: isWrittenOff ? 'line-through' : 'none' }}>
              {friend.name}
              {friend.nickname ? <span style={{ color:'var(--mut)', fontWeight:400 }}> ({friend.nickname})</span> : null}
              <EffortChip count={friend.consecutive_me_count} />
              <NoReplyChip days={friend.days_awaiting_reply} />
            </div>
            <div className="ft">
              {isCooling && <span style={{ color:'oklch(0.78 0.17 65)', marginRight:4 }}>~</span>}
              {TIER_MAP[friend.tier].glyph} {TIER_MAP[friend.tier].label.toLowerCase()}
            </div>
          </div>
        </div>
        <div className="fcell hide-sm" style={{ fontSize:12 }}>{lastLabel(friend.days_since_last_contact)}</div>
        <div className="fcell hide-sm" style={{ fontSize:12 }}>every {TIER_MAP[friend.tier].days}d</div>
        <div className={`fcell${overdueCls}`} style={{ fontSize:12 }}>
          {isWrittenOff ? <span style={{ color:'var(--faint)' }}>—</span> : nextLabel(friend)}
        </div>
        <div className="fact" style={{ color:'var(--faint)', fontSize:13 }}>{expanded ? '▲' : '▼'}</div>
      </div>
      {expanded && (
        <FriendDrawer friend={friend} isDemo={isDemo}
          onMarkContacted={onMarkContacted} onChangeTier={onChangeTier}
          onEditFreq={onEditFreq} onDelete={onDelete} onSetStatus={onSetStatus} />
      )}
    </div>
  );
}

// ── Inbox row ─────────────────────────────────────────────────────────────────

function InboxRow({ contact, onLabel, onDismiss, onRestore, notFirst }: {
  contact: InboxContact;
  onLabel: (id: string, tier: Tier) => void;
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
  notFirst: boolean;
}) {
  const meta = [
    contact.organization,
    contact.city,
    contact.birthday ? `🎂 ${contact.birthday.slice(5).replace('-', '/')}` : null,
    contact.phones[0] ?? contact.emails[0] ?? null,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 4px',
      borderTop: notFirst ? '1px solid var(--n4)' : 'none' }}>
      <div className="fav" style={{ width:32, height:32, fontSize:12, flexShrink:0 }}>{initials(contact.name)}</div>
      <div style={{ minWidth:0 }}>
        <div className="fn" style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {contact.name}
          {contact.nickname ? <span style={{ color:'var(--mut)', fontWeight:400 }}> ({contact.nickname})</span> : null}
        </div>
        {meta && (
          <div style={{ fontSize:11, color:'var(--faint)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {meta}
          </div>
        )}
      </div>
      <div style={{ marginLeft:'auto', display:'flex', gap:4, flexShrink:0 }}>
        {TIERS.map(t => (
          <button key={t.id} className="btn ghost" title={t.label}
            style={{ fontSize:13, padding:'4px 9px' }}
            onClick={() => onLabel(contact.id, t.id)}>{t.glyph}</button>
        ))}
        {contact.status === 'pending' ? (
          <button className="btn ghost" title="Dismiss — not someone to keep up with"
            style={{ fontSize:13, padding:'4px 9px', color:'var(--faint)' }}
            onClick={() => onDismiss(contact.id)}>✕</button>
        ) : (
          <button className="btn ghost" title="Restore to inbox"
            style={{ fontSize:13, padding:'4px 9px', color:'var(--faint)' }}
            onClick={() => onRestore(contact.id)}>↑</button>
        )}
      </div>
    </div>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────────

function AddForm({ onAdd, onCancel }: {
  onAdd: (name: string, tier: Tier) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [tier, setTier] = useState<Tier>('good');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, tier);
    setName('');
    inputRef.current?.focus();
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <input ref={inputRef} className="hs-input" placeholder="Full name…" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter') submit(); if (e.key==='Escape') onCancel(); }}
          style={{ flex:'1 1 160px', minWidth:0 }} autoFocus />
        <select value={tier} onChange={e => setTier(e.target.value as Tier)} style={{
          flex:'1 1 200px', background:'var(--ph)', border:'1px solid var(--card-bd)',
          borderRadius:9, padding:'7px 11px', color:'var(--text)', fontSize:13, outline:'none', cursor:'pointer',
        }}>
          {TIERS.map(t => (
            <option key={t.id} value={t.id} style={{ background:'var(--bg2)' }}>
              {t.label} · every {t.days}d
            </option>
          ))}
        </select>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn" onClick={submit} disabled={!name.trim()} style={{ opacity:name.trim()?1:0.45 }}>+ Add</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Group divider ─────────────────────────────────────────────────────────────

function GroupLabel({ label }: { label: string }) {
  return (
    <div style={{
      padding:'6px 14px 4px', fontSize:10, fontFamily:'var(--mono)',
      letterSpacing:1, color:'var(--faint)', textTransform:'uppercase',
      borderBottom:'1px solid var(--n4)',
    }}>{label}</div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FriendsDeep() {
  const { isDemo, notifyWrite } = useDemo();
  const isDemoRef = useRef(false);
  isDemoRef.current = isDemo;
  const { setTab } = useDashboard();

  const [friends, setFriends]   = useState<Friend[]>([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState<NavView>('upnext');
  const [search, setSearch]     = useState('');
  const [showAdd, setShowAdd]   = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [inbox, setInbox]       = useState<InboxContact[]>([]);
  const [inboxView, setInboxView] = useState<'pending' | 'dismissed'>('pending');

  const loadFriends = useCallback(async () => {
    if (isDemoRef.current) {
      setFriends(buildDemoContacts() as unknown as Friend[]);
      setLoading(false);
      return;
    }
    try {
      const { friends: data } = await apiFetch<{ friends: Friend[] }>('/api/friends');
      setFriends(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadFriends(); }, [loadFriends]);

  const loadInbox = useCallback(async () => {
    if (isDemoRef.current) { setInbox([]); return; }
    try {
      const { contacts } = await apiFetch<{ contacts: InboxContact[] }>('/api/contacts');
      setInbox(contacts);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const addFriend = async (name: string, tier: Tier) => {
    const contact_frequency_days = TIER_MAP[tier].days;
    if (isDemoRef.current) {
      notifyWrite();
      const fake: Friend = {
        id:`demo-${Date.now()}`, name, nickname:null, tier,
        phone:null, email:null, instagram:null, birthday:null, city:null, notes:null, photo_url:null,
        contact_frequency_days, last_contacted_at:null, status:'active', consecutive_me_count:0,
        reply_median_minutes:null, reply_samples:0, awaiting_reply_since:null,
        created_at:todayStr(), updated_at:todayStr(),
        days_since_last_contact:null, overdue:true, days_overdue:contact_frequency_days,
        days_awaiting_reply:null,
      };
      setFriends(prev => [...prev, fake].sort((a,b)=>a.name.localeCompare(b.name)));
      setShowAdd(false);
      return;
    }
    try {
      const { friend } = await apiFetch<{ friend: Friend }>('/api/friends', {
        method:'POST', body:JSON.stringify({ name, tier, contact_frequency_days }),
      });
      setFriends(prev => [...prev, friend].sort((a,b)=>a.name.localeCompare(b.name)));
      setShowAdd(false);
    } catch { /* ignore */ }
  };

  const changeTier = async (id: string, tier: Tier) => {
    const contact_frequency_days = TIER_MAP[tier].days;
    if (isDemoRef.current) {
      notifyWrite();
      setFriends(prev => prev.map(f => f.id===id ? { ...f, tier, contact_frequency_days } : f));
      return;
    }
    try {
      const { friend } = await apiFetch<{ friend: Friend }>(`/api/friends/${id}`, {
        method:'PATCH', body:JSON.stringify({ tier, contact_frequency_days }),
      });
      setFriends(prev => prev.map(f => f.id===id ? friend : f));
    } catch { /* ignore */ }
  };

  const markContacted = async (id: string, type: InteractionType, date: string, notes: string, initiatedBy: Initiator) => {
    if (isDemoRef.current) {
      notifyWrite();
      const days = Math.round((Date.now() - new Date(date+'T12:00:00').getTime()) / 86_400_000);
      setFriends(prev => prev.map(f => {
        if (f.id!==id) return f;
        const overdue = days > f.contact_frequency_days;
        const newCount = initiatedBy==='me' ? f.consecutive_me_count+1 : 0;
        return { ...f, last_contacted_at:date, days_since_last_contact:days, overdue,
                 days_overdue:overdue?days-f.contact_frequency_days:0, consecutive_me_count:newCount };
      }));
      return;
    }
    try {
      const { friend } = await apiFetch<{ friend: Friend | null }>(`/api/friends/${id}/interaction`, {
        method:'POST', body:JSON.stringify({ type, date, notes:notes||null, initiated_by:initiatedBy }),
      });
      if (friend) setFriends(prev => prev.map(f => f.id===id ? friend : f));
    } catch { /* ignore */ }
  };

  const editFreq = async (id: string, contact_frequency_days: number) => {
    if (isDemoRef.current) {
      notifyWrite();
      setFriends(prev => prev.map(f => {
        if (f.id!==id) return f;
        const days = f.days_since_last_contact ?? 0;
        const overdue = days > contact_frequency_days;
        return { ...f, contact_frequency_days, overdue, days_overdue:overdue?days-contact_frequency_days:0 };
      }));
      return;
    }
    try {
      const { friend } = await apiFetch<{ friend: Friend }>(`/api/friends/${id}`, {
        method:'PATCH', body:JSON.stringify({ contact_frequency_days }),
      });
      setFriends(prev => prev.map(f => f.id===id ? friend : f));
    } catch { /* ignore */ }
  };

  const setFriendStatus = async (id: string, status: FriendStatus) => {
    if (isDemoRef.current) { notifyWrite(); setFriends(prev => prev.map(f => f.id===id ? {...f,status} : f)); return; }
    try {
      const { friend } = await apiFetch<{ friend: Friend }>(`/api/friends/${id}`, {
        method:'PATCH', body:JSON.stringify({ status }),
      });
      setFriends(prev => prev.map(f => f.id===id ? friend : f));
    } catch { /* ignore */ }
  };

  const labelContact = async (id: string, tier: Tier) => {
    if (isDemoRef.current) { notifyWrite(); return; }
    try {
      const { friend } = await apiFetch<{ friend: Friend }>(`/api/contacts/${id}`, {
        method:'PATCH', body:JSON.stringify({ action:'label', tier }),
      });
      setInbox(prev => prev.map(c => c.id===id ? { ...c, status:'imported' as const } : c));
      setFriends(prev => [...prev, friend].sort((a,b)=>a.name.localeCompare(b.name)));
    } catch { /* ignore */ }
  };

  const dismissContact = async (id: string) => {
    setInbox(prev => prev.map(c => c.id===id ? { ...c, status:'dismissed' as const } : c));
    if (isDemoRef.current) { notifyWrite(); return; }
    await apiFetch(`/api/contacts/${id}`, { method:'PATCH', body:JSON.stringify({ action:'dismiss' }) }).catch(()=>{});
  };

  const restoreContact = async (id: string) => {
    setInbox(prev => prev.map(c => c.id===id ? { ...c, status:'pending' as const } : c));
    if (isDemoRef.current) { notifyWrite(); return; }
    await apiFetch(`/api/contacts/${id}`, { method:'PATCH', body:JSON.stringify({ action:'restore' }) }).catch(()=>{});
  };

  const deleteFriend = async (id: string) => {
    setFriends(prev => prev.filter(f => f.id!==id));
    setExpanded(null);
    if (isDemoRef.current) { notifyWrite(); return; }
    await apiFetch(`/api/friends/${id}`, { method:'DELETE' }).catch(()=>{});
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const active  = friends.filter(f => f.status !== 'written_off');
  const fading  = friends.filter(f => f.status==='cooling' || f.status==='written_off');
  const overdue = active.filter(f => f.overdue);
  const dueWeek = active.filter(f => {
    if (f.overdue) return false;
    const rem = f.contact_frequency_days - (f.days_since_last_contact ?? 0);
    return rem >= 0 && rem <= 7;
  });
  const birthdays = upcomingBirthdays(friends, 14);
  const tierCounts = Object.fromEntries(TIERS.map(t => [t.id, active.filter(f=>f.tier===t.id).length])) as Record<Tier,number>;

  const inboxPending   = inbox.filter(c => c.status === 'pending');
  const inboxDismissed = inbox.filter(c => c.status === 'dismissed');
  const inboxShown = (inboxView === 'pending' ? inboxPending : inboxDismissed).filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.organization ?? '').toLowerCase().includes(q);
  });

  // Friend search also reaches into the synced address book (incl. dismissed),
  // so any contact can be pulled in as a friend without hunting the inbox.
  const contactMatches = (() => {
    if (view === 'inbox' || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return inbox
      .filter(c => c.status !== 'imported' &&
        (c.name.toLowerCase().includes(q) || (c.nickname ?? '').toLowerCase().includes(q)))
      .slice(0, 8);
  })();

  const displayed: { group?: string; friend: Friend }[] = (() => {
    if (view === 'inbox') return [];
    if (view === 'upnext') {
      const od = [...overdue].sort(byUrgency);
      const wk = [...dueWeek].sort(byUrgency);
      // Texts of the owner's gone unanswered 3–60 days (older = dormant, not ignored)
      const wait = active
        .filter(f => (f.days_awaiting_reply ?? 0) >= 3 && (f.days_awaiting_reply ?? 0) <= 60)
        .sort((a, b) => (b.days_awaiting_reply ?? 0) - (a.days_awaiting_reply ?? 0));
      const result: { group?: string; friend: Friend }[] = [];
      if (od.length)   { result.push({ group:`Overdue · ${od.length}`, friend:od[0] }); od.slice(1).forEach(f=>result.push({friend:f})); }
      if (wk.length)   { result.push({ group:`This week · ${wk.length}`, friend:wk[0] }); wk.slice(1).forEach(f=>result.push({friend:f})); }
      if (wait.length) { result.push({ group:`Waiting on a reply · ${wait.length}`, friend:wait[0] }); wait.slice(1).forEach(f=>result.push({friend:f})); }
      return result;
    }
    if (view === 'fading') {
      return [...fading].sort((a,b)=>b.consecutive_me_count-a.consecutive_me_count).map(f=>({friend:f}));
    }
    const isTier = TIERS.some(t => t.id === view);
    let list = isTier ? active.filter(f=>f.tier===view) : [...active];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q) || (f.nickname??'').toLowerCase().includes(q));
    }
    return list.sort(byUrgency).map(f=>({friend:f}));
  })();

  const emptyMsg =
    loading              ? 'Loading…' :
    friends.length === 0 ? 'No contacts yet — use "+ add friend" to get started.' :
    view === 'upnext'    ? "Nothing due this week — you're all caught up!" :
    view === 'fading'    ? 'No fading friendships.' :
    'No contacts match.';

  const upnextCount = overdue.length + dueWeek.length;
  const subLine = [
    `${active.length} FRIEND${active.length!==1?'S':''}`,
    overdue.length > 0 ? `${overdue.length} OVERDUE` : null,
    overdue.length===0 && dueWeek.length>0 ? `${dueWeek.length} DUE SOON` : null,
    overdue.length===0 && dueWeek.length===0 && active.length>0 ? 'ALL ON TRACK' : null,
  ].filter(Boolean).join(' · ');

  const nav = (v: NavView) => {
    setView(v); setSearch(''); setExpanded(null);
    // Nothing left to sort → land on the dismissed list (it's still searchable/importable)
    if (v === 'inbox' && inboxPending.length === 0) setInboxView('dismissed');
  };

  return (
    <div className="scaffold" style={{ '--d':'0s' } as React.CSSProperties}>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div className="sidebar">
        {(inbox.length > 0 || view==='inbox') && (
          <>
            <button className={`snav${view==='inbox'?' on':''}`} onClick={() => nav('inbox')}>
              <span className="g">⊞</span>Contacts
              <span style={{ marginLeft:'auto', fontFamily:'var(--mono)', fontSize:11,
                color: inboxPending.length>0?'var(--accent)':'var(--mut)' }}>
                {inboxPending.length > 0 ? inboxPending.length : inbox.length}
              </span>
            </button>
            <div className="sdiv" />
          </>
        )}

        <button className={`snav${view==='upnext'?' on':''}`} onClick={() => nav('upnext')}>
          <span className="g">◉</span>Up next
          <span style={{ marginLeft:'auto', fontFamily:'var(--mono)', fontSize:11,
            color: overdue.length>0?'var(--danger)':view==='upnext'?'var(--accent)':'var(--mut)' }}>
            {upnextCount}
          </span>
        </button>

        <div className="sdiv" />

        {TIERS.map(t => (
          <button key={t.id} className={`snav${view===t.id?' on':''}`} onClick={() => nav(t.id)}>
            <span className="g">{t.glyph}</span>{t.label}
            <span style={{ marginLeft:'auto', fontFamily:'var(--mono)', fontSize:11,
              color: view===t.id?'var(--accent)':'var(--mut)' }}>
              {tierCounts[t.id]}
            </span>
          </button>
        ))}

        <div className="sdiv" />

        <button className={`snav${view==='all'?' on':''}`} onClick={() => nav('all')}>
          <span className="g">○</span>Everyone
          <span style={{ marginLeft:'auto', fontFamily:'var(--mono)', fontSize:11,
            color: view==='all'?'var(--accent)':'var(--mut)' }}>{active.length}</span>
        </button>

        {fading.length > 0 && (
          <button className={`snav${view==='fading'?' on':''}`} onClick={() => nav('fading')}>
            <span className="g" style={{ color:'var(--mut)' }}>~</span>Fading
            <span style={{ marginLeft:'auto', fontFamily:'var(--mono)', fontSize:11,
              color: view==='fading'?'var(--accent)':'var(--mut)' }}>{fading.length}</span>
          </button>
        )}

        <div className="sdiv" />
        <button className="snav" onClick={() => setTab('dashboard')}>
          <span className="g">←</span>Dashboard
        </button>
      </div>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', flexDirection:'column', gap:16, minWidth:0 }}>

        <div className="deep-head">
          <div>
            <h1>Keep in Touch</h1>
            <div className="sub">{subLine}</div>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => setShowAdd(v=>!v)}>
              {showAdd ? '✕ cancel' : '+ add friend'}
            </button>
          </div>
        </div>

        {showAdd && (
          <div className="card">
            <div className="chead">
              <div className="glyph">◈</div>
              <div className="ctitle" style={{ fontSize:16 }}>New contact</div>
            </div>
            <AddForm onAdd={addFriend} onCancel={() => setShowAdd(false)} />
          </div>
        )}

        {/* Birthdays */}
        {(view==='all' || view==='upnext') && birthdays.length > 0 && (
          <div className="card">
            <div className="chead">
              <div className="glyph">🎂</div>
              <div className="ctitle">Upcoming birthdays</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {birthdays.map(f => (
                <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13 }}>
                  <div className="fav" style={{ width:30, height:30, fontSize:12 }}>{initials(f.name)}</div>
                  <div>
                    <div style={{ color:'var(--text)' }}>{f.name}</div>
                    {f.city && <div style={{ fontSize:11, color:'var(--faint)' }}>{f.city}</div>}
                  </div>
                  <div style={{ marginLeft:'auto', fontSize:12, color:f.daysUntil<=1?'var(--accent)':'var(--mut)' }}>
                    {f.daysUntil===0?'today!':f.daysUntil===1?'tomorrow':`in ${f.daysUntil}d`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view==='fading' && fading.length > 0 && (
          <div style={{ padding:'10px 14px', borderRadius:10, background:'var(--bg2)',
            border:'1px solid var(--n4)', fontSize:12, color:'var(--mut)', lineHeight:1.5 }}>
            Friends you're cooling off on or have written off. Open a row to restore or remove.
          </div>
        )}

        {/* Inbox triage */}
        {view==='inbox' && (
          <div className="card">
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
              <input className="hs-input" placeholder="Search contacts…" value={search}
                onChange={e => setSearch(e.target.value)} style={{ flex:'1 1 160px', minWidth:0 }} />
              <div style={{ display:'flex', gap:4 }}>
                {(['pending','dismissed'] as const).map(v => (
                  <button key={v} onClick={() => setInboxView(v)} style={{
                    padding:'3px 10px', fontSize:11, borderRadius:20, cursor:'pointer', border:'1px solid',
                    borderColor: inboxView===v ? 'var(--accent)' : 'var(--n4)',
                    background: inboxView===v ? 'var(--accent-soft)' : 'transparent',
                    color: inboxView===v ? 'var(--accent)' : 'var(--mut)',
                  }}>{v==='pending' ? `To sort · ${inboxPending.length}` : `Dismissed · ${inboxDismissed.length}`}</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize:11, color:'var(--faint)', marginBottom:6 }}>
              {TIERS.map(t => `${t.glyph} ${t.label.toLowerCase()}`).join(' · ')} · ✕ dismiss
            </div>
            {inboxShown.length === 0 ? (
              <div className="hm-empty">
                {isDemo ? 'Not available in demo mode.' :
                 inboxView === 'dismissed' ? 'No dismissed contacts.' :
                 inbox.length === 0 ? 'Inbox empty — run `npm run sync:contacts` to import your address book.' :
                 search.trim() ? 'No contacts match.' : 'Inbox zero — every contact has been sorted. 🎉'}
              </div>
            ) : (
              <div>
                {inboxShown.map((c, i) => (
                  <InboxRow key={c.id} contact={c} notFirst={i>0}
                    onLabel={labelContact} onDismiss={dismissContact} onRestore={restoreContact} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* List */}
        {view!=='inbox' && (
        <div className="card">
          {(view==='all' || view==='upnext') && (
            <input className="hs-input" placeholder="Search by name…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginBottom: search || view==='all' ? 8 : 0 }} />
          )}

          {displayed.length === 0 && contactMatches.length === 0 ? (
            <div className="hm-empty">{emptyMsg}</div>
          ) : displayed.length > 0 ? (
            <div className="flist">
              <div className="frow fhdr">
                <div>Person</div>
                <div className="hide-sm">Last contact</div>
                <div className="hide-sm">Cadence</div>
                <div>Next</div>
                <div></div>
              </div>
              {displayed.map(({ group, friend: f }, i) => (
                // index-composite key: a friend can appear in two Up-next groups
                <div key={`${i}-${f.id}`}>
                  {group !== undefined && <GroupLabel label={group} />}
                  <FriendRow
                    friend={f} expanded={expanded===f.id}
                    onToggle={() => setExpanded(expanded===f.id ? null : f.id)}
                    isDemo={isDemo}
                    onMarkContacted={markContacted} onChangeTier={changeTier}
                    onEditFreq={editFreq} onDelete={deleteFriend} onSetStatus={setFriendStatus}
                    notFirst={i>0 && group===undefined}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {/* Backend contacts matching the search — click a tier to import */}
          {contactMatches.length > 0 && (
            <div style={{ marginTop: displayed.length > 0 ? 12 : 0 }}>
              <GroupLabel label={`From your contacts · ${contactMatches.length}`} />
              <div style={{ fontSize:11, color:'var(--faint)', margin:'2px 4px 4px' }}>
                {TIERS.map(t => `${t.glyph} ${t.label.toLowerCase()}`).join(' · ')}
              </div>
              {contactMatches.map((c, i) => (
                <InboxRow key={c.id} contact={c} notFirst={i>0}
                  onLabel={labelContact} onDismiss={dismissContact} onRestore={restoreContact} />
              ))}
            </div>
          )}
        </div>
        )}

      </div>
    </div>
  );
}
