import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface VaultNoteSummary {
  id: string;
  path: string;
  title: string;
  folder: string;
  tags: string[];
  file_mtime: string | null;
  synced_at: string;
}

// GET /api/vault?q=consulting&folder=6%20-%20Main%20Notes&tag=Networking&limit=50
// Browse/search synced Obsidian notes (metadata only; fetch content via /api/vault/note).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();
    const folder = searchParams.get('folder')?.trim();
    const tag = searchParams.get('tag')?.trim();
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

    let query = supabaseAdmin
      .from('vault_notes')
      .select('id, path, title, folder, tags, file_mtime, synced_at')
      .order('file_mtime', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (q) {
      const safe = q.replace(/[,()]/g, ' ');
      query = query.or(`title.ilike.%${safe}%,content.ilike.%${safe}%`);
    }
    if (folder) query = query.like('folder', `${folder}%`);
    if (tag) query = query.contains('tags', [tag]);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data as VaultNoteSummary[]);
  } catch (e) {
    console.error('[GET /api/vault]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
