import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are the owner's personal assistant with access to his memory archive. Answer the question using ONLY the context provided below. Cite sources by referring to chunk IDs in [brackets] like [abc12345]. If you don't have enough context to answer confidently, say so — do not make things up. Be direct and concise.`;

function truncate(text: string, maxChars = 800): string {
  return text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
}

export async function POST(req: NextRequest) {
  try {
    const { question, limit = 20, threshold = 0.2 } = await req.json();
    if (!question?.trim()) {
      return new Response(JSON.stringify({ error: 'question required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question.trim(),
    });

    const { data: chunks, error } = await supabaseAdmin.rpc('match_memory_chunks', {
      query_embedding: embRes.data[0].embedding,
      match_threshold: threshold,
      match_count: limit,
    });
    if (error) throw error;

    const encoder = new TextEncoder();

    if (!chunks || chunks.length === 0) {
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode("I don't have any relevant memories yet. Try capturing some notes first!"));
            c.close();
          },
        }),
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      );
    }

    const context = (chunks as Array<{
      id: string; content: string; created_at: string; similarity: number; metadata: Record<string, unknown>;
    }>)
      .map(c => {
        const src = c.metadata?.source_type ?? 'unknown';
        return `[${c.id.slice(0, 8)}] (${src}, ${new Date(c.created_at).toLocaleDateString()}, ${(c.similarity * 100).toFixed(0)}% match)\n${truncate(c.content)}`;
      })
      .join('\n\n---\n\n');

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const s = anthropic.messages.stream({
            model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: SYSTEM,
            messages: [{
              role: 'user',
              content: `CONTEXT:\n\n${context}\n\n---\n\nQUESTION: ${question.trim()}`,
            }],
          });
          for await (const chunk of s) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
        } catch (e) {
          console.error('[ask] stream error:', e);
          controller.enqueue(encoder.encode('\n\n[Error generating response]'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch (e) {
    console.error('[POST /api/memory/ask]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
