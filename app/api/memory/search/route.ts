import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface MemoryChunk {
  id: string;
  entity_id: string | null;
  content: string;
  created_at: string;
  metadata: Record<string, unknown>;
  similarity: number | null;
}

// POST /api/memory/search — semantic vector search
export async function POST(req: NextRequest) {
  try {
    const { query, limit = 20, threshold = 0.25 } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query required' }, { status: 400 });
    }

    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query.trim(),
    });

    const { data, error } = await supabaseAdmin.rpc('match_memory_chunks', {
      query_embedding: embRes.data[0].embedding,
      match_threshold: threshold,
      match_count: limit,
    });
    if (error) throw error;

    return NextResponse.json(data as MemoryChunk[]);
  } catch (e) {
    console.error('[POST /api/memory/search]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET /api/memory/search?limit=40&source_type=task — browse recent
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '40', 10), 100);
    const sourceType = searchParams.get('source_type');

    let q = supabaseAdmin
      .from('memory_chunks')
      .select('id, entity_id, content, created_at, metadata')
      .not('embedding', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (sourceType) {
      q = q.eq('metadata->>source_type', sourceType);
    }

    const { data, error } = await q;
    if (error) throw error;

    const chunks: MemoryChunk[] = (data ?? []).map((r) => ({ ...r, similarity: null }));
    return NextResponse.json(chunks);
  } catch (e) {
    console.error('[GET /api/memory/search]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
