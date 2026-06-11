import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { homeDateStr } from '@/lib/dates';

/**
 * Receiver for Apple Health pushes. Apple Health is the hub: MacroFactor
 * writes nutrition + weigh-ins to it, the scale app writes body mass, and
 * an iOS automation pushes the metrics here on a schedule. Normalizes
 * units, aggregates per day, and upserts into nutrition_logs / body_logs.
 *
 * Auth: `Authorization: Bearer ${APPLE_EXPORT_SECRET}` — the route is exempt
 * from cookie auth in middleware.ts and validates the bearer itself.
 *
 * Accepts two payload shapes:
 *
 * 1. Health Auto Export app ("JSON" format):
 * { "data": { "metrics": [ { "name": "protein", "units": "g",
 *     "data": [ { "date": "2026-06-10 00:00:00 -0500", "qty": 165 } ] } ] } }
 *
 * 2. Flat (free Apple Shortcuts automation — easy to build with magic
 *    variables; strings fine, missing/empty fields skipped; date defaults
 *    to today in the home timezone):
 * { "calories": "2540", "protein_g": "171", "carbs_g": "300", "fat_g": "78",
 *   "fiber_g": "31", "water_floz": "96", "weight_lbs": "181.6",
 *   "body_fat_pct": "", "date": "2026-06-10" }
 */

type HAEPoint  = { date: string; qty?: number };
type HAEMetric = { name?: string; units?: string; data?: HAEPoint[] };

const KJ_PER_KCAL = 4.184;

type NutDay = {
  calories?: number; protein_g?: number; carbs_g?: number;
  fat_g?: number; fiber_g?: number; water_ml?: number;
};
type WeighDay = { weight_lbs?: number; body_fat_pct?: number };

const round1 = (n: number | undefined) => n == null ? undefined : Math.round(n * 10) / 10;

