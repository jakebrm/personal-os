/**
 * Import handwritten journal and habit tracker photos.
 * Usage: npx ts-node --project scripts/tsconfig.json scripts/import-journal-photos.ts /path/to/photos
 * Add --auto to skip all confirmations and trust Claude's extractions (required when running non-interactively).
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import sharp from 'sharp';

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

const env = { ...process.env, ...readEnvFile() } as Record<string, string>;

function requireEnv(key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

// ─── clients ──────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });

const supabase: SupabaseClient = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

// ─── readline ─────────────────────────────────────────────────────────────────

const AUTO = process.argv.includes('--auto');

const rl = AUTO
  ? null
  : readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, autoAnswer = 'y'): Promise<string> {
  if (AUTO) {
    console.log(`  [auto] ${question}${autoAnswer}`);
    return Promise.resolve(autoAnswer);
  }
  return new Promise(resolve => rl!.question(question, answer => resolve(answer.trim())));
}

// ─── image helpers ────────────────────────────────────────────────────────────

async function toBase64(filePath: string): Promise<string> {
  const buf = await sharp(filePath)
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return buf.toString('base64');
}

// ─── claude vision ────────────────────────────────────────────────────────────

function parseJson<T>(raw: string): T | null {
  // strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

async function visionCall(imageB64: string, prompt: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageB64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  const block = msg.content.find(b => b.type === 'text');
  return block && block.type === 'text' ? block.text : '';
}

// ─── month/year helpers ───────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function monthName(m: number): string {
  return MONTH_NAMES[m - 1] ?? String(m);
}

function firstDay(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function lastDay(year: number, month: number): string {
  const d = new Date(year, month, 0); // day 0 of next month = last day of this month
  return `${year}-${String(month).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── goal categories (shared) ─────────────────────────────────────────────────

const VALID_CATEGORIES = ['fitness','faith','academic','finance','professional','other'] as const;
type Category = typeof VALID_CATEGORIES[number];

function coerceCategory(c: string | undefined): Category {
  return VALID_CATEGORIES.includes(c as Category) ? (c as Category) : 'other';
}

/**
 * Insert a goal only if an identical one (same title + timeframe + start_date)
 * does not already exist. Makes the import safe to re-run.
 */
async function insertGoalIfNew(fields: {
  title: string;
  category: Category;
  timeframe: string;
  target_value: number;
  target_unit: string;
  start_date: string;
  end_date: string;
}): Promise<boolean> {
  const { data: existing } = await supabase
    .from('goals')
    .select('id')
    .eq('title', fields.title)
    .eq('timeframe', fields.timeframe)
    .eq('start_date', fields.start_date)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`    Goal already exists, skipping: "${fields.title}" (${fields.start_date})`);
    return false;
  }

  const { error } = await supabase.from('goals').insert({
    ...fields,
    metric_source: 'manual',
    status: 'active',
  });

  if (error) {
    console.error(`    Error writing goal "${fields.title}": ${error.message}`);
    return false;
  }
  return true;
}

// ─── page type detection ──────────────────────────────────────────────────────

type PageType = 'monthly_tracker' | 'goals' | 'unknown';

async function classifyPage(imageB64: string): Promise<PageType> {
  const raw = await visionCall(imageB64,
    'Look at this handwritten page. Is it:\n' +
    'A) A monthly habit tracker / journal with daily entries\n' +
    'B) A goals list (yearly goals, 5-year goals, bucket list, etc.)\n\n' +
    'Return only JSON: { "type": "monthly_tracker" } or { "type": "goals" } or { "type": "unknown" }',
  );
  const parsed = parseJson<{ type: string }>(raw);
  if (parsed?.type === 'goals') return 'goals';
  if (parsed?.type === 'monthly_tracker') return 'monthly_tracker';
  return 'unknown';
}

// ─── step 1: month/year ───────────────────────────────────────────────────────

