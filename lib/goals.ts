export type GoalCategory    = 'fitness' | 'faith' | 'academic' | 'finance' | 'professional' | 'other';
export type GoalTimeframe   = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type GoalMetricSource = 'manual' | 'books' | 'habits' | 'wellness_logs' | 'strava_activities' | 'daily_stats' | 'nutrition_logs' | 'workouts';
export type GoalPaceStatus  = 'on_track' | 'at_risk' | 'behind' | 'completed';

export type Goal = {
  id:            string;
  user_id:       string;
  title:         string;
  description:   string | null;
  category:      GoalCategory;
  timeframe:     GoalTimeframe;
  target_value:  number;
  target_unit:   string | null;
  start_date:    string | null;
  end_date:      string | null;
  metric_source: GoalMetricSource;
  metric_field:  string | null;
  metric_filter: Record<string, unknown> | null;
  status:        'active' | 'completed' | 'abandoned';
  color:         string;
  icon:          string;
  created_at:    string;
  updated_at:    string;
};

export type GoalProgressEntry = {
  id:         string;
  goal_id:    string;
  date:       string;
  value:      number;
  note:       string | null;
  created_at: string;
};

export type GoalWithProgress = Goal & {
  current_value:     number;
  pct:               number;   // 0–100
  pace_status:       GoalPaceStatus;
  days_remaining:    number;
  timeframe_start:   string;
  timeframe_end:     string;
  progress_history:  Array<{ date: string; cumulative: number }>;
};

// ── Timeframe helpers ─────────────────────────────────────────────────────────

export function getTimeframeBounds(goal: Goal): { start: string; end: string } {
  // Respect explicit stored dates for any timeframe (so historical monthly/yearly
  // goals compute progress against their own period, not the current one).
  if (goal.start_date && goal.end_date) {
    return { start: goal.start_date, end: goal.end_date };
  }
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  if (goal.timeframe === 'daily') {
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return { start: today, end: today };
  }
  if (goal.timeframe === 'weekly') {
    const d = new Date(now); d.setHours(12, 0, 0, 0);
    const dow = d.getDay(); const fromMon = dow === 0 ? 6 : dow - 1;
    d.setDate(d.getDate() - fromMon);
    const start = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    d.setDate(d.getDate() + 6);
    const end = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    return { start, end };
  }
  if (goal.timeframe === 'monthly') {
    const y = now.getFullYear(), m = now.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return { start: `${y}-${pad(m+1)}-01`, end: `${y}-${pad(m+1)}-${pad(last)}` };
  }
  // yearly (default)
  return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
}

