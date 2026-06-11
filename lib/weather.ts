import { HOME_TZ } from './dates';

// ── Open-Meteo raw response types ────────────────────────────────────────────

type OmResponse = {
  current: {
    temperature_2m:       number;
    apparent_temperature: number;
    weather_code:         number;
    wind_speed_10m:       number;
    wind_direction_10m:   number;
    uv_index:             number;
  };
  hourly: {
    time:                      string[];   // "YYYY-MM-DDTHH:00" home-tz local
    temperature_2m:            number[];
    precipitation_probability: number[];   // 0-100
    weather_code:              number[];
    wind_speed_10m:            number[];
    uv_index:                  number[];
  };
  daily: {
    time:                          string[];
    temperature_2m_max:            number[];
    temperature_2m_min:            number[];
    weather_code:                  number[];
    sunrise:                       string[];   // "YYYY-MM-DDTHH:MM"
    sunset:                        string[];
    uv_index_max:                  number[];
    precipitation_probability_max: number[];
  };
};

// ── App-layer types ───────────────────────────────────────────────────────────

export type ForecastDay = {
  date: string;  // YYYY-MM-DD
  day:  string;  // e.g. "Mon"
  code: number;
  hi:   number;  // °F
  lo:   number;  // °F
};

export type HourlySlice = {
  time:   string;   // "YYYY-MM-DDTHH:00" home-tz local
  temp:   number;   // °F
  precip: number;   // 0-100 probability
  code:   number;   // WMO weather code
  wind:   number;   // mph
  uv:     number;
};

export type DailySummary = {
  sunrise:     string;  // "5:47 am"
  sunset:      string;  // "8:32 pm"
  uvMax:       number;
  uvMaxTime:   string;  // "1 pm"
  windMax:     number;  // mph
  windMaxTime: string;  // "3 pm"
  precipProb:  number;  // max probability for today (0-100)
};

export type WeatherData = {
  temp:         number;
  feelsLike:    number;
  code:         number;
  desc:         string;
  windSpeed:    number;
  windDir:      string;
  uvIndex:      number;
  hi:           number;
  lo:           number;
  forecast:     ForecastDay[];
  hourly:       HourlySlice[];   // next 24h from current hour
  dailySummary: DailySummary;
  updatedAt:    number;
};