async function extractMonthYear(
  imageB64: string,
  filename: string,
): Promise<{ month: number; year: number }> {
  const raw = await visionCall(imageB64,
    'This is a handwritten journal and habit tracker page.\n' +
    'What month and year is shown at the top of this page?\n' +
    'Return only: { "month": number, "year": number }\n' +
    'If you cannot read it clearly, return: { "unclear": true }',
  );

  const parsed = parseJson<{ month?: number; year?: number; unclear?: boolean }>(raw);

  if (parsed && !parsed.unclear && parsed.month && parsed.year) {
    console.log(`  Detected: ${monthName(parsed.month)} ${parsed.year}`);
    return { month: parsed.month, year: parsed.year };
  }

  console.log(`  Cannot read date on ${filename} — please enter month and year manually:`);
  const monthStr = await ask('  Month (1-12): ');
  const yearStr = await ask('  Year (e.g. 2025): ');
  return { month: parseInt(monthStr, 10), year: parseInt(yearStr, 10) };
}

// ─── step 2: habits list ──────────────────────────────────────────────────────

async function extractHabits(
  imageB64: string,
  month: number,
  year: number,
): Promise<string[]> {
  const label = `${monthName(month)} ${year}`;
  const raw = await visionCall(imageB64,
    `This is a handwritten habit tracker for ${label}.\n` +
    'List all the habits being tracked as column headers or row labels.\n' +
    'Return only: { "habits": string[] }\n' +
    'If unclear, return: { "unclear": true, "habits": [] }',
  );

  const parsed = parseJson<{ habits: string[]; unclear?: boolean }>(raw);
  const habits: string[] = parsed?.habits ?? [];

  console.log(`\n  Found these habits for ${label}:`);
  habits.forEach((h, i) => console.log(`    ${i + 1}. ${h}`));
  console.log();

  const answer = await ask(
    `  Are these correct? (y to confirm, or type a comma-separated corrections list): `,
  );

  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    return habits;
  }

  // user typed corrections
  return answer.split(',').map(s => s.trim()).filter(Boolean);
}

// ─── step 2b: monthly goals written on the tracker ────────────────────────────

interface MonthlyGoal {
  title:    string;
  target:   number;
  unit:     string;
  category: string;
}

async function extractMonthlyGoals(
  imageB64: string,
  month: number,
  year: number,
): Promise<MonthlyGoal[]> {
  const label = `${monthName(month)} ${year}`;
  const raw = await visionCall(imageB64,
    `This is a handwritten monthly habit tracker / journal for ${label}.\n` +
    `Look VERY carefully in the TOP-RIGHT CORNER / upper margin of the page for a small box ` +
    `usually labelled "Goals:" (it may be faint, small, or partially cut off at the top edge of the photo). ` +
    `It lists the month's targets, e.g. "Read 20 days", "Workout 16 times", "Hit 10k steps 20 days", ` +
    `"Exercise", "Save $500". Read every line you can make out, even if partially cropped.\n` +
    `Also check any other margin or sidebar for written monthly goals.\n` +
    `Do NOT include the daily habit checkboxes or the habit column headers of the grid — only the ` +
    `explicit written goals/targets from the "Goals" box or margins.\n` +
    `For each goal, extract its text, a numeric target if one is present (else 1), a unit ` +
    `(e.g. days, times, books, $; else "completion"), and a category from: ` +
    `fitness, faith, academic, finance, professional, other.\n` +
    `Return only JSON: { "goals": [{ "title": string, "target": number, "unit": string, "category": string }] }\n` +
    `If there are genuinely no goals written anywhere on the page, return { "goals": [] }.`,
  );

  const parsed = parseJson<{ goals: MonthlyGoal[] }>(raw);
  const goals = Array.isArray(parsed?.goals) ? parsed!.goals : [];

  if (goals.length === 0) {
    console.log(`  No monthly goals found on this ${label} page.`);
    return [];
  }

  console.log(`\n  Found these monthly goals for ${label}:`);
  goals.forEach((g, i) => console.log(`    ${i + 1}. ${g.title} (${g.target} ${g.unit}, ${g.category})`));

  if (AUTO) return goals;

  const answer = await ask('  Save these monthly goals? (y to confirm, n to skip): ');
  return answer.toLowerCase().startsWith('y') ? goals : [];
}