export function daysRemaining(end: string): number {
  const diff = new Date(end + 'T23:59:59').getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

export function paceStatus(
  current: number, target: number, start: string, end: string,
  createdAt?: string,
): GoalPaceStatus {
  if (current >= target) return 'completed';
  const now = Date.now();
  const tfStart  = new Date(start).getTime();
  const created  = createdAt ? new Date(createdAt).getTime() : tfStart;
  const effStart = Math.max(tfStart, created);
  const e        = new Date(end + 'T23:59:59').getTime();
  const span     = e - effStart;
  if (span <= 0) return current >= target ? 'completed' : 'behind';
  const elapsed  = Math.min(1, Math.max(0, (now - effStart) / span));
  const done     = current / target;
  if (done >= elapsed * 0.95) return 'on_track';
  if (done >= elapsed * 0.70) return 'at_risk';
  return 'behind';
}

// ── Category metadata ─────────────────────────────────────────────────────────

export const CATEGORY_META: Record<GoalCategory, {
  label:    string;
  glyph:    string;
  color:    string;
  subtitle: string;
}> = {
  fitness:      { label: 'Fitness',      glyph: '↗', color: 'var(--viz)', subtitle: 'Workouts, running, biking, swimming, steps, weight, nutrition' },
  faith:        { label: 'Faith',        glyph: '◈', color: 'oklch(0.75 0.12 280)',  subtitle: 'Prayer, bible reading, church, spiritual practices' },
  academic:     { label: 'Academic',     glyph: '▭', color: 'oklch(0.75 0.12 200)',  subtitle: 'Books, learning, courses, study habits' },
  finance:      { label: 'Finance',      glyph: '◆', color: 'oklch(0.74 0.10 155)',  subtitle: 'Savings, spending, net worth, budget adherence' },
  professional: { label: 'Professional', glyph: '↑', color: 'oklch(0.75 0.12 50)',   subtitle: 'Work projects, career, networking, skills' },
  other:        { label: 'Other',        glyph: '◎', color: 'oklch(0.55 0.04 255)',  subtitle: 'Anything that doesn\'t fit above' },
};

// ── Goal templates ────────────────────────────────────────────────────────────

export type GoalTemplate = Omit<Goal, 'id'|'user_id'|'status'|'created_at'|'updated_at'|'description'> & {
  label: string;
};

export const GOAL_TEMPLATES: GoalTemplate[] = [
  // Fitness
  { icon:'↗', label:'Run {n} miles this month',        title:'Run {n} miles this month',         category:'fitness',      timeframe:'monthly',  target_value:30,  target_unit:'mi',       metric_source:'strava_activities', metric_field:'distance_m',         metric_filter:{sport_type:'Run'},  color:'var(--viz)', start_date:null, end_date:null },
  { icon:'◈', label:'Bike {n} miles this month',       title:'Bike {n} miles this month',        category:'fitness',      timeframe:'monthly',  target_value:60,  target_unit:'mi',       metric_source:'strava_activities', metric_field:'distance_m',         metric_filter:{sport_type:'Ride'},color:'var(--viz)', start_date:null, end_date:null },
  { icon:'↑', label:'Lift {n} times this week',       title:'Lift {n} times this week',         category:'fitness',      timeframe:'weekly',   target_value:3,   target_unit:'lifts',    metric_source:'workouts',          metric_field:null,                 metric_filter:{type:'WeightTraining'}, color:'var(--viz)', start_date:null, end_date:null },
  { icon:'↑', label:'Lift {n} days this month',       title:'Lift {n} days this month',         category:'fitness',      timeframe:'monthly',  target_value:12,  target_unit:'days',     metric_source:'workouts',          metric_field:null,                 metric_filter:{type:'WeightTraining'}, color:'var(--viz)', start_date:null, end_date:null },
  { icon:'○', label:'Hit 10k steps {n} days',         title:'Hit 10k steps {n} days',           category:'fitness',      timeframe:'monthly',  target_value:20,  target_unit:'days',     metric_source:'daily_stats',       metric_field:'steps',              metric_filter:{threshold:10000},  color:'var(--viz)', start_date:null, end_date:null },
  { icon:'◑', label:'Sleep 7+ hours {n} days',        title:'Sleep 7+ hours {n} nights',        category:'fitness',      timeframe:'monthly',  target_value:20,  target_unit:'days',     metric_source:'wellness_logs',     metric_field:'sleep_duration_min', metric_filter:{threshold:420},    color:'var(--viz)', start_date:null, end_date:null },
  { icon:'◆', label:'Hit protein goal {n} days',      title:'Hit protein goal {n} days',        category:'fitness',      timeframe:'monthly',  target_value:20,  target_unit:'days',     metric_source:'nutrition_logs',    metric_field:'protein_g',          metric_filter:{threshold:150},    color:'var(--viz)', start_date:null, end_date:null },
  // Faith
  { icon:'◈', label:'Pray every day this month',      title:'Pray {n} days this month',         category:'faith',        timeframe:'monthly',  target_value:30,  target_unit:'days',     metric_source:'manual',            metric_field:null,                 metric_filter:null,               color:'oklch(0.75 0.12 280)', start_date:null, end_date:null },
  { icon:'▭', label:'Read bible {n} days',            title:'Read bible {n} days this month',   category:'faith',        timeframe:'monthly',  target_value:20,  target_unit:'days',     metric_source:'manual',            metric_field:null,                 metric_filter:null,               color:'oklch(0.75 0.12 280)', start_date:null, end_date:null },
  { icon:'◎', label:'Attend church {n} times',        title:'Attend church {n} times',          category:'faith',        timeframe:'monthly',  target_value:4,   target_unit:'times',    metric_source:'manual',            metric_field:null,                 metric_filter:null,               color:'oklch(0.75 0.12 280)', start_date:null, end_date:null },
  // Academic
  { icon:'▭', label:'Read {n} books this year',       title:'Read {n} books this year',         category:'academic',     timeframe:'yearly',   target_value:12,  target_unit:'books',    metric_source:'books',             metric_field:null,                 metric_filter:null,               color:'oklch(0.75 0.12 200)', start_date:null, end_date:null },
  { icon:'◐', label:'Read every day this month',      title:'Read {n} days this month',         category:'academic',     timeframe:'monthly',  target_value:30,  target_unit:'days',     metric_source:'habits',            metric_field:'read',               metric_filter:null,               color:'oklch(0.75 0.12 200)', start_date:null, end_date:null },
  { icon:'○', label:'Complete {n} courses',           title:'Complete {n} courses',             category:'academic',     timeframe:'yearly',   target_value:4,   target_unit:'courses',  metric_source:'manual',            metric_field:null,                 metric_filter:null,               color:'oklch(0.75 0.12 200)', start_date:null, end_date:null },
  // Finance
  { icon:'◆', label:'Save ${n} this month',           title:'Save ${n} this month',             category:'finance',      timeframe:'monthly',  target_value:500, target_unit:'$',        metric_source:'manual',            metric_field:null,                 metric_filter:null,               color:'oklch(0.74 0.10 155)', start_date:null, end_date:null },
  { icon:'○', label:'Stay under budget {n} days',     title:'Stay under budget {n} days',       category:'finance',      timeframe:'monthly',  target_value:20,  target_unit:'days',     metric_source:'manual',            metric_field:null,                 metric_filter:null,               color:'oklch(0.74 0.10 155)', start_date:null, end_date:null },
  // Professional
  { icon:'↑', label:'Complete {n} projects',          title:'Complete {n} projects',            category:'professional', timeframe:'monthly',  target_value:3,   target_unit:'projects', metric_source:'manual',            metric_field:null,                 metric_filter:null,               color:'oklch(0.75 0.12 50)', start_date:null, end_date:null },
  { icon:'◎', label:'Network {n} times',              title:'Network {n} times this month',     category:'professional', timeframe:'monthly',  target_value:4,   target_unit:'times',    metric_source:'manual',            metric_field:null,                 metric_filter:null,               color:'oklch(0.75 0.12 50)', start_date:null, end_date:null },
  // Other
  { icon:'◎', label:'Custom goal',                   title:'My goal',                          category:'other',        timeframe:'monthly',  target_value:10,  target_unit:'',         metric_source:'manual',            metric_field:null,                 metric_filter:null,               color:'oklch(0.55 0.04 255)', start_date:null, end_date:null },
];

export const PRESET_COLORS = [
  'var(--viz)',
  'oklch(0.75 0.12 280)',
  'oklch(0.75 0.12 200)',
  'oklch(0.74 0.10 155)',
  'oklch(0.75 0.12 50)',
  'oklch(0.65 0.22 0)',
  'oklch(0.70 0.18 300)',
  'oklch(0.72 0.16 180)',
];