export type WxIconType = 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Your coordinates, from .env.local (open-meteo needs no API key — just a
// lat/lon). Unset, fetchWeather throws and the weather card stays empty.
const LAT = process.env.NEXT_PUBLIC_WEATHER_LAT;
const LON = process.env.NEXT_PUBLIC_WEATHER_LON;
const TZ  = HOME_TZ;

const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function windDir(deg: number): string {
  return WIND_DIRS[Math.round(deg / 45) % 8];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function dayName(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DAYS[new Date(y, m - 1, d).getDay()];
}

// "YYYY-MM-DDTHH" prefix for the current hour in the home timezone
function currentHourPrefix(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const h = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${h}`;
}

// Format "YYYY-MM-DDTHH:MM" → "5:47 am"
export function fmtTime(iso: string): string {
  const timePart = iso.split('T')[1] ?? '00:00';
  const [hStr, mStr] = timePart.split(':');
  const h = Number(hStr);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return mStr === '00' ? `${h12} ${suffix}` : `${h12}:${mStr} ${suffix}`;
}

// Format "YYYY-MM-DDTHH:00" → "2 pm"  (hour-only, no minutes)
export function fmtHour(iso: string): string {
  const hStr = iso.split('T')[1]?.slice(0, 2) ?? '0';
  const h = Number(hStr);
  if (h === 0)  return '12am';
  if (h < 12)   return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

// ── WMO code → description ────────────────────────────────────────────────────

export function wxDesc(code: number): string {
  if (code === 0)                 return 'Clear';
  if (code === 1)                 return 'Mainly clear';
  if (code === 2)                 return 'Partly cloudy';
  if (code === 3)                 return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 55)   return 'Drizzle';
  if (code >= 61 && code <= 65)   return 'Rain';
  if (code >= 71 && code <= 77)   return 'Snow';
  if (code >= 80 && code <= 82)   return 'Showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code === 95)                return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Severe storm';
  return 'Clear';
}

// ── WMO code → icon type ──────────────────────────────────────────────────────

export function wxIconType(code: number): WxIconType {
  if (code <= 1)                                                return 'sun';
  if (code === 2)                                               return 'partly';
  if (code === 3)                                               return 'cloud';
  if (code === 45 || code === 48)                               return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95)                                               return 'storm';
  return 'rain';
}

// ── UV index label ────────────────────────────────────────────────────────────

export function uvLabel(uv: number): string {
  if (uv <= 2)  return 'Low';
  if (uv <= 5)  return 'Moderate';
  if (uv <= 7)  return 'High';
  if (uv <= 10) return 'Very high';
  return 'Extreme';
}

export function uvColor(uv: number): string {
  if (uv <= 2) return 'var(--ok)';
  if (uv <= 5) return 'var(--warn)';
  if (uv <= 7) return 'oklch(0.72 0.16 55)';
  return 'var(--danger)';
}

// ── Precip probability color ──────────────────────────────────────────────────

export function precipColor(pct: number): string {
  if (pct <= 0)  return 'transparent';
  if (pct >= 50) return 'oklch(0.72 0.12 250)';   // blue
  if (pct >= 20) return '#c9a84c';                  // amber
  return 'var(--faint)';
}

// ── Temperature curve SVG path ────────────────────────────────────────────────
// Returns an SVG <path d="…"> string through all hourly temp points.
// blockW: px width of each hour block.  h: SVG height.

export function tempCurvePath(
  temps: number[],
  blockW: number,
  svgH: number,
): string {
  if (temps.length < 2) return '';
  const pad  = 10;
  const lo   = Math.min(...temps);
  const hi   = Math.max(...temps);
  const rng  = hi - lo || 1;
  const pts  = temps.map((t, i) => ({
    x: (i + 0.5) * blockW,
    y: pad + ((hi - t) / rng) * (svgH - pad * 2),
  }));
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const cpx = ((p0.x + p1.x) / 2).toFixed(1);
    d += ` C ${cpx},${p0.y.toFixed(1)} ${cpx},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return d;
}

// ── API fetch ─────────────────────────────────────────────────────────────────

export async function fetchWeather(): Promise<WeatherData> {
  if (!LAT || !LON) throw new Error('Set NEXT_PUBLIC_WEATHER_LAT / NEXT_PUBLIC_WEATHER_LON in .env.local to enable weather');
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,uv_index` +
    `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,uv_index` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,uv_index_max,precipitation_probability_max` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph` +
    `&timezone=${encodeURIComponent(TZ)}&forecast_days=7`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
  const data = (await res.json()) as OmResponse;

  const c     = data.current;
  const d     = data.daily;
  const h     = data.hourly;
  const round = (n: number) => Math.round(n);

  // ── 5-day forecast ──────────────────────────────────────────────────────────
  const forecast: ForecastDay[] = d.time.slice(1, 6).map((date, i) => ({
    date,
    day:  dayName(date),
    code: d.weather_code[i + 1],
    hi:   round(d.temperature_2m_max[i + 1]),
    lo:   round(d.temperature_2m_min[i + 1]),
  }));

  // ── Next 24 hourly slices from the current hour ─────────────────────────
  const nowPrefix  = currentHourPrefix();
  const startIdx   = Math.max(0, h.time.findIndex(t => t.startsWith(nowPrefix)));
  const hourly: HourlySlice[] = Array.from({ length: 24 }, (_, i) => {
    const idx = startIdx + i;
    return {
      time:   h.time[idx]                       ?? '',
      temp:   round(h.temperature_2m[idx]       ?? 0),
      precip: Math.round(h.precipitation_probability[idx] ?? 0),
      code:   h.weather_code[idx]               ?? 0,
      wind:   round(h.wind_speed_10m[idx]        ?? 0),
      uv:     Math.round((h.uv_index[idx]        ?? 0) * 10) / 10,
    };
  }).filter(s => s.time);

  // ── Daily summary (today = index 0) ────────────────────────────────────────
  const todayStr  = d.time[0];
  const todayIdxs = h.time.reduce<number[]>((acc, t, i) => {
    if (t.startsWith(todayStr)) acc.push(i);
    return acc;
  }, []);

  const todayUV   = todayIdxs.map(i => h.uv_index[i] ?? 0);
  const peakUVIdx = todayUV.indexOf(Math.max(...todayUV, 0));
  const uvMaxTime = peakUVIdx >= 0 ? (h.time[todayIdxs[peakUVIdx]] ?? '') : '';

  const todayWind   = todayIdxs.map(i => h.wind_speed_10m[i] ?? 0);
  const peakWindIdx = todayWind.indexOf(Math.max(...todayWind, 0));
  const windMaxTime = peakWindIdx >= 0 ? (h.time[todayIdxs[peakWindIdx]] ?? '') : '';

  const dailySummary: DailySummary = {
    sunrise:     fmtTime(d.sunrise[0] ?? ''),
    sunset:      fmtTime(d.sunset[0]  ?? ''),
    uvMax:       round(d.uv_index_max[0] ?? 0),
    uvMaxTime:   uvMaxTime ? fmtHour(uvMaxTime) : '',
    windMax:     round(Math.max(...todayWind, 0)),
    windMaxTime: windMaxTime ? fmtHour(windMaxTime) : '',
    precipProb:  d.precipitation_probability_max[0] ?? 0,
  };

  return {
    temp:      round(c.temperature_2m),
    feelsLike: round(c.apparent_temperature),
    code:      c.weather_code,
    desc:      wxDesc(c.weather_code),
    windSpeed: round(c.wind_speed_10m),
    windDir:   windDir(c.wind_direction_10m),
    uvIndex:   round(c.uv_index),
    hi:        round(d.temperature_2m_max[0]),
    lo:        round(d.temperature_2m_min[0]),
    forecast,
    hourly,
    dailySummary,
    updatedAt: Date.now(),
  };
}
