import type { Task } from './tasks';
import type { HabitDef } from './habits';
import type { Book } from './books';
import type { GoalWithProgress } from './goals';
import type { WeatherData } from './weather';
import type { TrainingData, TrainingWorkout } from '@/components/training/useTrainingData';

// ── Date helpers ──────────────────────────────────────────────────────────────

export function dd(n = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function ddt(n: number, h: number, m = 0): string {
  return `${dd(n)}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
}

function yearStr(): string { return String(new Date().getFullYear()); }

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
function monthEnd(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${last}`;
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const DEMO_TASKS: Task[] = [
  { id:'dt-1', title:'Review quarterly OKRs',       description:null,                       status:'pending', due_date:dd(0),  urgency:'today',      sort_order:0, created_at:dd(-3)+'T12:00:00Z', updated_at:dd(-3)+'T12:00:00Z' },
  { id:'dt-2', title:'Call Dr. Martinez',           description:'Annual checkup follow-up', status:'pending', due_date:dd(0),  urgency:'today',      sort_order:1, created_at:dd(-1)+'T10:00:00Z', updated_at:dd(-1)+'T10:00:00Z' },
  { id:'dt-3', title:'Update resume',               description:null,                       status:'pending', due_date:dd(3),  urgency:'this-week',  sort_order:2, created_at:dd(-7)+'T09:00:00Z', updated_at:dd(-7)+'T09:00:00Z' },
  { id:'dt-4', title:"Plan weekend trip to Austin", description:null,                       status:'pending', due_date:dd(5),  urgency:'this-week',  sort_order:3, created_at:dd(-2)+'T14:00:00Z', updated_at:dd(-2)+'T14:00:00Z' },
  { id:'dt-5', title:"Reply to Ben's email",        description:'Re: Q3 project proposal',  status:'done',    due_date:dd(-1), urgency:'this-week',  sort_order:4, created_at:dd(-4)+'T08:00:00Z', updated_at:dd(0) +'T08:30:00Z' },
  { id:'dt-6', title:'Renew car registration',      description:null,                       status:'pending', due_date:dd(15), urgency:'this-month', sort_order:5, created_at:dd(-10)+'T11:00:00Z', updated_at:dd(-10)+'T11:00:00Z' },
  { id:'dt-7', title:'Schedule HVAC tune-up',       description:null,                       status:'pending', due_date:null,   urgency:'this-month', sort_order:6, created_at:dd(-14)+'T16:00:00Z', updated_at:dd(-14)+'T16:00:00Z' },
  { id:'dt-8', title:'Learn to cook Thai food',     description:null,                       status:'pending', due_date:null,   urgency:'someday',    sort_order:7, created_at:dd(-30)+'T20:00:00Z', updated_at:dd(-30)+'T20:00:00Z' },
  { id:'dt-9', title:'Set up home NAS',             description:'4-bay Synology, 20TB',     status:'pending', due_date:null,   urgency:'someday',    sort_order:8, created_at:dd(-45)+'T19:00:00Z', updated_at:dd(-45)+'T19:00:00Z' },
];

// ── Habits ────────────────────────────────────────────────────────────────────

export const DEMO_HABITS: HabitDef[] = [
  { id:'sleep',    label:'Sleep 7+ hrs' },
  { id:'exercise', label:'Exercise'     },
  { id:'meditate', label:'Meditate'     },
  { id:'read',     label:'Read'         },
  { id:'journal',  label:'Journal'      },
  { id:'water',    label:'Drink water'  },
];

export const DEMO_HABITS_DONE: string[] = ['sleep', 'exercise', 'water'];

const HABIT_IDS = ['sleep','exercise','meditate','read','journal','water'];
// Bitmask for 30 past days — which of 6 habits were done
const HABIT_MASKS = [
  0b111011, 0b110111, 0b011111, 0b111110, 0b101111, 0b111011,
  0b110011, 0b111101, 0b011110, 0b111011, 0b101011, 0b111111,
  0b110111, 0b011011, 0b111100, 0b101111, 0b111011, 0b110011,
  0b011111, 0b111011, 0b101011, 0b111110, 0b110111, 0b011111,
  0b111011, 0b101101, 0b111101, 0b110011, 0b011110, 0b111111,
];

export function buildDemoHabitsHistory(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  HABIT_MASKS.forEach((mask, i) => {
    map.set(dd(-(i+1)), HABIT_IDS.filter((_, bit) => (mask >> (5-bit)) & 1));
  });
  map.set(dd(0), DEMO_HABITS_DONE);
  return map;
}

// ── Calendar events ───────────────────────────────────────────────────────────

export type DemoCalEvent = {
  id: string; title: string; start: string; end: string;
  allDay: boolean; color?: string; location?: string;
};

export function buildDemoCalEvents(): DemoCalEvent[] {
  return [
    { id:'dc-1', title:'Team standup',           start:ddt(0,9),      end:ddt(0,9,30),  allDay:false, color:'#6366f1' },
    { id:'dc-2', title:'Product roadmap review', start:ddt(0,14),     end:ddt(0,15),    allDay:false, color:'#06b6d4' },
    { id:'dc-3', title:'Dentist appointment',    start:ddt(1,11),     end:ddt(1,12),    allDay:false, location:'1250 Mockingbird Ln' },
    { id:'dc-4', title:'Dinner with Alex',       start:ddt(3,19),     end:ddt(3,21),    allDay:false, color:'#f59e0b', location:'Izakaya downtown' },
    { id:'dc-5', title:'Work offsite',           start:dd(7),         end:dd(7),        allDay:true,  color:'#10b981' },
    { id:'dc-6', title:'Happy hour',             start:ddt(12,18,30), end:ddt(12,20),   allDay:false },
  ];
}

// ── Weather ───────────────────────────────────────────────────────────────────

export const DEMO_WEATHER: WeatherData = {
  temp:78, feelsLike:80, code:0, desc:'Clear skies',
  windSpeed:8, windDir:'S', uvIndex:7, hi:85, lo:68,
  forecast:[
    { date:dd(1), day:'Mon', code:1, hi:82, lo:66 },
    { date:dd(2), day:'Tue', code:2, hi:80, lo:65 },
    { date:dd(3), day:'Wed', code:61, hi:74, lo:62 },
    { date:dd(4), day:'Thu', code:0, hi:83, lo:67 },
    { date:dd(5), day:'Fri', code:1, hi:86, lo:69 },
  ],
  hourly: Array.from({ length:24 }, (_, i) => {
    const h = (new Date().getHours() + i) % 24;
    const temp = 68 + Math.round(Math.sin((h - 5) * Math.PI / 14) * 12);
    const dayOffset = (new Date().getHours() + i) >= 24 ? 1 : 0;
    return {
      time:`${dd(dayOffset)}T${String((new Date().getHours()+i)%24).padStart(2,'0')}:00`,
      temp, precip:h>=14&&h<=17?15:5, code:h>=7&&h<=19?0:1,
      wind:6+Math.round(Math.sin(h*0.5)*3),
      uv:h>=8&&h<=18?Math.round(7*Math.sin((h-7)*Math.PI/11)):0,
    };
  }),
  dailySummary:{ sunrise:'6:12 am', sunset:'8:21 pm', uvMax:8, uvMaxTime:'1 pm', windMax:14, windMaxTime:'3 pm', precipProb:15 },
  updatedAt:Date.now(),
};

// ── Books ─────────────────────────────────────────────────────────────────────

export const DEMO_BOOKS: Book[] = [
  { id:'db-1', user_id:'demo', title:'Atomic Habits',                  author:'James Clear',       cover_url:null, status:'reading', started_at:dd(-17), finished_at:null,    rating:null, notes:null, pages:320, pages_read:218, sort_order:0, progress_date:dd(-1),  created_at:dd(-17)+'T12:00:00Z', updated_at:dd(-1)+'T20:00:00Z'  },
  { id:'db-2', user_id:'demo', title:'Outlive',                        author:'Peter Attia',       cover_url:null, status:'reading', started_at:dd(-4),  finished_at:null,    rating:null, notes:null, pages:496, pages_read:110, sort_order:1, progress_date:dd(-2),  created_at:dd(-4)+'T10:00:00Z',  updated_at:dd(-2)+'T19:00:00Z'  },
  { id:'db-3', user_id:'demo', title:'Deep Work',                      author:'Cal Newport',       cover_url:null, status:'done',    started_at:dd(-150),finished_at:dd(-130),rating:5,    notes:null, pages:296, pages_read:296, sort_order:2, progress_date:dd(-130),created_at:dd(-155)+'T09:00:00Z',updated_at:dd(-130)+'T09:00:00Z' },
  { id:'db-4', user_id:'demo', title:'Almanack of Naval Ravikant',     author:'Eric Jorgenson',    cover_url:null, status:'done',    started_at:dd(-118),finished_at:dd(-103),rating:5,    notes:null, pages:242, pages_read:242, sort_order:3, progress_date:dd(-103),created_at:dd(-120)+'T09:00:00Z',updated_at:dd(-103)+'T09:00:00Z' },
  { id:'db-5', user_id:'demo', title:'Think Again',                    author:'Adam Grant',        cover_url:null, status:'done',    started_at:dd(-84), finished_at:dd(-65), rating:4,    notes:null, pages:307, pages_read:307, sort_order:4, progress_date:dd(-65), created_at:dd(-86)+'T09:00:00Z', updated_at:dd(-65)+'T09:00:00Z'  },
  { id:'db-6', user_id:'demo', title:"Can't Hurt Me",                  author:'David Goggins',     cover_url:null, status:'done',    started_at:dd(-49), finished_at:dd(-27), rating:4,    notes:null, pages:364, pages_read:364, sort_order:5, progress_date:dd(-27), created_at:dd(-50)+'T09:00:00Z', updated_at:dd(-27)+'T09:00:00Z'  },
  { id:'db-7', user_id:'demo', title:'The War of Art',                 author:'Steven Pressfield', cover_url:null, status:'queued',  started_at:null,    finished_at:null,    rating:null, notes:null, pages:168, pages_read:0,   sort_order:6, progress_date:null,    created_at:dd(-20)+'T15:00:00Z', updated_at:dd(-20)+'T15:00:00Z'  },
];

export const DEMO_BOOK_GOAL = 12;

// ── Goals ─────────────────────────────────────────────────────────────────────

export function buildDemoGoals(): GoalWithProgress[] {
  const now  = new Date();
  const yr   = now.getFullYear();
  const doy  = Math.ceil((now.getTime() - new Date(yr,0,1).getTime()) / 86400000);
  const diy  = (yr%4===0&&(yr%100!==0||yr%400===0))?366:365;
  const dom  = now.getDate();
  const dim  = new Date(yr, now.getMonth()+1, 0).getDate();

  return [
    {
      id:'dg-1', user_id:'demo', title:`Read 12 books in ${yr}`,
      description:null, category:'academic', timeframe:'yearly',
      target_value:12, target_unit:'books', start_date:null, end_date:null,
      metric_source:'books', metric_field:null, metric_filter:null,
      status:'active', color:'oklch(0.65 0.20 250)', icon:'▭',
      created_at:`${yr}-01-01T09:00:00Z`, updated_at:dd(-1)+'T09:00:00Z',
      current_value:4, pct:33, pace_status:'on_track',
      days_remaining:diy-doy,
      timeframe_start:`${yr}-01-01`, timeframe_end:`${yr}-12-31`,
      progress_history:[
        { date:dd(-130), cumulative:1 },
        { date:dd(-103), cumulative:2 },
        { date:dd(-65),  cumulative:3 },
        { date:dd(-27),  cumulative:4 },
      ],
    },
    {
      id:'dg-2', user_id:'demo', title:'Run 50 miles this month',
      description:null, category:'fitness', timeframe:'monthly',
      target_value:50, target_unit:'mi', start_date:null, end_date:null,
      metric_source:'strava_activities', metric_field:'distance_m', metric_filter:{ sport_type:'Run' },
      status:'active', color:'oklch(0.68 0.14 25)', icon:'↗',
      created_at:monthStart()+'T09:00:00Z', updated_at:dd(-1)+'T09:00:00Z',
      current_value:Math.round(50*(dom/dim)*0.95),
      pct:Math.min(100, Math.round(50*(dom/dim)*0.95/50*100)),
      pace_status:'on_track', days_remaining:dim-dom,
      timeframe_start:monthStart(), timeframe_end:monthEnd(),
      progress_history:Array.from({length:dom},(_,i)=>({
        date:`${yr}-${String(now.getMonth()+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,
        cumulative:Math.round((50/dim)*(i+1)*0.95),
      })),
    },
    {
      id:'dg-3', user_id:'demo', title:'Meditate 25 days this month',
      description:null, category:'other', timeframe:'monthly',
      target_value:25, target_unit:'days', start_date:null, end_date:null,
      metric_source:'habits', metric_field:null, metric_filter:null,
      status:'active', color:'oklch(0.65 0.18 145)', icon:'◑',
      created_at:monthStart()+'T09:00:00Z', updated_at:dd(-1)+'T09:00:00Z',
      current_value:Math.round(dom*0.80),
      pct:Math.min(100, Math.round(dom*0.80/25*100)),
      pace_status:'on_track', days_remaining:dim-dom,
      timeframe_start:monthStart(), timeframe_end:monthEnd(),
      progress_history:Array.from({length:dom},(_,i)=>({
        date:`${yr}-${String(now.getMonth()+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,
        cumulative:Math.round(25/dim*(i+1)*0.80),
      })),
    },
    {
      id:'dg-4', user_id:'demo', title:`Save $15,000 in ${yr}`,
      description:null, category:'finance', timeframe:'yearly',
      target_value:15000, target_unit:'USD', start_date:null, end_date:null,
      metric_source:'manual', metric_field:null, metric_filter:null,
      status:'active', color:'oklch(0.75 0.16 85)', icon:'◆',
      created_at:`${yr}-01-01T09:00:00Z`, updated_at:dd(-1)+'T09:00:00Z',
      current_value:8400, pct:Math.round(8400/15000*100),
      pace_status:'on_track', days_remaining:diy-doy,
      timeframe_start:`${yr}-01-01`, timeframe_end:`${yr}-12-31`,
      progress_history:[
        { date:dd(-90), cumulative:2500 },
        { date:dd(-60), cumulative:4800 },
        { date:dd(-30), cumulative:6200 },
        { date:dd(-7),  cumulative:7900 },
        { date:dd(0),   cumulative:8400 },
      ],
    },
  ];
}

// ── Health — inline types to avoid import cycle with components/health ────────

export type DemoWellnessRow = {
  date:string; sleep_score:number|null; sleep_duration_min:number|null;
  sleep_deep_min:number|null; sleep_light_min:number|null; sleep_rem_min:number|null;
  sleep_awake_min:number|null; hrv:number|null; resting_hr:number|null;
  vo2_max:number|null; body_battery:number|null; respiration_rate:number|null;
  spo2:number|null; stress:number|null; steps:number|null;
  ctl:number|null; atl:number|null; source?:string;
};

// [sleep_min, hrv, rhr, steps, body_battery] — 30 past days
const WP: [number,number,number,number,number][] = [
  [462,68,51,9200,82],[495,72,50,8800,88],[428,60,54,7100,72],[441,65,52,8300,78],[510,74,50,10200,91],
  [378,54,57,6200,65],[450,66,52,8600,80],[480,71,51,9100,86],[420,62,53,7800,74],[465,67,52,8900,81],
  [402,58,55,6900,70],[510,75,50,10500,90],[455,67,52,8700,82],[488,70,51,9300,85],[430,63,53,7500,76],
  [462,68,52,8400,79],[375,52,58,5900,62],[490,73,50,9800,89],[445,65,52,8100,78],[478,69,51,9000,84],
  [360,50,59,5700,60],[510,74,50,10800,91],[458,67,52,8600,80],[492,72,50,9400,87],[425,62,53,7600,75],
  [468,68,52,8800,81],[382,55,56,6400,67],[505,73,50,10100,90],[449,66,52,8300,78],[476,70,51,9100,84],
];

export function buildDemoWellness(): DemoWellnessRow[] {
  return WP.map(([sleep,hrv,rhr,steps,bb], i) => ({
    date:dd(-(i+1)),
    sleep_score:Math.round(60+(sleep-360)/150*30),
    sleep_duration_min:sleep,
    sleep_deep_min:Math.round(sleep*0.20),
    sleep_light_min:Math.round(sleep*0.50),
    sleep_rem_min:Math.round(sleep*0.22),
    sleep_awake_min:Math.round(sleep*0.08),
    hrv, resting_hr:rhr,
    vo2_max:46+(i<15?0:1),
    body_battery:bb,
    respiration_rate:14, spo2:97,
    stress:Math.round(25+(100-bb)/2),
    steps, ctl:44+Math.floor(i/15), atl:40+Math.round(Math.sin(i*0.6)*6),
    source:'garmin',
  }));
}

export type DemoStravaRow = {
  id:number; name:string; sport_type:string; distance_m:number;
  duration_sec:number; elevation_m:number; avg_hr:number|null;
  max_hr:number|null; calories:number|null; date:string; source:string;
};

export function buildDemoActivities(): DemoStravaRow[] {
  return [
    { id:1, name:'Morning Run',       sport_type:'Run',  distance_m:8047,  duration_sec:2520,  elevation_m:42,  avg_hr:148, max_hr:168, calories:580,  date:dd(-1),  source:'strava' },
    { id:2, name:'Evening Ride',      sport_type:'Ride', distance_m:32186, duration_sec:4800,  elevation_m:210, avg_hr:138, max_hr:162, calories:820,  date:dd(-2),  source:'strava' },
    { id:3, name:'Easy Recovery Run', sport_type:'Run',  distance_m:5632,  duration_sec:2040,  elevation_m:28,  avg_hr:136, max_hr:155, calories:390,  date:dd(-4),  source:'strava' },
    { id:4, name:'Long Run',          sport_type:'Run',  distance_m:16093, duration_sec:5940,  elevation_m:91,  avg_hr:145, max_hr:172, calories:980,  date:dd(-6),  source:'strava' },
    { id:5, name:'Tempo Run',         sport_type:'Run',  distance_m:9656,  duration_sec:2880,  elevation_m:55,  avg_hr:158, max_hr:178, calories:680,  date:dd(-9),  source:'strava' },
    { id:6, name:'Century Ride',      sport_type:'Ride', distance_m:80467, duration_sec:14400, elevation_m:680, avg_hr:142, max_hr:168, calories:2100, date:dd(-11), source:'strava' },
    { id:7, name:'Track Intervals',   sport_type:'Run',  distance_m:6437,  duration_sec:1980,  elevation_m:15,  avg_hr:162, max_hr:186, calories:520,  date:dd(-14), source:'strava' },
    { id:8, name:'Trail Run',         sport_type:'Run',  distance_m:12875, duration_sec:5400,  elevation_m:340, avg_hr:152, max_hr:175, calories:890,  date:dd(-16), source:'strava' },
  ];
}

export type DemoBodyLog = {
  id:string; date:string; weight_lbs:number; body_fat_pct:number|null; notes:string|null; source:string;
};

export function buildDemoWeight(): DemoBodyLog[] {
  return [
    { id:'dw-1', date:dd(0),   weight_lbs:175.2, body_fat_pct:14.8, notes:null, source:'manual' },
    { id:'dw-2', date:dd(-7),  weight_lbs:175.8, body_fat_pct:15.1, notes:null, source:'manual' },
    { id:'dw-3', date:dd(-14), weight_lbs:176.4, body_fat_pct:15.3, notes:null, source:'manual' },
    { id:'dw-4', date:dd(-21), weight_lbs:176.9, body_fat_pct:15.5, notes:null, source:'manual' },
    { id:'dw-5', date:dd(-28), weight_lbs:177.2, body_fat_pct:15.8, notes:null, source:'manual' },
  ];
}

// ── Friends ───────────────────────────────────────────────────────────────────

export type DemoContact = {
  id: string; name: string; nickname: string | null;
  tier: 'close' | 'good' | 'acquaintance' | 'professional';
  phone: string | null; email: string | null; instagram: string | null;
  birthday: string | null; city: string | null; notes: string | null; photo_url: string | null;
  contact_frequency_days: number;
  last_contacted_at: string | null;
  status: 'active' | 'cooling' | 'written_off';
  consecutive_me_count: number;
  created_at: string; updated_at: string;
  days_since_last_contact: number | null;
  overdue: boolean; days_overdue: number;
};

function computeDemo(freq: number, daysAgo: number | null): Pick<DemoContact, 'days_since_last_contact' | 'overdue' | 'days_overdue'> {
  if (daysAgo === null) return { days_since_last_contact: null, overdue: true, days_overdue: freq };
  const overdue = daysAgo > freq;
  return { days_since_last_contact: daysAgo, overdue, days_overdue: overdue ? daysAgo - freq : 0 };
}

export function buildDemoContacts(): DemoContact[] {
  return [
    { id:'df-1', name:'Mike Johnson',   nickname:null,  tier:'close',        phone:null, email:null, instagram:null, birthday:'1990-03-15', city:'Chicago',        notes:null,             photo_url:null, contact_frequency_days:14, last_contacted_at:dd(-5),  status:'active',      consecutive_me_count:0, created_at:dd(-365), updated_at:dd(-5),  ...computeDemo(14, 5)  },
    { id:'df-2', name:'Sarah Williams', nickname:'Sar', tier:'close',        phone:null, email:null, instagram:null, birthday:null,          city:'Austin',        notes:'Loves hiking',   photo_url:null, contact_frequency_days:14, last_contacted_at:dd(-20), status:'active',      consecutive_me_count:0, created_at:dd(-365), updated_at:dd(-20), ...computeDemo(14, 20) },
    { id:'df-3', name:'Tom Davis',      nickname:null,  tier:'good',         phone:null, email:null, instagram:null, birthday:'1988-11-20', city:'Denver',        notes:null,             photo_url:null, contact_frequency_days:35, last_contacted_at:dd(-25), status:'active',      consecutive_me_count:3, created_at:dd(-300), updated_at:dd(-25), ...computeDemo(35, 25) },
    { id:'df-4', name:'Emily Chen',     nickname:'Em',  tier:'good',         phone:null, email:null, instagram:null, birthday:'1995-06-10', city:'San Francisco', notes:'Birthday soon!', photo_url:null, contact_frequency_days:30, last_contacted_at:dd(-35), status:'active',      consecutive_me_count:0, created_at:dd(-280), updated_at:dd(-35), ...computeDemo(30, 35) },
    { id:'df-5', name:'Alex Brown',     nickname:null,  tier:'acquaintance', phone:null, email:null, instagram:null, birthday:null,          city:'New York',      notes:null,             photo_url:null, contact_frequency_days:60, last_contacted_at:dd(-55), status:'cooling',     consecutive_me_count:5, created_at:dd(-200), updated_at:dd(-55), ...computeDemo(60, 55) },
    { id:'df-6', name:'Jordan Lee',     nickname:null,  tier:'acquaintance', phone:null, email:null, instagram:null, birthday:'1992-06-20', city:'Chicago',       notes:null,             photo_url:null, contact_frequency_days:70, last_contacted_at:dd(-80), status:'written_off', consecutive_me_count:7, created_at:dd(-180), updated_at:dd(-80), ...computeDemo(70, 80) },
  ];
}

// ── Brain / Memory ────────────────────────────────────────────────────────────

export type DemoChunk = {
  id:string; content:string; source_url:string; created_at:string;
  metadata:{ source_type?:string; source_id?:string };
};

export const DEMO_CHUNKS: DemoChunk[] = [
  { id:'dm-1',  content:'Systems thinking: building constraints that make the right choice the default choice dramatically reduces decision fatigue and improves follow-through.',                                                               source_url:'', created_at:dd(-1)+'T10:23:00Z',  metadata:{ source_type:'note'    } },
  { id:'dm-2',  content:'Zone 2 training is the foundation of aerobic capacity. 80% of training volume at conversational pace, 20% high intensity — the 80/20 rule for endurance athletes.',                                                   source_url:'', created_at:dd(-2)+'T09:15:00Z',  metadata:{ source_type:'article' } },
  { id:'dm-3',  content:'The five love languages: Words of Affirmation, Quality Time, Receiving Gifts, Acts of Service, Physical Touch. Knowing your own and others reduces friction in relationships.',                                        source_url:'', created_at:dd(-3)+'T21:00:00Z',  metadata:{ source_type:'note'    } },
  { id:'dm-4',  content:'Compounding applies beyond money — reputation, skills, and relationships all compound. Consistency over long time horizons beats intensity in the short term.',                                                        source_url:'', created_at:dd(-4)+'T14:30:00Z',  metadata:{ source_type:'note'    } },
  { id:'dm-5',  content:'Sleep architecture: cycles every ~90 min. Deep NREM in early cycles (physical recovery), REM increases in later cycles (memory and learning). Prioritize 7-9 hours.',                                                 source_url:'', created_at:dd(-5)+'T08:00:00Z',  metadata:{ source_type:'article' } },
  { id:'dm-6',  content:'Cold exposure protocol: 11 min per week total, 50-59°F water. Triggers norepinephrine release (3x), improves mood, alertness, and metabolism. — Huberman',                                                           source_url:'', created_at:dd(-7)+'T07:00:00Z',  metadata:{ source_type:'article' } },
  { id:'dm-7',  content:"Naval: 'Read what you love until you love to read.' Optimize for curiosity, not completion. It's OK to abandon books that don't serve you.",                                                                          source_url:'', created_at:dd(-9)+'T20:00:00Z',  metadata:{ source_type:'note'    } },
  { id:'dm-8',  content:'Keystone habits trigger other positive behaviors automatically. Exercise is the most studied — it improves sleep, diet, mood, and focus in a cascade effect.',                                                         source_url:'', created_at:dd(-11)+'T12:00:00Z', metadata:{ source_type:'article' } },
  { id:'dm-9',  content:'First principles: break problems into fundamental truths, rebuild from there. Applied to SpaceX: "Instead of buying rockets, could we build them?" — reduced cost 10x.',                                              source_url:'', created_at:dd(-14)+'T16:45:00Z', metadata:{ source_type:'note'    } },
  { id:'dm-10', content:'Protein synthesis window is 24-48 hours post-workout, not 30 minutes. Aim for 0.7-1g per lb bodyweight daily. Leucine is the key trigger: 2-3g per meal minimum.',                                                   source_url:'', created_at:dd(-16)+'T11:30:00Z', metadata:{ source_type:'article' } },
];

export const DEMO_BRAIN_STATS = {
  total:10,
  by_source:{ article:4, note:6 } as Record<string,number>,
  oldest:dd(-16),
  newest:dd(-1),
};

// ── Journal ───────────────────────────────────────────────────────────────────

const JOURNAL_TEXT: [number, string][] = [
  [0,  'Productive morning. Hit the gym early — squat PR at 225lbs. Need to finish the Q2 review doc today. Also should schedule that dentist appointment.'],
  [-1, 'Good sleep last night, HRV was 72. Started reading Outlive — really fascinating chapter on longevity science and Zone 2 training. Going to dial in my easy run pace this week.'],
  [-2, "Skipped meditation today, work was hectic. Did get my run in though — 5.2 miles at easy pace. Should get back on the meditation streak tomorrow, don't want to break it."],
  [-3, 'Great run — 5.2 miles on the trail. Ran into Tom on the path, we caught up briefly. Been meaning to reach out to him properly. Need to check the friends tab.'],
  [-4, "Working through Austin trip planning. Found Uchi for dinner and Barton Springs for a morning swim. Booked the Airbnb — excited. Also finally replied to Ben's email about Q3."],
  [-5, "Called Mike — good to hear his voice. He's got exciting news about a new job offer. Need to celebrate with him when I see him next weekend."],
  [-6, "Finished Can't Hurt Me. Incredible book — the cookie jar mental model was especially good. Starting Outlive next. Feeling inspired to be more disciplined about health."],
];

export function buildDemoJournal(): Map<string, { content:string; habits:string[] }> {
  const map = new Map<string, { content:string; habits:string[] }>();
  const history = buildDemoHabitsHistory();
  JOURNAL_TEXT.forEach(([offset, content]) => {
    const date = dd(offset);
    map.set(date, { content, habits: history.get(date) ?? DEMO_HABITS_DONE });
  });
  return map;
}

export { yearStr };

// ── Training plan ───────────────────────────────────────────────────────────

const MI = 1609.34;

// One week's worth of day templates (Mon–Sun). Scaled per week by `factor`.
type DayTpl = {
  sport: 'run' | 'strength' | 'rest';
  type: string;
  name: string;
  miles?: number;
  min?: number;
  zone?: string;
  desc: string;
  hr: string;
};

const WEEK_TPL: DayTpl[] = [
  { sport:'rest', type:'rest', name:'Rest Day', desc:'Full recovery. Sleep 7-8 hrs.',
    hr:'Complete rest — prioritise sleep and hydration.' },
  { sport:'run', type:'interval', name:'Interval Run', miles:5, min:50, zone:'Zone 4',
    desc:'Threshold intervals to lift your lactate ceiling.',
    hr:'1mi warm-up @ easy\n5x800m @ 5K effort (HR 165-175), 90s jog recovery\n1mi cool-down @ easy\nStay smooth and controlled on the reps.' },
  { sport:'strength', type:'strength', name:'Strength', min:60, zone:'—',
    desc:'Full-body strength for durability.',
    hr:'3 rounds:\n- Goblet squat 3x8\n- Single-leg RDL 3x8/side\n- Push-up 3x12\n- Plank 3x45s\nLeave 2 reps in reserve.' },
  { sport:'run', type:'easy', name:'Easy Run + Strides', miles:4, min:40, zone:'Zone 2',
    desc:'Easy aerobic volume with strides to keep turnover sharp.',
    hr:'4mi easy @ 10:00-10:30/mi (HR 139-153)\nFinish with 4x100m strides, walk-back recovery\nKeep it conversational the whole way.' },
  { sport:'strength', type:'strength', name:'Core + Mobility', min:45, zone:'—',
    desc:'Core stability and hip mobility.',
    hr:'2 rounds:\n- Dead bug 3x10\n- Side plank 3x30s/side\n- Hip airplane 3x6/side\n- 90/90 transitions 3x8' },
  { sport:'run', type:'long', name:'Long Run', miles:10, min:100, zone:'Zone 2',
    desc:'The key aerobic session of the week. Build the engine.',
    hr:'10mi steady @ 9:45-10:15/mi (HR 145-158)\nLast 2mi can drift to marathon effort if feeling strong\nFuel every 40min, hydrate throughout.' },
  { sport:'run', type:'recovery', name:'Recovery Run', miles:2, min:22, zone:'Zone 1',
    desc:'Shake-out to flush the long run.',
    hr:'2mi very easy @ 10:30+/mi (HR <140)\nNo agenda — just loosen the legs.' },
];

const PHASES = ['Build', 'Build', 'Build', 'Build', 'Sharpen', 'Taper'];
const FACTORS = [0.85, 0.95, 1.0, 1.1, 0.8, 0.9];
const DOW = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

function isoAddDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// 6-week half-marathon block anchored so that *today* sits in week 3.
export function buildDemoTrainingPlan(): TrainingData {
  // This week's Monday
  const now = new Date();
  const dow = now.getDay();                 // 0=Sun
  const monOffset = dow === 0 ? -6 : 1 - dow;
  const thisMon = isoAddDays(dd(0), monOffset);
  const planStart = isoAddDays(thisMon, -14);          // week 1 starts 2 weeks ago
  const planEnd   = isoAddDays(planStart, 6 * 7 - 1);
  const today = dd(0);

  const planId = 'demo-plan';
  const workouts: TrainingWorkout[] = [];

  for (let w = 0; w < 6; w++) {
    const factor = FACTORS[w];
    for (let d = 0; d < 7; d++) {
      const tpl = WEEK_TPL[d];
      const date = isoAddDays(planStart, w * 7 + d);
      const miles = tpl.miles ? Math.round(tpl.miles * factor * 10) / 10 : null;
      const completed = tpl.sport !== 'rest' && date < today;
      workouts.push({
        id:                 `dw${w + 1}-${d}`,
        plan_id:            planId,
        date,
        day_of_week:        DOW[d],
        week_number:        w + 1,
        phase:              PHASES[w],
        sport:              tpl.sport,
        type:               tpl.type,
        name:               tpl.name,
        description:        tpl.desc,
        human_readable:     tpl.hr,
        duration_minutes:   tpl.min ? Math.round(tpl.min * (tpl.sport === 'run' ? factor : 1)) : null,
        distance_meters:    miles ? Math.round(miles * MI) : null,
        primary_zone:       tpl.zone ?? null,
        completed,
        completed_at:       completed ? date + 'T08:00:00Z' : null,
        notes:              completed && d === 5 ? 'Felt strong, negative split the back half.' : null,
        strava_activity_id: null,
      });
    }
  }

  return {
    plan: {
      id:         planId,
      name:       'Red White and Blue Half Marathon',
      event_name: 'Red White and Blue Half Marathon',
      event_date: planEnd,
      plan_start: planStart,
      plan_end:   planEnd,
      goal:       'Sub 1:50:00',
      is_active:  true,
    },
    workouts,
  };
}
