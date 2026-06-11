import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface MemoryStats {
  total: number;
  by_source: Record<string, number>;
  oldest: string | null;
  newest: string | null;
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin.rpc('memory_stats');
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const stats: MemoryStats = {
      total: Number(row?.total ?? 0),
      by_source: (row?.by_source as Record<string, number>) ?? {},
      oldest: row?.oldest ?? null,
      newest: row?.newest ?? null,
    };

    return NextResponse.json(stats);
  } catch (e) {
    console.error('[GET /api/memory/stats]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
