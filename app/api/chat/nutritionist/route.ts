import { streamText, stepCountIs, convertToModelMessages, type ToolSet } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { homeDateStr } from '@/lib/dates';

export const maxDuration = 60;

/* ── System prompt ─────────────────────────────────────────────────────────── */

// ╭──────────────────────────────────────────────────────────────────────────╮
// │ PERSONALIZE ME: replace the profile block below with YOUR stats and      │
// │ eating habits. (During setup, ask your AI assistant to interview you     │
// │ and fill this in — it's optional; the chat works with generic defaults.) │
// ╰──────────────────────────────────────────────────────────────────────────╯
const SYSTEM = `You are the owner's personal nutritionist and protein coach, built into their health dashboard.

## Owner profile (EDIT ME — placeholders until personalized)
- Sex / age / height / weight: not provided — ask once, then use the answer for the session
- Training style: not provided (endurance, lifting, hybrid…?)
- Goal: not provided (cut / maintain / lean-gain)
- Eating patterns & go-to meals: not provided — work with whatever they tell you

## Targets (use calculate_targets tool for exact numbers)
- Protein: ~2.0 g/kg bodyweight — THIS IS THE NUMBER TO DEFEND
- TDEE = BMR × 1.3 (NEAT) + training burn. Flex calories with training days.
- Fat: ~0.9 g/kg floor
- Carbs: fill the remainder — they fuel endurance work

## Your job
1. Help the owner hit their protein target consistently
2. Plan meals around their actual eating patterns
3. Log what they eat to the nutrition tracker (use the log_meal tool)
4. Pull their real training data to flex calorie targets
5. Be a coach, not a calculator — explain the why, keep it practical

## Principles
- Protein is the number to defend. If calories must give, protein doesn't.
- Flex with training: a hard-workout day ≠ a rest day. Use actual burn.
- Work WITH their habits — meal timing quirks are features, not bugs.
- Keep food suggestions practical — real, simple food they'll actually eat.
- Always call out protein remaining after a meal and how to close the gap.

## Quick protein references (per serving)
- Chicken breast (6 oz): ~50g P, ~280 kcal
- Lean beef (6 oz): ~46g P, ~360 kcal
- Salmon (6 oz): ~40g P, ~360 kcal
- Greek yogurt, nonfat (1 cup): ~23g P, ~150 kcal
- Whey protein (1 scoop): ~25g P, ~120 kcal
- Large egg: ~6g P, ~72 kcal

Keep responses concise and conversational — this is a chat widget, not an essay.
Use short paragraphs and tables where helpful. Lead with the protein number.`;

/* ── Tools ─────────────────────────────────────────────────────────────────── */