export async function POST(req: Request) {
  const secret = process.env.APPLE_EXPORT_SECRET;
  // Forgiving header parse — Shortcuts users add stray spaces/casing; the
  // token itself must still match exactly. Accepts "Bearer x", "bearer x", "x".
  const raw   = (req.headers.get('authorization') ?? '').trim();
  const token = raw.replace(/^bearer\s+/i, '').trim();
  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Accept JSON or form bodies — Shortcuts' "Request Body" type is easy to
  // leave on Form, and the flat fields work identically either way.
  let body: { data?: { metrics?: HAEMetric[] } } & Record<string, unknown>;
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  try {
    if (ct.includes('form')) {
      const fd = await req.formData();
      body = Object.fromEntries(fd.entries());
    } else {
      const text = await req.text();
      body = text.trim() ? JSON.parse(text) : {};
    }
  } catch {
    return NextResponse.json(
      { error: `could not parse body (content-type: ${ct || 'none'}) — set Request Body to JSON or Form` },
      { status: 400 },
    );
  }
  const metrics = body.data?.metrics ?? [];

  // Tolerant numeric coercion — Shortcuts sends strings, sometimes empty
  const num = (v: unknown): number | undefined => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const nut:     Record<string, NutDay>   = {};
  const weights: Record<string, WeighDay> = {};

  const add = (date: string, key: keyof NutDay, qty: number) => {
    const d = (nut[date] ??= {});
    d[key] = (d[key] ?? 0) + qty;
  };

  for (const m of metrics) {
    const name  = (m.name ?? '').toLowerCase();
    const units = (m.units ?? '').toLowerCase();
    for (const p of m.data ?? []) {
      if (p.qty == null || !p.date) continue;
      const date = p.date.slice(0, 10);
      const q    = p.qty;
      switch (name) {
        case 'dietary_energy':
          add(date, 'calories', units === 'kj' ? q / KJ_PER_KCAL : q);
          break;
        case 'protein':       add(date, 'protein_g', q); break;
        case 'carbohydrates': add(date, 'carbs_g',   q); break;
        case 'total_fat':     add(date, 'fat_g',     q); break;
        case 'fiber':         add(date, 'fiber_g',   q); break;
        case 'dietary_water':
          add(date, 'water_ml', units === 'l' ? q * 1000 : units.startsWith('fl') ? q * 29.574 : q);
          break;
        case 'weight_body_mass': {
          // last reading of the day wins
          (weights[date] ??= {}).weight_lbs = units === 'kg' ? q * 2.20462 : q;
          break;
        }
        case 'body_fat_percentage': {
          (weights[date] ??= {}).body_fat_pct = q <= 1 ? q * 100 : q;
          break;
        }
      }
    }
  }

  // Flat payload (Shortcuts path) — merge into the same per-day maps
  if (metrics.length === 0) {
    const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(body.date)
      ? body.date.slice(0, 10)
      : homeDateStr();
    const flat: NutDay = {
      calories:  num(body.calories),
      protein_g: num(body.protein_g),
      carbs_g:   num(body.carbs_g),
      fat_g:     num(body.fat_g),
      fiber_g:   num(body.fiber_g),
      water_ml:  num(body.water_ml) ?? (num(body.water_floz) != null ? num(body.water_floz)! * 29.574 : undefined),
    };
    if (Object.values(flat).some(v => v != null)) nut[date] = flat;
    const w: WeighDay = { weight_lbs: num(body.weight_lbs), body_fat_pct: num(body.body_fat_pct) };
    if (w.weight_lbs != null || w.body_fat_pct != null) weights[date] = w;
  }

  const supabase = getSupabaseAdmin();
  let nutritionDays = 0, weighIns = 0;

  // Nutrition: merge-upsert per day. Incoming MacroFactor values win for the
  // fields they carry; existing fields (e.g. meals text, chat-logged water)
  // survive when the export doesn't include them.
  for (const [date, v] of Object.entries(nut)) {
    if (!v.calories && !v.protein_g) continue; // nothing meaningful logged yet
    const { data: existing } = await supabase
      .from('nutrition_logs')
      .select('calories, protein_g, carbs_g, fat_g, fiber_g, water_ml, meals')
      .eq('user_id', 'owner').eq('date', date)
      .maybeSingle();

    const { error } = await supabase.from('nutrition_logs').upsert({
      user_id:   'owner',
      date,
      calories:  v.calories  != null ? Math.round(v.calories) : existing?.calories ?? null,
      protein_g: round1(v.protein_g) ?? existing?.protein_g ?? null,
      carbs_g:   round1(v.carbs_g)   ?? existing?.carbs_g   ?? null,
      fat_g:     round1(v.fat_g)     ?? existing?.fat_g     ?? null,
      fiber_g:   round1(v.fiber_g)   ?? existing?.fiber_g   ?? null,
      water_ml:  v.water_ml != null ? Math.round(v.water_ml) : existing?.water_ml ?? null,
      meals:     existing?.meals ?? null,
      source:    'macrofactor',
    }, { onConflict: 'date,user_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    nutritionDays++;
  }

  // Weight: one auto row per day (update in place on re-export)
  for (const [date, w] of Object.entries(weights)) {
    if (w.weight_lbs == null && w.body_fat_pct == null) continue;
    const { data: existing } = await supabase
      .from('body_logs')
      .select('id')
      .eq('user_id', 'owner').eq('date', date).eq('source', 'apple')
      .maybeSingle();

    const fields = {
      ...(w.weight_lbs   != null ? { weight_lbs:   round1(w.weight_lbs) }   : {}),
      ...(w.body_fat_pct != null ? { body_fat_pct: round1(w.body_fat_pct) } : {}),
    };
    const { error } = existing
      ? await supabase.from('body_logs').update(fields).eq('id', existing.id)
      : await supabase.from('body_logs').insert({
          user_id: 'owner', date, source: 'apple',
          notes: 'auto · apple health',
          weight_lbs: null, body_fat_pct: null,
          ...fields,
        });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    weighIns++;
  }

  return NextResponse.json({ ok: true, nutrition_days: nutritionDays, weigh_ins: weighIns });
}
