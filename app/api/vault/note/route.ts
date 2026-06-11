import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/vault/note?path=6%20-%20Main%20Notes/Future.md  (or ?id=<uuid>)
// Full note content + metadata.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const notePath = searchParams.get('path');
    const id = searchParams.get('id');
    if (!notePath && !id) {
      return NextResponse.json({ error: 'path or id required' }, { status: 400 });
    }

    let query = supabaseAdmin.from('vault_notes').select('*').limit(1);
    query = notePath ? query.eq('path', notePath) : query.eq('id', id!);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'note not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('[GET /api/vault/note]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