async function writeMonthlyGoals(
  goals: MonthlyGoal[],
  month: number,
  year: number,
): Promise<number> {
  let written = 0;
  for (const g of goals) {
    const ok = await insertGoalIfNew({
      title:        g.title,
      category:     coerceCategory(g.category),
      timeframe:    'monthly',
      target_value: Number.isFinite(g.target) && g.target > 0 ? g.target : 1,
      target_unit:  g.unit?.trim() || 'completion',
      start_date:   firstDay(year, month),
      end_date:     lastDay(year, month),
    });
    if (ok) written++;
  }
  return written;
}

// ─── step 3: daily data ───────────────────────────────────────────────────────

interface DayEntry {
  day: number;
  notes: string;
  completed_habits: string[];
  incomplete_habits: string[];
  unclear: boolean;
}

async function extractDailyData(
  imageB64: string,
  month: number,
  year: number,
): Promise<DayEntry[]> {
  const label = `${monthName(month)} ${year}`;
  const raw = await visionCall(imageB64,
    `This is a handwritten journal and habit tracker for ${label}.\n` +
    'For each day that has an entry, extract:\n' +
    '1. The date number\n' +
    '2. Any written notes or journal text for that day\n' +
    '3. Which habits were checked/completed\n' +
    '4. Which habits were NOT completed\n\n' +
    'Return as JSON array:\n' +
    '[{\n' +
    '  "day": number,\n' +
    '  "notes": string,\n' +
    '  "completed_habits": string[],\n' +
    '  "incomplete_habits": string[],\n' +
    '  "unclear": boolean\n' +
    '}]\n\n' +
    'For any day where you are not confident, set "unclear": true',
  );

  const parsed = parseJson<DayEntry[]>(raw);
  return Array.isArray(parsed) ? parsed : [];
}

// ─── step 4: review unclear entries ──────────────────────────────────────────

async function reviewUnclear(
  entries: DayEntry[],
  allHabits: string[],
  month: number,
  year: number,
): Promise<DayEntry[]> {
  const label = `${monthName(month)} ${year}`;
  const reviewed: DayEntry[] = [];

  for (const entry of entries) {
    if (!entry.unclear) {
      reviewed.push(entry);
      continue;
    }

    console.log(`\n  Day ${entry.day} in ${label} is unclear.`);
    if (entry.notes) console.log(`  Notes extracted: ${entry.notes}`);
    console.log(`  All habits: ${allHabits.join(', ')}`);

    if (AUTO) {
      // In auto mode, keep whatever Claude extracted even if unclear
      reviewed.push({ ...entry, unclear: false });
      continue;
    }

    const answer = await ask(
      `  Completed habits (comma-separated) or "skip": `,
    );

    if (answer.toLowerCase() === 'skip') continue;

    const confirmed = answer.split(',').map(s => s.trim()).filter(Boolean);
    reviewed.push({
      ...entry,
      completed_habits: confirmed,
      incomplete_habits: allHabits.filter(h => !confirmed.includes(h)),
      unclear: false,
    });
  }

  return reviewed;
}

// ─── step 5: write to supabase ────────────────────────────────────────────────

async function writeJournalEntry(
  userId: string,
  date: string,
  content: string,
): Promise<boolean> {
  // Never overwrite existing entries with source = 'garmin'
  const { data: existing } = await supabase
    .from('journal_entries')
    .select('source')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (existing?.source === 'garmin') {
    console.log(`    Skipping journal ${date}: existing Garmin entry preserved`);
    return false;
  }

  const { error } = await supabase
    .from('journal_entries')
    .upsert({ user_id: userId, date, content, source: 'import' }, { onConflict: 'user_id,date' });

  if (error) throw new Error(`journal_entries upsert failed for ${date}: ${error.message}`);
  return true;
}

