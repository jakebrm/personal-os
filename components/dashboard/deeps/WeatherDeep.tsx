'use client';
import { useEffect, useRef } from 'react';
import { Panel }       from '../Panel';
import { WxIcon }      from '../WxIcon';
import { useDashboard } from '../context';
import { useWeather }  from '../WeatherContext';
import {
  uvColor, uvLabel, precipColor, tempCurvePath, fmtHour,
  type ForecastDay, type HourlySlice, type DailySummary,
} from '@/lib/weather';

// Header subtitle: optional place name + coordinates, all from .env.local
function locationLabel(): string {
  const lat  = Number(process.env.NEXT_PUBLIC_WEATHER_LAT);
  const lon  = Number(process.env.NEXT_PUBLIC_WEATHER_LON);
  const name = process.env.NEXT_PUBLIC_WEATHER_LABEL?.toUpperCase();
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return name ?? 'SET NEXT_PUBLIC_WEATHER_LAT / _LON';
  }
  const coords =
    `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ` +
    `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  return name ? `${name} · ${coords}` : coords;
}

// ── Forecast day card ─────────────────────────────────────────────────────────

function ForecastCard({ day }: { day: ForecastDay }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 6, padding: '14px 8px',
      borderRadius: 12, background: 'rgba(255,255,255,.04)',
      border: '1px solid rgba(255,255,255,.08)',
    }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', color: 'var(--mut)' }}>
        {day.day.toUpperCase()}
      </span>
      <WxIcon code={day.code} size={22} style={{ color: 'var(--text)', opacity: .85 }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14 }}>{day.hi}°</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mut)' }}>{day.lo}°</div>
      </div>
    </div>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
    }}>
      <div style={{
        fontSize: 10.5, color: 'var(--faint)', marginBottom: 5,
        letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700,
        color: color ?? 'var(--text)', lineHeight: 1,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Today at a glance ─────────────────────────────────────────────────────────

function TodayGlance({ summary }: { summary: DailySummary }) {
  const items = [
    { icon: '☀', label: 'Sunrise', val: summary.sunrise },
    { icon: '🌇', label: 'Sunset',  val: summary.sunset  },
    {
      icon: '🔆', label: 'Peak UV',
      val: `${summary.uvMax} ${summary.uvMaxTime ? `at ${summary.uvMaxTime}` : ''}`.trim(),
      color: uvColor(summary.uvMax),
    },
    {
      icon: '💨', label: 'Peak wind',
      val: `${summary.windMax} mph${summary.windMaxTime ? ` at ${summary.windMaxTime}` : ''}`,
    },
    {
      icon: '🌧', label: 'Rain chance',
      val: summary.precipProb > 0 ? `${summary.precipProb}%` : 'None',
      color: summary.precipProb >= 50 ? 'oklch(0.72 0.12 250)'
           : summary.precipProb >= 20 ? '#c9a84c'
           : undefined,
    },
  ];

  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
      padding: '12px 16px',
      background: 'rgba(255,255,255,.04)',
      border: '1px solid rgba(255,255,255,.08)',
      borderRadius: 12,
    }}>
      {items.map((it, i) => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {i > 0 && (
            <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,.1)', display: 'block', flexShrink: 0 }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 14 }}>{it.icon}</span>
            <div>
              <div style={{
                fontSize: 9.5, color: 'var(--faint)', textTransform: 'uppercase',
                letterSpacing: '.05em', lineHeight: 1,
              }}>
                {it.label}
              </div>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
                color: it.color ?? 'var(--n1)', lineHeight: 1.3,
              }}>
                {it.val}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Hourly forecast ───────────────────────────────────────────────────────────

const BLOCK_W  = 64;   // px per hour block
const CURVE_H  = 52;   // px height of temperature curve SVG

function HourlyForecast({ hourly }: { hourly: HourlySlice[] }) {
  const scrollRef  = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll so current hour is near the left edge on mount
  useEffect(() => {
    const container = scrollRef.current;
    const block     = currentRef.current;
    if (container && block) {
      container.scrollLeft = Math.max(0, block.offsetLeft - 16);
    }
  }, []);

  if (!hourly.length) return null;

  const totalW = hourly.length * BLOCK_W;
  const temps  = hourly.map(h => h.temp);
  const curve  = tempCurvePath(temps, BLOCK_W, CURVE_H);

  // Temp label y-positions (to place them near the curve)
  const lo   = Math.min(...temps);
  const hi   = Math.max(...temps);
  const rng  = hi - lo || 1;
  const pad  = 10;

  return (
    <div>
      {/* Scrollable container */}
      <div
        ref={scrollRef}
        style={{
          overflowX: 'auto',
          overflowY: 'visible',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        <div style={{ width: totalW, position: 'relative' }}>

          {/* Temperature curve SVG */}
          <svg
            width={totalW} height={CURVE_H}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {/* Gradient fill under curve */}
            <defs>
              <linearGradient id="wx-grad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%"   stopColor="var(--accent)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {/* Filled area */}
            {curve && (
              <path
                d={`${curve} L ${(hourly.length - 0.5) * BLOCK_W},${CURVE_H} L ${0.5 * BLOCK_W},${CURVE_H} Z`}
                fill="url(#wx-grad)"
              />
            )}
            {/* Curve line */}
            {curve && (
              <path
                d={curve}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.7"
              />
            )}
            {/* Temp labels above the curve */}
            {hourly.map((sl, i) => {
              const x = (i + 0.5) * BLOCK_W;
              const y = pad + ((hi - sl.temp) / rng) * (CURVE_H - pad * 2) - 6;
              return (
                <text
                  key={sl.time}
                  x={x} y={y}
                  textAnchor="middle"
                  style={{
                    fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                    fill: 'var(--n1)',
                  }}
                >
                  {sl.temp}°
                </text>
              );
            })}
          </svg>

          {/* Hour blocks */}
          <div style={{ display: 'flex' }}>
            {hourly.map((sl, i) => {
              const isCurrent = i === 0;
              const pColor    = precipColor(sl.precip);

              return (
                <div
                  key={sl.time}
                  ref={isCurrent ? currentRef : undefined}
                  style={{
                    width: BLOCK_W, flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 5, padding: '8px 4px 10px',
                    borderRadius: isCurrent ? 10 : 0,
                    background: isCurrent
                      ? 'color-mix(in oklch, var(--accent), transparent 90%)'
                      : 'transparent',
                    border: isCurrent
                      ? '1px solid color-mix(in oklch, var(--accent), transparent 75%)'
                      : '1px solid transparent',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Time */}
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 10, fontWeight: isCurrent ? 700 : 400,
                    color: isCurrent ? 'var(--accent)' : 'var(--faint)',
                  }}>
                    {isCurrent ? 'Now' : fmtHour(sl.time)}
                  </div>

                  {/* Weather icon */}
                  <WxIcon
                    code={sl.code} size={16}
                    style={{ color: 'var(--text)', opacity: 0.75 }}
                  />

                  {/* Precip probability */}
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
                    color: pColor,
                    opacity: sl.precip === 0 ? 0 : 1,
                    height: 14,   // keep layout stable even when invisible
                  }}>
                    {sl.precip > 0 ? `${sl.precip}%` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 14, marginTop: 10,
        fontSize: 10.5, color: 'var(--faint)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 2, background: '#c9a84c', display: 'inline-block', borderRadius: 1 }} />
          ≥20% rain
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 2, background: 'oklch(0.72 0.12 250)', display: 'inline-block', borderRadius: 1 }} />
          ≥50% rain
        </span>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function WeatherDeep() {
  const { setTab }      = useDashboard();
  const { wx, loading } = useWeather();

  const updatedLabel = wx
    ? (() => {
        const mins = Math.round((Date.now() - wx.updatedAt) / 60_000);
        return mins < 1 ? 'just now' : `${mins}m ago`;
      })()
    : null;

  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>

      <div className="deep-head">
        <div>
          <h1>Weather</h1>
          <div className="sub">
            {locationLabel()}
            {updatedLabel && (
              <span style={{ marginLeft: 10, color: 'var(--faint)' }}>· updated {updatedLabel}</span>
            )}
          </div>
        </div>
        {wx && (
          <div className="actions">
            <span className="chip">{wx.desc}</span>
          </div>
        )}
      </div>

      {loading && !wx && (
        <div style={{ color: 'var(--faint)', fontSize: 14, padding: '24px 0' }}>Fetching weather…</div>
      )}

      {wx && (
        <div className="stack">
          {/* ── Current conditions ── */}
          <Panel glyph={<WxIcon code={wx.code} size={15} />} title="Right now">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginBottom: 10 }}>
              <WxIcon code={wx.code} size={56} style={{ color: 'var(--text)', opacity: .9, flexShrink: 0 }} />
              <div>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 58, fontWeight: 700,
                  lineHeight: 1, letterSpacing: '-.02em',
                }}>
                  {wx.temp}°F
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{wx.desc}</div>
                <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>
                  Feels like {wx.feelsLike}°F
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Stat label="High"     value={`${wx.hi}°F`} />
              <Stat label="Low"      value={`${wx.lo}°F`} />
              <Stat label="UV Index" value={String(wx.uvIndex)} sub={uvLabel(wx.uvIndex)} color={uvColor(wx.uvIndex)} />
              <Stat label="Wind"     value={`${wx.windSpeed}`} sub={`mph · ${wx.windDir}`} />
            </div>
          </Panel>

          {/* ── Today at a glance + hourly ── */}
          <Panel glyph="⏱" title="Next 24 Hours">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <TodayGlance summary={wx.dailySummary} />
              <HourlyForecast hourly={wx.hourly} />
            </div>
          </Panel>

          {/* ── 5-day forecast ── */}
          <Panel glyph="▦" title="5-Day Forecast">
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${wx.forecast.length}, 1fr)`,
              gap: 10,
            }}>
              {wx.forecast.map(d => <ForecastCard key={d.date} day={d} />)}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
