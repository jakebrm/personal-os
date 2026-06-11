import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { embedAndStore } from '@/lib/embed';
import {
  WORKLOG_CATEGORIES, chicagoWeekStart, shiftWeeks,
  type WorkLogEntry, type WorkLogVisibility,
} from '@/lib/worklog';

// Single-user personal OS — user is fixed, auth enforced by middleware.
const USER_ID = 'owner';

const CATEGORIES   = WORKLOG_CATEGORIES;
const VISIBILITIES: readonly WorkLogVisibility[] = ['internal', 'client_facing', 'both'];

const VISIBILITY_TEXT: Record<WorkLogVisibility, string> = {
  internal:      'internal',
  client_facing: 'client-facing',
  both:          'internal & client-facing',
};

// ── Embedding (fire-and-forget) ──────────────────────────────────────────────

function embedContent(e: WorkLogEntry): string {
  const base = `Work Log — ${e.client_project} (${e.category}, ${VISIBILITY_TEXT[e.visibility]}): ${e.description}`;
  return e.impact?.trim() ? `${base}. Impact: ${e.impact}` : base;
}

// Remove any existing memory_chunks for this entry (used before re-embed / on delete).
async function deleteChunks(id: string): Promise<void> {
  await supabaseAdmin
    .from('memory_chunks')
    .delete()
    .eq('metadata->>source_type', 'work_log')
    .eq('metadata->>source_id', id);
}

// Re-embed an entry: clear old chunks, then store fresh. Errors are swallowed —
// the caller does NOT await this so the request returns immediately.
function reembedFireAndForget(e: WorkLogEntry): void {
  (async () => {
    await deleteChunks(e.id);
    await embedAndStore({ content: embedContent(e), sourceType: 'work_log', sourceId: e.id });
  })().catch((err) => console.error(`[embed] work_log:${e.id}`, err));
}

// ── GET ──────────────────────────────────────────────────────────────────────
// ?week=YYYY-MM-DD    filter to a specific week
// ?client=X           filter by client/project
// ?category=X         filter by category
// ?clients=1          return distinct client_project values (for autocomplete)
// default: last 4 weeks, week_start DESC, created_at DESC
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Distinct client/project names for the autocomplete datalist.
    if (searchParams.get('clients')) {
      const { data, error } = await supabaseAdmin
        .from('work_log')
        .select('client_project')
        .eq('user_id', USER_ID)
        .order('client_project', { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const clients = [...new Set((data ?? []).map((r) => r.client_project))];
      return NextResponse.json({ clients });
    }

    let q = supabaseAdmin
      .from('work_log')
      .select('*')
      .eq('user_id', USER_ID)
      .order('week_start', { ascending: false })
      .order('created_at', { ascending: false });

    const week = searchParams.get('week');
    if (week) {
      q = q.eq('week_start', week);
    } else {
      // Default window: current week + previous 3 (4 weeks inclusive).
      const from = shiftWeeks(chicagoWeekStart(), -3);
      q = q.gte('week_start', from);
    }

    const client = searchParams.get('client');
    if (client) q = q.eq('client_project', client);

    const category = searchParams.get('category');
    if (category) q = q.eq('category', category);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ entries: (data ?? []) as WorkLogEntry[] });
  } catch (e) {
    console.error('[GET /api/worklog]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<WorkLogEntry>;

    const client_project = body.client_project?.trim();
    const description    = body.description?.trim();
    const category       = body.category;
    if (!client_project) return NextResponse.json({ error: 'client_project required' }, { status: 400 });
    if (!description)     return NextResponse.json({ error: 'description required' }, { status: 400 });
    if (!category || !CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'valid category required' }, { status: 400 });
    }

    const visibility: WorkLogVisibility =
      body.visibility && VISIBILITIES.includes(body.visibility) ? body.visibility : 'internal';

    const { data, error } = await supabaseAdmin
      .from('work_log')
      .insert({
        user_id:        USER_ID,
        week_start:     chicagoWeekStart(),
        client_project,
        description,
        category,
        impact:         body.impact?.trim() || null,
        visibility,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const entry = data as WorkLogEntry;
    reembedFireAndForget(entry);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (e) {
    console.error('[POST /api/worklog]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<WorkLogEntry> & { id?: string };
    const id = body.id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.client_project !== undefined) {
      const v = body.client_project.trim();
      if (!v) return NextResponse.json({ error: 'client_project cannot be empty' }, { status: 400 });
      patch.client_project = v;
    }
    if (body.description !== undefined) {
      const v = body.description.trim();
      if (!v) return NextResponse.json({ error: 'description cannot be empty' }, { status: 400 });
      patch.description = v;
    }
    if (body.category !== undefined) {
      if (!CATEGORIES.includes(body.category)) {
        return NextResponse.json({ error: 'invalid category' }, { status: 400 });
      }
      patch.category = body.category;
    }
    if (body.visibility !== undefined) {
      if (!VISIBILITIES.includes(body.visibility)) {
        return NextResponse.json({ error: 'invalid visibility' }, { status: 400 });
      }
      patch.visibility = body.visibility;
    }
    if (body.impact !== undefined) patch.impact = body.impact?.trim() || null;

    const { data, error } = await supabaseAdmin
      .from('work_log')
      .update(patch)
      .eq('id', id)
      .eq('user_id', USER_ID)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const entry = data as WorkLogEntry;
    reembedFireAndForget(entry);
    return NextResponse.json({ entry });
  } catch (e) {
    console.error('[PATCH /api/worklog]', e);
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
      .from('work_log')
      .delete()
      .eq('id', id)
      .eq('user_id', USER_ID);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Clean up the embedded memory chunk(s) — fire-and-forget.
    deleteChunks(id).catch((err) => console.error(`[embed] work_log delete:${id}`, err));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/worklog]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