async function writeDailyLog(
  date: string,
  completedHabits: string[],
  allHabits: string[],
): Promise<void> {
  // Read existing row to avoid clobbering Garmin/health data in notes
  const { data: existing } = await supabase
    .from('daily_logs')
    .select('id, notes')
    .eq('log_date', date)
    .maybeSingle();

  const existingNotes = (existing?.notes as Record<string, unknown>) ?? {};
  const mergedNotes = {
    ...existingNotes,
    habits: { done: completedHabits, total: allHabits.length },
  };

  const { error } = await supabase
    .from('daily_logs')
    .upsert({ ...(existing?.id ? { id: existing.id } : {}), log_date: date, notes: mergedNotes },
      { onConflict: 'log_date' });

  if (error) throw new Error(`daily_logs upsert failed for ${date}: ${error.message}`);
}

async function upsertHabitConfig(
  userId: string,
  habits: string[],
  month: number,
  year: number,
): Promise<void> {
  const validFrom = firstDay(year, month);
  const validTo = lastDay(year, month);

  // Delete any existing config for this exact range then insert fresh
  await supabase
    .from('habit_configs')
    .delete()
    .eq('user_id', userId)
    .eq('valid_from', validFrom)
    .eq('valid_to', validTo);

  const { error } = await supabase
    .from('habit_configs')
    .insert({ user_id: userId, habits, valid_from: validFrom, valid_to: validTo });

  if (error) throw new Error(`habit_configs insert failed: ${error.message}`);
}

// ─── step 6: goals page ───────────────────────────────────────────────────────

async function handleGoalsPage(imageB64: string): Promise<number> {
  const raw = await visionCall(imageB64,
    'This is a handwritten goals list.\n' +
    'Extract every goal written on this page.\n' +
    'Return only JSON: { "goals": string[] }',
  );

  const parsed = parseJson<{ goals: string[] }>(raw);
  const goals = parsed?.goals ?? [];

  if (goals.length === 0) {
    console.log('  No goals extracted from this page.');
    return 0;
  }

  let written = 0;

  // In auto mode, ask Claude to categorize all goals at once
  let autoMeta: Array<{ goal: string; category: string; year: string }> = [];
  if (AUTO && goals.length > 0) {
    const metaRaw = await visionCall(imageB64,
      `Categorize each of these goals. For each, pick a category from: fitness, faith, academic, finance, professional, other.\n` +
      `Also pick a year: 2025, 2026, or 5-year.\n` +
      `Goals:\n${goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}\n\n` +
      `Return JSON array: [{ "goal": string, "category": string, "year": string }]`,
    );
    autoMeta = parseJson<typeof autoMeta>(metaRaw) ?? [];
  }

  for (const goalText of goals) {
    console.log(`\n  Found goal: "${goalText}"`);

    let catAnswer: string;
    let yearAnswer: string;

    if (AUTO) {
      const meta = autoMeta.find(m => m.goal === goalText) ?? autoMeta[goals.indexOf(goalText)];
      catAnswer = meta?.category ?? 'other';
      yearAnswer = meta?.year ?? '2026';
      console.log(`  [auto] category=${catAnswer} year=${yearAnswer}`);
    } else {
      catAnswer = await ask(`  Category? (${VALID_CATEGORIES.join('/')}): `);
      yearAnswer = await ask('  Year? (2025 / 2026 / 5-year): ');
    }

    const category = coerceCategory(catAnswer);

    let timeframe: string;
    let startDate: string;
    let endDate: string;

    if (yearAnswer === '5-year') {
      timeframe = 'custom';
      startDate = '2025-01-01';
      endDate = '2029-12-31';
    } else {
      const yr = parseInt(yearAnswer, 10) || new Date().getFullYear();
      timeframe = 'yearly';
      startDate = `${yr}-01-01`;
      endDate = `${yr}-12-31`;
    }

    const ok = await insertGoalIfNew({
      title: goalText,
      category,
      timeframe,
      target_value: 1,
      target_unit: 'completion',
      start_date: startDate,
      end_date: endDate,
    });
    if (ok) written++;
  }

  return written;
}

// ─── per-image processor ──────────────────────────────────────────────────────

interface ImageStats {
  filename: string;
  journalEntries: number;
  habitsLogged: number;
  goalsWritten: number;
  skipped: number;
  error?: string;
}

