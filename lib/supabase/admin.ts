import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { supabaseFetch } from './custom-fetch';

let _client: SupabaseClient | null = null;

// Read a value from .env.local directly, bypassing process.env.
// This is a fallback for Next.js 16 / Turbopack environments where
// NEXT_PUBLIC_* vars are inlined at compile time and may be stale.
function readFromEnvFile(key: string): string | undefined {
  try {
    const content = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of content.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0 && line.slice(0, eq).trim() === key) {
        return line.slice(eq + 1).trim() || undefined;
      }
    }
  } catch { /* file not found */ }
  return undefined;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || readFromEnvFile('NEXT_PUBLIC_SUPABASE_URL');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || readFromEnvFile('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'are set in .env.local.',
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: supabaseFetch },
  });
  return _client;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseAdmin() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
