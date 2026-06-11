/**
 * Sync the Obsidian vault into Supabase.
 *
 * Mirrors every markdown note into `vault_notes` (full content) and embeds
 * changed notes into `memory_chunks` (source_type 'vault_note') so they show
 * up in Brain search and /api/memory/ask. Incremental: only notes whose
 * content hash changed are re-written/re-embedded; notes deleted from the
 * vault are removed from both tables.
 *
 * Usage: npm run sync:vault [-- --dry-run]
 * Vault location defaults to the owner's iCloud vault; override with OBSIDIAN_VAULT_PATH.
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

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

const VAULT_PATH =
  env.OBSIDIAN_VAULT_PATH ??
  path.join(process.env.HOME ?? '', 'Library/Mobile Documents/com~apple~CloudDocs/Obsidian Vault');

const DRY_RUN = process.argv.includes('--dry-run');

// Never sync these to the cloud, even though they live in the vault.
const EXCLUDED_BASENAMES = new Set(['Passwords.md']);
const EXCLUDED_DIRS = new Set(['.obsidian', '.trash']);

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);
const openai = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') });

// ─── vault reading ────────────────────────────────────────────────────────────

interface VaultNote {
  path: string;        // vault-relative
  title: string;
  folder: string;
  tags: string[];
  content: string;
  contentHash: string;
  fileMtime: string;
}

function walkMarkdown(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) walkMarkdown(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.md')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Notes mostly have no YAML frontmatter; tags appear as `Tags: [[Foo]] [[Bar]]`
// lines with wiki-links (sometimes aliased: [[5 - Templates/Networking|Networking]]).
function extractTags(content: string): string[] {
  const tags = new Set<string>();

  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const tagLine = fm[1].match(/^tags:\s*\[?(.*?)\]?\s*$/m);
    if (tagLine) {
      for (const t of tagLine[1].split(',')) {
        const clean = t.trim().replace(/^['"#]|['"]$/g, '');
        if (clean) tags.add(clean);
      }
    }
    if (/^private:\s*true\s*$/m.test(fm[1])) tags.add('__private__');
  }

  for (const line of content.split('\n')) {
    if (!/^tags?\s*:/i.test(line.trim())) continue;
    for (const m of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const inner = m[1];
      const alias = inner.includes('|') ? inner.split('|').pop()! : inner.split('/').pop()!;
      if (alias.trim()) tags.add(alias.trim());
    }
  }

  return [...tags];
}

function readVault(): VaultNote[] {
  if (!fs.existsSync(VAULT_PATH)) {
    console.error(`Vault not found at ${VAULT_PATH}`);
    process.exit(1);
  }

  const notes: VaultNote[] = [];
  let skipped = 0;

  for (const abs of walkMarkdown(VAULT_PATH)) {
    const rel = path.relative(VAULT_PATH, abs);
    if (EXCLUDED_BASENAMES.has(path.basename(abs))) { skipped++; continue; }

    const content = fs.readFileSync(abs, 'utf8');
    const tags = extractTags(content);
    if (tags.includes('__private__')) { skipped++; continue; }

    notes.push({
      path: rel,
      title: path.basename(abs, '.md'),
      folder: path.dirname(rel) === '.' ? '' : path.dirname(rel),
      tags,
      content,
      contentHash: crypto.createHash('sha256').update(content).digest('hex'),
      fileMtime: fs.statSync(abs).mtime.toISOString(),
    });
  }

  if (skipped) console.log(`Skipped ${skipped} excluded/private note(s)`);
  return notes;
}

// ─── chunking + embedding ─────────────────────────────────────────────────────

// Split on blank lines, packing paragraphs into ~1500-char chunks so each
// embedding stays focused. Hard-split any single paragraph longer than that.
function chunkContent(content: string, max = 1500): string[] {
  const paras = content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = '';

  for (const para of paras) {
    if (para.length > max) {
      if (cur) { chunks.push(cur); cur = ''; }
      for (let i = 0; i < para.length; i += max) chunks.push(para.slice(i, i + max));
    } else if (cur.length + para.length + 2 > max) {
      chunks.push(cur);
      cur = para;
    } else {
      cur = cur ? `${cur}\n\n${para}` : para;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function embedNote(note: VaultNote): Promise<void> {
  // Replace any existing chunks for this note, then re-embed.
  const { error: delErr } = await supabase
    .from('memory_chunks')
    .delete()
    .eq('metadata->>source_type', 'vault_note')
    .eq('metadata->>source_id', note.path);
  if (delErr) throw delErr;

  const chunks = chunkContent(note.content).map((c) => `${note.title}\n\n${c}`);
  if (chunks.length === 0) return;

  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunks.map((c) => c.slice(0, 8000)),
  });

  const rows = chunks.map((c, i) => ({
    content: c.slice(0, 2000),
    embedding: res.data[i].embedding,
    entity_id: null,
    metadata: { source_type: 'vault_note', source_id: note.path, title: note.title },
  }));

  const { error: insErr } = await supabase.from('memory_chunks').insert(rows);
  if (insErr) throw insErr;
}

// ─── sync ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Vault: ${VAULT_PATH}${DRY_RUN ? ' (dry run)' : ''}`);
  const notes = readVault();
  console.log(`Found ${notes.length} note(s)`);

  const { data: existing, error } = await supabase
    .from('vault_notes')
    .select('path, content_hash');
  if (error) { console.error('Failed to read vault_notes:', error.message); process.exit(1); }

  const existingByPath = new Map((existing ?? []).map((r) => [r.path, r.content_hash]));
  const vaultPaths = new Set(notes.map((n) => n.path));

  const changed = notes.filter((n) => existingByPath.get(n.path) !== n.contentHash);
  const removed = [...existingByPath.keys()].filter((p) => !vaultPaths.has(p));

  console.log(`${changed.length} new/changed, ${removed.length} removed, ${notes.length - changed.length} unchanged`);
  if (DRY_RUN) {
    for (const n of changed) console.log(`  ~ ${n.path}`);
    for (const p of removed) console.log(`  - ${p}`);
    return;
  }

  let synced = 0;
  for (const note of changed) {
    const { error: upErr } = await supabase.from('vault_notes').upsert(
      {
        path: note.path,
        title: note.title,
        folder: note.folder,
        tags: note.tags,
        content: note.content,
        content_hash: note.contentHash,
        file_mtime: note.fileMtime,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'path' },
    );
    if (upErr) { console.error(`  ✗ ${note.path}: ${upErr.message}`); continue; }

    try {
      await embedNote(note);
    } catch (e) {
      console.error(`  ✗ embed ${note.path}:`, e instanceof Error ? e.message : e);
      continue;
    }
    synced++;
    console.log(`  ✓ ${note.path}`);
  }

  for (const p of removed) {
    await supabase.from('vault_notes').delete().eq('path', p);
    await supabase
      .from('memory_chunks')
      .delete()
      .eq('metadata->>source_type', 'vault_note')
      .eq('metadata->>source_id', p);
    console.log(`  - ${p}`);
  }

  console.log(`Done: ${synced} synced, ${removed.length} removed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