async function processImage(filePath: string): Promise<ImageStats> {
  const filename = path.basename(filePath);
  const stats: ImageStats = { filename, journalEntries: 0, habitsLogged: 0, goalsWritten: 0, skipped: 0 };
  const USER_ID = 'owner';

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Processing: ${filename}`);

  try {
    const imageB64 = await toBase64(filePath);

    // classify first
    const pageType = await classifyPage(imageB64);
    console.log(`  Page type: ${pageType}`);

    if (pageType === 'goals') {
      stats.goalsWritten = await handleGoalsPage(imageB64);
      console.log(`  Goals written: ${stats.goalsWritten}`);
      return stats;
    }

    if (pageType === 'unknown') {
      console.log('  Unknown page type — skipping');
      stats.skipped = 1;
      return stats;
    }

    // monthly_tracker flow
    const { month, year } = await extractMonthYear(imageB64, filename);

    const habits = await extractHabits(imageB64, month, year);
    if (habits.length === 0) {
      console.log('  No habits confirmed — skipping habit config');
    } else {
      await upsertHabitConfig(USER_ID, habits, month, year);
      console.log(`  Habit config saved: ${habits.length} habits`);
    }

    // Monthly goals written on the tracker (margin / goals box)
    const monthlyGoals = await extractMonthlyGoals(imageB64, month, year);
    if (monthlyGoals.length > 0) {
      stats.goalsWritten = await writeMonthlyGoals(monthlyGoals, month, year);
      console.log(`  Monthly goals saved: ${stats.goalsWritten}/${monthlyGoals.length}`);
    }

    let entries = await extractDailyData(imageB64, month, year);
    console.log(`  Raw day entries extracted: ${entries.length}`);

    entries = await reviewUnclear(entries, habits, month, year);

    for (const entry of entries) {
      const date = isoDate(year, month, entry.day);

      if (entry.notes?.trim()) {
        const wrote = await writeJournalEntry(USER_ID, date, entry.notes.trim());
        if (wrote) stats.journalEntries++;
        else stats.skipped++;
      }

      if (habits.length > 0 && entry.completed_habits.length + entry.incomplete_habits.length > 0) {
        await writeDailyLog(date, entry.completed_habits, habits);
        stats.habitsLogged++;
      }
    }

  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err);
    console.error(`  ERROR: ${stats.error}`);
  }

  return stats;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const folderArg = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1])
    ?? `${process.env.HOME}/journalimport`;
  const folder = path.resolve(folderArg);

  if (!fs.existsSync(folder)) {
    console.error(`Folder not found: ${folder}`);
    process.exit(1);
  }

  const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.JPG', '.JPEG']);
  const files = fs.readdirSync(folder)
    .filter(f => IMAGE_EXTS.has(path.extname(f)))
    .map(f => path.join(folder, f))
    .sort();

  if (files.length === 0) {
    console.error(`No JPEG images found in: ${folder}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} image(s) in ${folder}\n`);

  const allStats: ImageStats[] = [];
  for (const file of files) {
    const stats = await processImage(file);
    allStats.push(stats);
  }

  rl?.close();

  // ─── summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('IMPORT SUMMARY');
  console.log('═'.repeat(60));

  let totalJournal = 0, totalHabits = 0, totalGoals = 0, totalSkipped = 0, totalErrors = 0;

  for (const s of allStats) {
    const status = s.error ? '✗' : '✓';
    console.log(
      `${status} ${s.filename}: ` +
      `${s.journalEntries} journal, ${s.habitsLogged} habit days, ` +
      `${s.goalsWritten} goals, ${s.skipped} skipped` +
      (s.error ? ` [ERROR: ${s.error}]` : ''),
    );
    totalJournal += s.journalEntries;
    totalHabits += s.habitsLogged;
    totalGoals += s.goalsWritten;
    totalSkipped += s.skipped;
    if (s.error) totalErrors++;
  }

  console.log('─'.repeat(60));
  console.log(
    `Total: ${totalJournal} journal entries, ${totalHabits} habit days, ` +
    `${totalGoals} goals, ${totalSkipped} skipped, ${totalErrors} errors`,
  );
}

main().catch(err => {
  console.error('Fatal:', err);
  rl?.close();
  process.exit(1);
});
