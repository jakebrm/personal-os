import OpenAI from 'openai';
import { supabaseAdmin } from './supabase/admin';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedAndStore({
  content,
  sourceType,
  sourceId,
  entityId,
}: {
  content: string;
  sourceType: string;
  sourceId?: string;
  entityId?: string;
}): Promise<void> {
  if (!content?.trim()) return;

  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: content.slice(0, 8000),
  });

  await supabaseAdmin.from('memory_chunks').insert({
    content: content.slice(0, 2000),
    embedding: res.data[0].embedding,
    entity_id: entityId ?? null,
    metadata: { source_type: sourceType, source_id: sourceId ?? null },
  });
}

export function embedFireAndForget(params: {
  content: string;
  sourceType: string;
  sourceId?: string;
  entityId?: string;
}): void {
  embedAndStore(params).catch((err) =>
    console.error(`[embed] ${params.sourceType}:${params.sourceId ?? '?'}`, err),
  );
}
