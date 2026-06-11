import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { embedAndStore } from '@/lib/embed';
import { formatDuration, dayLabel, timeLabel, type LearningEntry } from '@/lib/learning';

// Single-user personal OS — user is fixed, auth enforced by middleware.
const USER_ID = 'owner';

// ── Embedding (fire-and-forget) ──────────────────────────────────────────────

function embedContent(e: LearningEntry): string {
  const when = `${dayLabel(e.started_at)} at ${timeLabel(e.started_at)}`;
  const base = `Agency — ${formatDuration(e.duration_minutes)} on ${when}`;
  return e.note?.trim() ? `${base}: ${e.note}` : base;
}

async function deleteChunks(id: string): Promise<void> {
  await supabaseAdmin
    .from('memory_chunks')
    .delete()
    .eq('metadata->>source_type', 'learning_log')
    .eq('metadata->>source_id', id);
}

// Re-embed an entry: clear old chunks, then store fresh. Not awaited by callers.
function reembedFireAndForget(e: LearningEntry): void {
  (async () => {
    await deleteChunks(e.id);
    await embedAndStore({ content: embedContent(e), sourceType: 'learning_log', sourceId: e.id });
  })().catch((err) => console.error(`[embed] learning_log:${e.id}`, err));
}

// ── helpers ───────────────────────────────────────────────────────────────────

function parseDuration(body: Partial<LearningEntry>): number | null {
  const n = Number(body.duration_minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function parseStartedAt(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── GET ──────────────────────────────────────────────────────────────────────
// ?from=ISO / ?to=ISO  bound the window (started_at)
// default: last 30 days, started_at DESC
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    let q = supabaseAdmin
      .from('learning_log')
      .select('*')
      .eq('user_id', USER_ID)
      .order('started_at', { ascending: false });

    const from = searchParams.get('from');
    const to   = searchParams.get('to');
    if (from) q = q.gte('started_at', from);
    if (to)   q = q.lte('started_at', to);
    if (!from && !to) {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      q = q.gte('started_at', since);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ entries: (data ?? []) as LearningEntry[] });
  } catch (e) {
    console.error('[GET /api/learning]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<LearningEntry>;

    const duration_minutes = parseDuration(body);
    if (duration_minutes === null) {
      return NextResponse.json({ error: 'duration_minutes must be a positive number' }, { status: 400 });
    }

    // started_at defaults to now if not supplied.
    const started_at = parseStartedAt(body.started_at) ?? new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('learning_log')
      .insert({
        user_id: USER_ID,
        started_at,
        duration_minutes,
        note: body.note?.trim() || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const entry = data as LearningEntry;
    reembedFireAndForget(entry);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (e) {
    console.error('[POST /api/learning]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<LearningEntry> & { id?: string };
    const id = body.id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.duration_minutes !== undefined) {
      const d = parseDuration(body);
      if (d === null) return NextResponse.json({ error: 'duration_minutes must be a positive number' }, { status: 400 });
      patch.duration_minutes = d;
    }
    if (body.started_at !== undefined) {
      const s = parseStartedAt(body.started_at);
      if (s === null) return NextResponse.json({ error: 'invalid started_at' }, { status: 400 });
      patch.started_at = s;
    }
    if (body.note !== undefined) patch.note = body.note?.trim() || null;

    const { data, error } = await supabaseAdmin
      .from('learning_log')
      .update(patch)
      .eq('id', id)
      .eq('user_id', USER_ID)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const entry = data as LearningEntry;
    reembedFireAndForget(entry);
    return NextResponse.json({ entry });
  } catch (e) {
    console.error('[PATCH /api/learning]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────
// ?id=UUID  (or { id } in the JSON body)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') ?? (await req.json().catch(() => ({}))).id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('learning_log')
      .delete()
      .eq('id', id)
      .eq('user_id', USER_ID);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    deleteChunks(id).catch((err) => console.error(`[embed] learning_log delete:${id}`, err));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/learning]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
