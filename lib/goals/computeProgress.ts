import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type Goal, type GoalWithProgress,
  getTimeframeBounds, daysRemaining, paceStatus,
} from '@/lib/goals';
import { syncStravaActivities }  from '@/lib/strava-sync';
import { syncIntervalsActivities } from '@/lib/intervals-sync';

const M_PER_MI = 1609.344;

type HistPoint = { date: string; cumulative: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

async function fetchProgress(
  goal: Goal,
  sb: SupabaseClient,
  start: string,
  end: string,
): Promise<{ current: number; history: HistPoint[] }> {
  try {
    switch (goal.metric_source) {

      case 'books': {
        const { data } = await sb
          .from('books')
          .select('finished_at')
          .eq('user_id', 'owner')
          .eq('status', 'done')
          .gte('finished_at', start)
          .lte('finished_at', end)
          .order('finished_at');
        const rows = (data ?? []) as unknown as { finished_at: string }[];
        let cum = 0;
        const history = rows.map(r => ({ date: r.finished_at, cumulative: ++cum }));
        return { current: rows.length, history };
      }

      case 'habits': {
        const habitId = goal.metric_field ?? '';
        const { data } = await sb
          .from('daily_logs')
          .select('log_date, notes')
          .gte('log_date', start)
          .lte('log_date', end)
          .order('log_date');
        type Row = { log_date: string; notes: { habits?: { done?: string[] } } | null };
        const rows = (data ?? []) as unknown as Row[];
        let cum = 0;
        const history: HistPoint[] = [];
        for (const r of rows) {
          if ((r.notes?.habits?.done ?? []).includes(habitId)) {
            history.push({ date: r.log_date, cumulative: ++cum });
          }
        }
        return { current: cum, history };
      }

      case 'wellness_logs': {
        const field     = goal.metric_field ?? 'sleep_duration_min';
        const threshold = (goal.metric_filter?.threshold as number) ?? 0;
        const { data }  = await (sb as unknown as SupabaseClient)
          .from('wellness_logs')
          .select(`date, ${field}`)
          .eq('user_id', 'owner')
          .gte('date', start)
          .lte('date', end)
          .order('date');
        const rows = ((data ?? []) as unknown as AnyRow[]);
        if (threshold > 0) {
          let cum = 0;
          const history: HistPoint[] = [];
          for (const r of rows) {
            if (((r[field] as number) ?? 0) >= threshold)
              history.push({ date: r.date as string, cumulative: ++cum });
          }
          return { current: cum, history };
        }
        let cum = 0;
        const history = rows.map(r => {
          cum += (r[field] as number) ?? 0;
          return { date: r.date as string, cumulative: cum };
        });
        return { current: cum, history };
      }

      case 'strava_activities': {
        // Ensure the table is populated — sync from Strava if the TTL allows.
        // This makes goals work even if the user has never opened the Health section.
        await syncStravaActivities(sb).catch(() => {});

        const field     = goal.metric_field ?? 'distance_m';
        const sportType = goal.metric_filter?.sport_type as string | undefined;
        const selectCol = field === 'count' ? 'id, date' : `date, ${field}`;

        let query = (sb as unknown as SupabaseClient)
          .from('strava_activities')
          .select(selectCol)
          .eq('user_id', 'owner')
          .gte('date', start)
          .lte('date', end)
          .order('date');

        // sport_type: support both exact match and prefix (e.g. 'Run' matches 'VirtualRun')
        if (sportType) {
          query = query.ilike('sport_type', `%${sportType}%`);
        }

        const { data } = await query;
        const rows     = ((data ?? []) as unknown as AnyRow[]);

        if (field === 'count') {
          let cum = 0;
          const history = rows.map(r => ({ date: r.date as string, cumulative: ++cum }));
          return { current: rows.length, history };
        }
        // Distance: convert meters → miles
        let cum = 0;
        const history = rows.map(r => {
          cum += ((r[field] as number) ?? 0) / M_PER_MI;
          return { date: r.date as string, cumulative: parseFloat(cum.toFixed(2)) };
        });
        return { current: parseFloat(cum.toFixed(2)), history };
      }

      case 'daily_stats': {
        const field     = goal.metric_field ?? 'steps';
        const threshold = (goal.metric_filter?.threshold as number) ?? 0;
        const { data }  = await (sb as unknown as SupabaseClient)
          .from('daily_stats')
          .select(`date, ${field}`)
          .eq('user_id', 'owner')
          .gte('date', start)
          .lte('date', end)
          .order('date');
        const rows = ((data ?? []) as unknown as AnyRow[]);
        if (threshold > 0) {
          let cum = 0;
          const history: HistPoint[] = [];
          for (const r of rows) {
            if (((r[field] as number) ?? 0) >= threshold)
              history.push({ date: r.date as string, cumulative: ++cum });
          }
          return { current: cum, history };
        }
        let cum = 0;
        const history = rows.map(r => {
          cum += (r[field] as number) ?? 0;
          return { date: r.date as string, cumulative: cum };
        });
        return { current: cum, history };
      }

      case 'nutrition_logs': {
        const field     = goal.metric_field ?? 'protein_g';
        const threshold = (goal.metric_filter?.threshold as number) ?? 0;
        const { data }  = await (sb as unknown as SupabaseClient)
          .from('nutrition_logs')
          .select(`date, ${field}`)
          .eq('user_id', 'owner')
          .gte('date', start)
          .lte('date', end)
          .order('date');
        const rows = ((data ?? []) as unknown as AnyRow[]);
        if (threshold > 0) {
          let cum = 0;
          const history: HistPoint[] = [];
          for (const r of rows) {
            if (((r[field] as number) ?? 0) >= threshold)
              history.push({ date: r.date as string, cumulative: ++cum });
          }
          return { current: cum, history };
        }
        let cum = 0;
        const history = rows.map(r => {
          cum += (r[field] as number) ?? 0;
          return { date: r.date as string, cumulative: cum };
        });
        return { current: cum, history };
      }

      case 'workouts': {
        await syncIntervalsActivities(sb).catch(() => {});
        const typeFilter = goal.metric_filter?.type as string | undefined;

        let query = (sb as unknown as SupabaseClient)
          .from('workouts')
          .select('date, id')
          .eq('user_id', 'owner')
          .gte('date', start)
          .lte('date', end)
          .order('date');

        if (typeFilter) {
          query = query.ilike('type', `%${typeFilter}%`);
        }

        const { data } = await query;
        const rows = ((data ?? []) as unknown as AnyRow[]);
        // Count distinct active days, not raw activity rows (a strength session +
        // a walk on the same day counts as one day toward "work out N days").
        const seen = new Set<string>();
        let cum = 0;
        const history: HistPoint[] = [];
        for (const r of rows) {
          const d = r.date as string;
          if (seen.has(d)) continue;
          seen.add(d);
          history.push({ date: d, cumulative: ++cum });
        }
        return { current: cum, history };
      }

      case 'manual':
      default: {
        const { data } = await sb
          .from('goal_progress')
          .select('date, value')
          .eq('goal_id', goal.id)
          .gte('date', start)
          .lte('date', end)
          .order('date');
        type Row = { date: string; value: number };
        const rows = (data ?? []) as unknown as Row[];
        let cum = 0;
        const history = rows.map(r => {
          cum += r.value;
          return { date: r.date, cumulative: parseFloat(cum.toFixed(2)) };
        });
        return { current: parseFloat(cum.toFixed(2)), history };
      }
    }
  } catch {
    return { current: 0, history: [] };
  }
}

export async function computeGoalProgress(
  goal: Goal,
  sb: SupabaseClient,
): Promise<Omit<GoalWithProgress, keyof Goal>> {
  const { start, end }       = getTimeframeBounds(goal);
  const { current, history } = await fetchProgress(goal, sb, start, end);
  const target               = goal.target_value;
  const pct                  = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  return {
    current_value:    current,
    pct,
    pace_status:      paceStatus(current, target, start, end, goal.created_at),
    days_remaining:   daysRemaining(end),
    timeframe_start:  start,
    timeframe_end:    end,
    progress_history: history,
  };
}
