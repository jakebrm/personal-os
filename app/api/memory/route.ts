import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// DELETE /api/memory?id=<uuid>  — remove a single memory chunk from the brain.
// (Removes the embedded chunk only; the underlying source row, if any, is left
// alone. Re-embedding that source later would recreate a chunk.)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') ?? (await req.json().catch(() => ({}))).id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('memory_chunks')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/memory]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