async function querySupabase(table: string, select: string, filters: Record<string, string>, days: number, limit?: number) {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  let q = supabase.from(table).select(select);
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  q = q.gte('date', since).order('date', { ascending: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

const tools: ToolSet = {
  get_recent_training: {
    description: 'Get recent Strava activities (sport type, duration, calories burned, heart rate). Use this to estimate today\'s training burn for calorie targets. Pass days=7 for a week.',
    inputSchema: z.object({
      days: z.number().describe('Number of days to look back (e.g. 7)'),
    }),
    execute: async ({ days }) => {
      const activities = await querySupabase(
        'strava_activities', 'date, sport_type, duration_sec, calories, avg_hr, name',
        { user_id: 'owner' }, days, 20,
      );
      return { activities };
    },
  },

  get_wellness: {
    description: 'Get recent Garmin wellness data (HRV, sleep, resting HR, steps). Use for recovery context. Pass days=7 for a week.',
    inputSchema: z.object({
      days: z.number().describe('Number of days to look back (e.g. 7)'),
    }),
    execute: async ({ days }) => {
      const wellness = await querySupabase(
        'wellness_logs', 'date, resting_hr, hrv, sleep_score, sleep_duration_min, vo2_max',
        { user_id: 'owner' }, days, 7,
      );
      return { wellness };
    },
  },

  get_weight: {
    description: 'Get recent weight and body fat logs. Pass days=30 for a month.',
    inputSchema: z.object({
      days: z.number().describe('Number of days to look back (e.g. 30)'),
    }),
    execute: async ({ days }) => {
      const weight_logs = await querySupabase(
        'body_logs', 'date, weight_lbs, body_fat_pct',
        { user_id: 'owner' }, days, 10,
      );
      return { weight_logs };
    },
  },

  get_nutrition_today: {
    description: 'Get today\'s nutrition log (what\'s been logged so far). Use this before logging a meal to get cumulative totals.',
    inputSchema: z.object({}),
    execute: async () => {
      const supabase = getSupabaseAdmin();
      const today = homeDateStr();
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select('*')
        .eq('user_id', 'owner')
        .eq('date', today)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { today: data, date: today };
    },
  },

  get_nutrition_history: {
    description: 'Get recent nutrition logs to see protein/calorie trends. Pass days=14 for two weeks.',
    inputSchema: z.object({
      days: z.number().describe('Number of days to look back (e.g. 14)'),
    }),
    execute: async ({ days }) => {
      const logs = await querySupabase(
        'nutrition_logs', 'date, calories, protein_g, carbs_g, fat_g, meals, source',
        { user_id: 'owner' }, days,
      );
      return { logs };
    },
  },

  calculate_targets: {
    description: 'Calculate daily calorie and macro targets based on weight and training burn. Always use this for the math — don\'t calculate by hand.',
    inputSchema: z.object({
      weight_lb: z.number().describe('Current bodyweight in pounds'),
      exercise_kcal: z.number().describe('Calories burned in training today (from Strava or estimated). Rest day = 0.'),
      goal: z.enum(['maintain', 'lean-gain', 'cut', 'aggressive-cut']).describe('Nutrition goal. Default: maintain.'),
    }),
    execute: async ({ weight_lb, exercise_kcal, goal }) => {
      const kg = weight_lb * 0.453592;
      const cm = 69 * 2.54; // 5'9"
      const age = 22;

      const bmr = 10 * kg + 6.25 * cm - 5 * age + 5; // Mifflin-St Jeor male
      const neat_base = bmr * 1.3;
      const tdee = neat_base + exercise_kcal;

      const goal_adj: Record<string, number> = { maintain: 0, 'lean-gain': 250, cut: -400, 'aggressive-cut': -600 };
      const target_cal = tdee + (goal_adj[goal] ?? 0);

      const protein_g = Math.round(2.0 * kg);
      const fat_g = Math.round(0.9 * kg);
      const carb_kcal = target_cal - (protein_g * 4 + fat_g * 9);
      const carb_g = Math.max(Math.round(carb_kcal / 4), 0);

      return {
        weight_lb, weight_kg: Math.round(kg * 10) / 10,
        bmr: Math.round(bmr),
        tdee: Math.round(tdee),
        target_calories: Math.round(target_cal),
        protein_g, protein_range: { low: Math.round(1.6 * kg), high: Math.round(2.2 * kg) },
        fat_g, carbs_g: carb_g,
        goal,
      };
    },
  },

  log_meal: {
    description: 'Log a meal to the nutrition tracker. IMPORTANT: always call get_nutrition_today first, then add to the existing totals and write cumulative numbers for the day.',
    inputSchema: z.object({
      calories: z.number().describe('Cumulative calories for the day so far (existing + this meal)'),
      protein_g: z.number().describe('Cumulative protein for the day so far'),
      carbs_g: z.number().describe('Cumulative carbs for the day so far'),
      fat_g: z.number().describe('Cumulative fat for the day so far'),
      meals_description: z.string().describe('Human-readable description of all meals today, e.g. "Breakfast: 5 eggs, 3 toast, banana | Lunch: chicken rice bowl"'),
    }),
    execute: async ({ calories, protein_g, carbs_g, fat_g, meals_description }) => {
      const supabase = getSupabaseAdmin();
      const today = homeDateStr();
      const { data, error } = await supabase
        .from('nutrition_logs')
        .upsert({
          user_id: 'owner',
          date: today,
          calories,
          protein_g,
          carbs_g,
          fat_g,
          source: 'nutritionist',
          meals: meals_description,
        }, { onConflict: 'date,user_id' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { logged: data, message: 'Meal logged successfully' };
    },
  },
};

/* ── Route handler ─────────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  const { messages } = await req.json();

  // v6: client sends UIMessages (with parts); streamText needs ModelMessages
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: SYSTEM,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
