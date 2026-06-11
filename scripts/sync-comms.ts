/**
 * Sync iMessage + call history into friend_interactions.
 *
 * Reads the macOS Messages DB (~/Library/Messages/chat.db) and call history
 * (~/Library/Application Support/CallHistoryDB/CallHistory.storedata), matches
 * 1:1 conversations to friends by phone/email, and logs one interaction row
 * per friend per day per channel with who reached out first:
 *
 *   - type 'text', source 'imessage', external_key 'imessage:<friend>:<date>'
 *   - type 'call', source 'call_log', external_key 'call_log:<friend>:<date>'
 *
 * "Who initiated" is exchange-based: a message after 8+ hours of silence
 * starts a new exchange and its sender is the initiator. A day's initiator is
 * the initiator of the exchange active when that day's first message arrived,
 * so a reply at 12:05am doesn't count as "reaching out". Group chats and
 * tapbacks are ignored. Calls (including missed) count as outreach by caller.
 *
 * Friends with no phone on file are auto-matched against macOS Contacts by
 * name; unambiguous matches write friends.phone (E.164). Ambiguous or missing
 * matches are reported so the owner can fill them in the UI once.
 *
 * Also recomputes friends.last_contacted_at and consecutive_me_count from the
 * full interaction log (manual + auto).
 *
 * Friends with NULL comms_backfilled_at (e.g. just imported from the contact
 * inbox) get their ENTIRE message/call history aggregated on their first run,
 * ignoring the incremental window; the stamp is set once that succeeds.
 *
 * Requires Full Disk Access for the node binary (TCC-protected databases are
 * snapshotted with fs.copyFileSync, then queried via /usr/bin/sqlite3 -json).
 *
 * Usage: npm run sync:comms [-- --dry-run] [-- --full]
 *   --dry-run  print what would be written, write nothing
 *   --full     re-aggregate all history (default: last synced day minus 3)
 */

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';
import * as dns from 'dns';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Home network advertises IPv6 but doesn't always route it; node's default
// address order then hangs on AAAA connects (curl falls back, fetch doesn't).
dns.setDefaultResultOrder('ipv4first');

// ─── env ──────────────────────────────────────────────────────────────────────

function readEnvFile(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env.local');
  const out: Record<string, string> = {};
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  } catch { /* not found */ }
  return out;
}

const env = { ...readEnvFile(), ...process.env } as Record<string, string>;

function requireEnv(key: string): string {
  const v = env[key];
  if (!v) { console.error(`Missing env var ${key} (set it in .env.local)`); process.exit(1); }
  return v;
}

const TZ          = env.NEXT_PUBLIC_USER_TIMEZONE || env.USER_TIMEZONE || 'UTC';
const DRY_RUN     = process.argv.includes('--dry-run');
const FULL        = process.argv.includes('--full');
const HOME        = process.env.HOME ?? '';
const GAP_HOURS   = 8;            // silence that starts a new "exchange"
const APPLE_EPOCH = 978307200;    // 2001-01-01 in unix seconds

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

// ─── sqlite helpers (snapshot TCC-protected DBs, query the copy) ─────────────

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-sync-'));
process.on('exit', () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ } });

/** Copy a sqlite db (+ -wal/-shm) somewhere unprotected; null if unreadable. */
function snapshotDb(dbPath: string, label: string): string | null {
  const dest = path.join(tmpDir, label + '.db');
  try {
    fs.copyFileSync(dbPath, dest);
    for (const ext of ['-wal', '-shm']) {
      if (fs.existsSync(dbPath + ext)) fs.copyFileSync(dbPath + ext, dest + ext);
    }
    return dest;
  } catch (e) {
    console.error(`Cannot read ${dbPath}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

function query<T>(db: string, sql: string): T[] {
  const out = execFileSync('/usr/bin/sqlite3', ['-readonly', '-json', db, sql], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  }).trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

// ─── normalization ────────────────────────────────────────────────────────────

/** Phone → last 10 digits (US-centric, matches +1 / 1- / formatted variants). */
function normPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

const normName = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const localDate = (unixSec: number) => dayFmt.format(new Date(unixSec * 1000));

// ─── macOS Contacts → name/phone/email lookup ─────────────────────────────────

type ContactCard = { name: string; phones: string[]; emails: string[] };

function readContacts(): ContactCard[] {
  const abDir = path.join(HOME, 'Library/Application Support/AddressBook');
  const dbs: string[] = [];
  const main = path.join(abDir, 'AddressBook-v22.abcddb');
  if (fs.existsSync(main)) dbs.push(main);
  const srcDir = path.join(abDir, 'Sources');
  try {
    for (const d of fs.readdirSync(srcDir)) {
      const p = path.join(srcDir, d, 'AddressBook-v22.abcddb');
      if (fs.existsSync(p)) dbs.push(p);
    }
  } catch { /* no Sources dir */ }

  const byName = new Map<string, ContactCard>();
  for (let i = 0; i < dbs.length; i++) {
    const snap = snapshotDb(dbs[i], `ab${i}`);
    if (!snap) continue;
    const records = query<{ pk: number; first: string | null; last: string | null }>(
      snap, 'SELECT Z_PK as pk, ZFIRSTNAME as first, ZLASTNAME as last FROM ZABCDRECORD',
    );
    const phones = query<{ owner: number; num: string }>(
      snap, 'SELECT ZOWNER as owner, ZFULLNUMBER as num FROM ZABCDPHONENUMBER WHERE ZFULLNUMBER IS NOT NULL',
    );
    const emails = query<{ owner: number; addr: string }>(
      snap, 'SELECT ZOWNER as owner, ZADDRESS as addr FROM ZABCDEMAILADDRESS WHERE ZADDRESS IS NOT NULL',
    );
    const phonesByOwner = new Map<number, string[]>();
    for (const p of phones) (phonesByOwner.get(p.owner) ?? phonesByOwner.set(p.owner, []).get(p.owner)!).push(p.num);
    const emailsByOwner = new Map<number, string[]>();
    for (const e of emails) (emailsByOwner.get(e.owner) ?? emailsByOwner.set(e.owner, []).get(e.owner)!).push(e.addr);

    for (const r of records) {
      const name = normName(`${r.first ?? ''} ${r.last ?? ''}`);
      if (!name) continue;
      const card = byName.get(name) ?? { name, phones: [], emails: [] };
      for (const p of phonesByOwner.get(r.pk) ?? []) card.phones.push(p);
      for (const e of emailsByOwner.get(r.pk) ?? []) card.emails.push(e.toLowerCase());
      byName.set(name, card);
    }
  }
  return [...byName.values()];
}

// ─── types ────────────────────────────────────────────────────────────────────

type FriendRow = {
  id: string; name: string; nickname: string | null;
  phone: string | null; email: string | null; last_contacted_at: string | null;
  comms_backfilled_at: string | null;
};

type DayAgg = {
  friendId: string; date: string; type: 'text' | 'call';
  initiated_by: 'me' | 'them';
  sent: number; received: number;            // texts
  callsOut: number; callsIn: number; missed: number; durationS: number; // calls
};

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Comms sync (${TZ})${DRY_RUN ? ' — DRY RUN' : ''}${FULL ? ' — FULL' : ''}`);

  // 1. Friends
  const { data: friendData, error: fErr } = await supabase
    .from('friends')
    .select('id, name, nickname, phone, email, last_contacted_at, comms_backfilled_at')
    .eq('user_id', 'owner');
  if (fErr) throw new Error(`friends: ${fErr.message}`);
  const friends = (friendData ?? []) as FriendRow[];
  console.log(`${friends.length} friends on the list`);

  // 2. Contacts auto-match for friends missing a phone
  const contacts = readContacts();
  const contactsByName = new Map(contacts.map(c => [c.name, c]));
  console.log(`${contacts.length} named contacts in macOS Contacts`);

  const matchedCard = new Map<string, ContactCard>(); // friendId → card (for extra emails/phones)
  for (const f of friends) {
    const card = contactsByName.get(normName(f.name))
      ?? (f.nickname ? contactsByName.get(normName(f.nickname)) : undefined);
    if (card) matchedCard.set(f.id, card);

    if (f.phone) continue;
    if (!card || card.phones.length === 0) {
      console.log(`  ? no Contacts match for "${f.name}" — set their phone in Keep in Touch`);
      continue;
    }
    const e164 = toE164(card.phones[0]);
    f.phone = e164;
    console.log(`  ✓ matched "${f.name}" → ${e164.slice(0, -4)}xxxx`);
    if (!DRY_RUN) {
      const { error } = await supabase.from('friends').update({ phone: e164 }).eq('id', f.id);
      if (error) console.error(`  ✗ saving phone for ${f.name}: ${error.message}`);
    }
  }

  // 3. handle → friend lookup (phones + emails, incl. extras from their contact card)
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const f of friends) {
    if (f.phone) { const n = normPhone(f.phone); if (n) byPhone.set(n, f.id); }
    if (f.email) byEmail.set(f.email.toLowerCase(), f.id);
    const card = matchedCard.get(f.id);
    for (const p of card?.phones ?? []) { const n = normPhone(p); if (n && !byPhone.has(n)) byPhone.set(n, f.id); }
    for (const e of card?.emails ?? []) if (!byEmail.has(e)) byEmail.set(e, f.id);
  }
  const friendForHandle = (handle: string): string | undefined => {
    const h = handle.trim();
    if (h.includes('@')) return byEmail.get(h.toLowerCase());
    const n = normPhone(h);
    return n ? byPhone.get(n) : undefined;
  };
  if (byPhone.size === 0 && byEmail.size === 0) {
    console.log('No friends have phones/emails to match — nothing to sync.');
    return;
  }

  // Friends never backfilled (fresh inbox imports) get their FULL history
  // aggregated this run, ignoring the incremental cutoff below. Only friends
  // we can actually match to a handle count — one without a phone/email keeps
  // their NULL stamp so they're backfilled once a handle shows up.
  const matchable = new Set([...byPhone.values(), ...byEmail.values()]);
  const needsBackfill = new Set(
    friends.filter(f => !f.comms_backfilled_at && matchable.has(f.id)).map(f => f.id),
  );
  if (needsBackfill.size > 0) {
    const nameOf = new Map(friends.map(f => [f.id, f.name]));
    console.log(`First-time backfill (full history): ${[...needsBackfill].map(id => nameOf.get(id)).join(', ')}`);
  }

  // 4. Incremental window: re-aggregate from 3 days before the last auto-synced day
  let sinceSec = 0;
  if (!FULL) {
    const { data: last } = await supabase
      .from('friend_interactions')
      .select('date')
      .neq('source', 'manual')
      .order('date', { ascending: false })
      .limit(1);
    if (last && last.length > 0) {
      const d = new Date(last[0].date + 'T00:00:00');
      d.setDate(d.getDate() - 3);
      sinceSec = Math.floor(d.getTime() / 1000);
    }
  }
  const cutoffDate = sinceSec ? localDate(sinceSec) : null; // only upsert days >= this
  console.log(cutoffDate ? `Incremental since ${cutoffDate}` : 'Full backfill (all history)');

  const aggs = new Map<string, DayAgg>(); // key: source:friend:date
  const agg = (friendId: string, date: string, type: 'text' | 'call'): DayAgg => {
    const key = `${type}:${friendId}:${date}`;
    let a = aggs.get(key);
    if (!a) {
      a = { friendId, date, type, initiated_by: 'them', sent: 0, received: 0, callsOut: 0, callsIn: 0, missed: 0, durationS: 0 };
      aggs.set(key, a);
    }
    return a;
  };

  // Reply-time stats per friend: median minutes they take to answer the owner's
  // texts (90d window) + whether his latest outbound text is still unanswered.
  type ReplyStat = { medianMin: number | null; samples: number; awaitingSince: string | null };
  const replyStats = new Map<string, ReplyStat>();

  // 5. Messages
  const chatSnap = snapshotDb(path.join(HOME, 'Library/Messages/chat.db'), 'chat');
  if (chatSnap) {
    type Msg = { handle: string; from_me: number; rawdate: number; mid: number };
    // 1:1 chats only (style 45); skip tapbacks (associated_message_type) and
    // system items (item_type). The counterpart handle comes from the chat, so
    // outgoing rows (handle_id 0) still attribute correctly.
    const rows = query<Msg>(chatSnap, `
      SELECT DISTINCT m.ROWID AS mid, h.id AS handle, m.is_from_me AS from_me, m.date AS rawdate
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat c               ON c.ROWID = cmj.chat_id AND c.style = 45
      JOIN chat_handle_join chj ON chj.chat_id = c.ROWID
      JOIN handle h             ON h.ROWID = chj.handle_id
      WHERE m.item_type = 0 AND m.associated_message_type = 0 AND m.date > 0
      ORDER BY m.date ASC`);
    console.log(`${rows.length} 1:1 message rows in chat.db`);

    // Per-friend chronological walk; dedupe message ids (a chat can join the
    // same person via several handles/services).
    type M = { ts: number; fromMe: boolean };
    const perFriend = new Map<string, M[]>();
    const seen = new Map<string, Set<number>>();
    for (const r of rows) {
      const friendId = friendForHandle(r.handle);
      if (!friendId) continue;
      const ts = (r.rawdate > 1e12 ? r.rawdate / 1e9 : r.rawdate) + APPLE_EPOCH;
      const s = seen.get(friendId) ?? seen.set(friendId, new Set()).get(friendId)!;
      if (s.has(r.mid)) continue;
      s.add(r.mid);
      (perFriend.get(friendId) ?? perFriend.set(friendId, []).get(friendId)!).push({ ts, fromMe: r.from_me === 1 });
    }

    const GAP = GAP_HOURS * 3600;
    for (const [friendId, msgs] of perFriend) {
      msgs.sort((a, b) => a.ts - b.ts);
      let exchangeInitiator: 'me' | 'them' = 'them';
      let prevTs = -Infinity;
      for (const m of msgs) {
        if (m.ts - prevTs > GAP) exchangeInitiator = m.fromMe ? 'me' : 'them';
        prevTs = m.ts;
        const date = localDate(m.ts);
        if (cutoffDate && date < cutoffDate && !needsBackfill.has(friendId)) continue;
        const a = agg(friendId, date, 'text');
        if (a.sent + a.received === 0) a.initiated_by = exchangeInitiator;
        if (m.fromMe) a.sent++; else a.received++;
      }
    }

    // Reply-time pass: latency = their reply minus the owner's most recent text
    // before it; "awaiting" = his oldest text of the current unanswered run.
    const ninetyDaysAgo = Date.now() / 1000 - 90 * 86400;
    for (const [friendId, msgs] of perFriend) {
      const latencies: number[] = [];
      let myLastTs: number | null = null;   // most recent outbound still unanswered
      let pendingSince: number | null = null; // first outbound of that unanswered run
      for (const m of msgs) {
        if (m.fromMe) {
          if (pendingSince == null) pendingSince = m.ts;
          myLastTs = m.ts;
        } else {
          if (myLastTs != null && m.ts >= ninetyDaysAgo) {
            latencies.push((m.ts - myLastTs) / 60);
          }
          myLastTs = null;
          pendingSince = null;
        }
      }
      latencies.sort((a, b) => a - b);
      replyStats.set(friendId, {
        medianMin: latencies.length > 0 ? Math.round(latencies[Math.floor(latencies.length / 2)]) : null,
        samples: latencies.length,
        awaitingSince: pendingSince != null ? new Date(pendingSince * 1000).toISOString() : null,
      });
    }
  }

  // 6. Calls (synced from iPhone via Continuity — may lag or be partial)
  const callSnap = snapshotDb(
    path.join(HOME, 'Library/Application Support/CallHistoryDB/CallHistory.storedata'), 'calls',
  );
  if (callSnap) {
    type Call = { address: string; originated: number; answered: number; ts: number; duration: number };
    const calls = query<Call>(callSnap, `
      SELECT CAST(ZADDRESS AS TEXT) AS address, ZORIGINATED AS originated,
             ZANSWERED AS answered, CAST(ZDATE AS REAL) + ${APPLE_EPOCH} AS ts,
             COALESCE(ZDURATION, 0) AS duration
      FROM ZCALLRECORD WHERE ZADDRESS IS NOT NULL ORDER BY ts ASC`);
    console.log(`${calls.length} calls in call history`);

    for (const c of calls) {
      const friendId = friendForHandle(c.address);
      if (!friendId) continue;
      const date = localDate(c.ts);
      if (cutoffDate && date < cutoffDate && !needsBackfill.has(friendId)) continue;
      const a = agg(friendId, date, 'call');
      const out = c.originated === 1;
      if (a.callsOut + a.callsIn === 0) a.initiated_by = out ? 'me' : 'them';
      if (out) a.callsOut++; else a.callsIn++;
      if (c.answered !== 1) a.missed++;
      a.durationS += c.duration;
    }
  }

  // 7. Upsert interactions
  const rows = [...aggs.values()].map(a => {
    const source = a.type === 'text' ? 'imessage' : 'call_log';
    let notes: string;
    if (a.type === 'text') {
      const total = a.sent + a.received;
      notes = `${total} text${total === 1 ? '' : 's'} · ${a.sent} sent / ${a.received} received`;
    } else {
      const total = a.callsOut + a.callsIn;
      const mins = Math.round(a.durationS / 60);
      notes = `${total} call${total === 1 ? '' : 's'}${mins > 0 ? ` · ${mins}m` : ''}${a.missed ? ` · ${a.missed} missed` : ''}`;
    }
    return {
      friend_id:    a.friendId,
      date:         a.date,
      type:         a.type,
      source,
      external_key: `${source}:${a.friendId}:${a.date}`,
      initiated_by: a.initiated_by,
      notes,
      meta: a.type === 'text'
        ? { sent: a.sent, received: a.received }
        : { calls_out: a.callsOut, calls_in: a.callsIn, missed: a.missed, duration_s: a.durationS },
    };
  });

  const friendsTouched = new Set(rows.map(r => r.friend_id));
  console.log(`${rows.length} day-rows across ${friendsTouched.size} friend(s)`);

  if (DRY_RUN) {
    const nameOf = new Map(friends.map(f => [f.id, f.name]));
    for (const r of rows.slice(-20)) {
      console.log(`  ${r.date} ${nameOf.get(r.friend_id)} [${r.type}] ${r.initiated_by === 'me' ? 'I reached out' : 'they reached out'} — ${r.notes}`);
    }
    if (rows.length > 20) console.log(`  … and ${rows.length - 20} earlier rows`);
    for (const [fid, rs] of replyStats) {
      if (!rs.awaitingSince) continue;
      const days = Math.floor((Date.now() - new Date(rs.awaitingSince).getTime()) / 86_400_000);
      if (days >= 3) console.log(`  ⏳ ${nameOf.get(fid)} — no reply for ${days}d (typical: ${rs.medianMin ?? '?'}m)`);
    }
    return;
  }

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('friend_interactions')
      .upsert(batch, { onConflict: 'external_key' });
    if (error) throw new Error(`upsert: ${error.message}`);
  }

  // Mark first-time friends as backfilled so future runs stay incremental
  if (needsBackfill.size > 0) {
    const { error } = await supabase
      .from('friends')
      .update({ comms_backfilled_at: new Date().toISOString() })
      .in('id', [...needsBackfill]);
    if (error) console.error('backfill stamp:', error.message);
  }

  // 7b. Reply-time stats → friends (every matchable friend, so stale
  // "awaiting" flags clear once they answer or the thread goes quiet)
  let awaitingCount = 0;
  for (const f of friends) {
    if (!matchable.has(f.id)) continue;
    const rs = replyStats.get(f.id) ?? { medianMin: null, samples: 0, awaitingSince: null };
    if (rs.awaitingSince) awaitingCount++;
    const { error } = await supabase.from('friends').update({
      reply_median_minutes: rs.medianMin,
      reply_samples:        rs.samples,
      awaiting_reply_since: rs.awaitingSince,
    }).eq('id', f.id);
    if (error) { console.error(`reply stats ${f.name}: ${error.message}`); break; }
  }
  console.log(`Reply stats updated (${awaitingCount} unanswered thread${awaitingCount === 1 ? '' : 's'})`);

  // 8. Recompute last_contacted_at + consecutive_me_count from the full log
  for (const friendId of friendsTouched) {
    const { data: inter, error } = await supabase
      .from('friend_interactions')
      .select('date, initiated_by')
      .eq('friend_id', friendId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !inter || inter.length === 0) continue;

    let consec = 0;
    for (const it of inter) {
      if (it.initiated_by === 'me') consec++;
      else break;
    }
    await supabase.from('friends')
      .update({ last_contacted_at: inter[0].date, consecutive_me_count: consec })
      .eq('id', friendId);
  }

  console.log(`Done: ${rows.length} interactions upserted, ${friendsTouched.size} friends updated`);
}

// the owner's router DNS flaps intermittently — retry the whole (idempotent) run
// instead of letting one bad lookup kill the scheduled sync.
async function run() {
  for (let attempt = 1; ; attempt++) {
    try { await main(); return; }
    catch (e) {
      if (attempt >= 3) throw e;
      console.error(`Attempt ${attempt}/3 failed (${e instanceof Error ? e.message : e}) — retrying in 60s`);
      await new Promise(r => setTimeout(r, 60_000));
    }
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
