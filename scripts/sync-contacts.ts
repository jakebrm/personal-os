/**
 * Sync the macOS address book (Contacts.app / iCloud) into `contact_inbox`.
 *
 * Each person becomes an inbox row keyed by their stable Contacts.app id.
 * New contacts land as status 'pending' for triage in the Friends deep —
 * unless their name exactly matches an existing friend, in which case they
 * are auto-linked (status 'imported') and the friend's missing birthday /
 * phone / email / city / nickname are backfilled from the address book.
 *
 * Re-runs are safe: existing rows get their contact fields refreshed but keep
 * their triage status; pending rows whose contact was deleted from the
 * address book are pruned. Company cards (businesses) are skipped.
 *
 * Usage: npm run sync:contacts [-- --dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';
import * as dns from 'dns';
import * as fs from 'fs';
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

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

// ─── address book export (JXA) ────────────────────────────────────────────────

interface ExportedContact {
  id: string;
  name: string;
  nickname: string | null;
  organization: string | null;
  isCompany: boolean;
  birthday: [number, number, number] | null; // [year, month, day]
  phones: string[];
  emails: string[];
  city: string | null;
}

// Bulk property reads (`people.name()` etc.) are one Apple event each, so the
// whole export is a handful of round-trips instead of thousands.
const JXA = `
function run() {
  const Contacts = Application('Contacts');
  const people = Contacts.people;
  const ids = people.id();
  const names = people.name();
  const nicknames = people.nickname();
  const orgs = people.organization();
  const companies = people.company();
  const bdays = people.birthDate();
  const phones = people.phones.value();
  const emails = people.emails.value();
  const cities = people.addresses.city();
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    const bd = bdays[i];
    out.push({
      id: ids[i],
      name: names[i],
      nickname: nicknames[i] || null,
      organization: orgs[i] || null,
      isCompany: companies[i] === true,
      birthday: bd ? [bd.getFullYear(), bd.getMonth() + 1, bd.getDate()] : null,
      phones: (phones[i] || []).filter(p => !!p),
      emails: (emails[i] || []).filter(e => !!e),
      city: (cities[i] || []).find(c => !!c) || null,
    });
  }
  return JSON.stringify(out);
}`;

function readAddressBook(): ExportedContact[] {
  const json = execFileSync('osascript', ['-l', 'JavaScript', '-e', JXA], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const all = JSON.parse(json) as ExportedContact[];
  const people = all.filter(c => !c.isCompany && c.name && c.name.trim());
  console.log(`Address book: ${all.length} cards → ${people.length} people (${all.length - people.length} companies/blank skipped)`);
  return people;
}

// Contacts.app uses year 1604 for birthdays with no birth year — keep the
// month/day, store sentinel year 1900 (everything downstream only reads MM-DD).
function birthdayStr(bd: [number, number, number] | null): string | null {
  if (!bd) return null;
  const [y, m, d] = bd;
  const year = y >= 1900 ? y : 1900;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// ─── sync ─────────────────────────────────────────────────────────────────────

interface InboxPayload {
  external_id: string;
  name: string;
  nickname: string | null;
  organization: string | null;
  phones: string[];
  emails: string[];
  birthday: string | null;
  city: string | null;
  status?: 'pending' | 'imported';
  friend_id?: string | null;
}

async function main() {
  console.log(DRY_RUN ? '(dry run)' : 'Syncing contacts → contact_inbox');
  const contacts = readAddressBook();

  const { data: inboxRows, error: inboxErr } = await supabase
    .from('contact_inbox')
    .select('id, external_id, status')
    .eq('user_id', 'owner')
    .range(0, 9999);
  if (inboxErr) throw new Error(`Failed to read contact_inbox: ${inboxErr.message}`);

  const { data: friends, error: frErr } = await supabase
    .from('friends')
    .select('id, name, nickname, birthday, phone, email, city')
    .eq('user_id', 'owner');
  if (frErr) throw new Error(`Failed to read friends: ${frErr.message}`);

  const inboxByExt = new Map((inboxRows ?? []).map(r => [r.external_id as string, r]));
  const friendByName = new Map((friends ?? []).map(f => [norm(f.name as string), f]));

  // PostgREST bulk upserts use the union of keys across all rows, so new rows
  // (which carry status/friend_id) and refreshes (which must NOT touch the
  // existing triage status) go in separate batches with uniform keys.
  const inserts: InboxPayload[] = [];
  const updates: InboxPayload[] = [];
  let added = 0, autoLinked = 0, refreshed = 0, backfilled = 0;

  for (const c of contacts) {
    const payload: InboxPayload = {
      external_id: c.id,
      name: c.name.trim(),
      nickname: c.nickname,
      organization: c.organization,
      phones: c.phones,
      emails: c.emails,
      birthday: birthdayStr(c.birthday),
      city: c.city,
    };

    const existing = inboxByExt.get(c.id);
    const friendMatch = friendByName.get(norm(c.name));

    if (existing) {
      refreshed++; // contact fields refreshed, triage status untouched
      updates.push(payload);
      continue;
    }

    if (friendMatch) {
      // Already a friend — link instead of queueing for triage
      payload.status = 'imported';
      payload.friend_id = friendMatch.id as string;
      autoLinked++;

      const patch: Record<string, unknown> = {};
      if (!friendMatch.birthday && payload.birthday) patch.birthday = payload.birthday;
      if (!friendMatch.phone && c.phones[0]) patch.phone = c.phones[0];
      if (!friendMatch.email && c.emails[0]) patch.email = c.emails[0];
      if (!friendMatch.city && c.city) patch.city = c.city;
      if (!friendMatch.nickname && c.nickname) patch.nickname = c.nickname;
      if (Object.keys(patch).length > 0) {
        backfilled++;
        console.log(`  ⇆ ${c.name}: linked to existing friend, backfilling ${Object.keys(patch).join(', ')}`);
        if (!DRY_RUN) {
          const { error } = await supabase.from('friends').update(patch).eq('id', friendMatch.id);
          if (error) console.error(`  ✗ backfill ${c.name}: ${error.message}`);
        }
      }
    } else {
      payload.status = 'pending';
      payload.friend_id = null;
      added++;
    }

    inserts.push(payload);
  }

  // Prune pending rows whose contact no longer exists in the address book
  const exportedIds = new Set(contacts.map(c => c.id));
  const stale = (inboxRows ?? []).filter(r => r.status === 'pending' && !exportedIds.has(r.external_id as string));

  console.log(`${added} new, ${autoLinked} auto-linked to existing friends (${backfilled} backfilled), ${refreshed} refreshed, ${stale.length} stale pruned`);
  if (DRY_RUN) return;

  for (const rows of [inserts, updates]) {
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase
        .from('contact_inbox')
        .upsert(batch, { onConflict: 'user_id,external_id' });
      if (error) throw new Error(`Upsert batch failed: ${error.message}`);
    }
  }

  if (stale.length > 0) {
    const { error } = await supabase
      .from('contact_inbox')
      .delete()
      .in('id', stale.map(r => r.id));
    if (error) console.error(`Prune failed: ${error.message}`);
  }

  const { count } = await supabase
    .from('contact_inbox')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', 'owner')
    .eq('status', 'pending');
  console.log(`Done — ${count ?? '?'} contact(s) pending triage in the Friends inbox`);
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
