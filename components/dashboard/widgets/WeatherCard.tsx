'use client';
import { Panel }       from '../Panel';
import { WxIcon }      from '../WxIcon';
import { useWeather }  from '../WeatherContext';
import { uvColor, uvLabel, precipColor, fmtHour, type ForecastDay, type HourlySlice } from '@/lib/weather';

// ── 5-day forecast strip ──────────────────────────────────────────────────────

function ForecastStrip({ days }: { days: ForecastDay[] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${days.length}, 1fr)`,
      gap: 2,
      borderTop: '1px solid rgba(255,255,255,.07)',
      paddingTop: 10,
      marginTop: 4,
    }}>
      {days.map(d => (
        <div key={d.date} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '2px 0',
        }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.06em',
            color: 'var(--faint)', textTransform: 'uppercase',
          }}>
            {d.day}
          </span>
          <WxIcon code={d.code} size={14} style={{ color: 'var(--mut)' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700 }}>{d.hi}°</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--mut)' }}>{d.lo}°</span>
        </div>
      ))}
    </div>
  );
}

// ── Mini 6-hour strip ─────────────────────────────────────────────────────────

function MiniHourly({ hourly }: { hourly: HourlySlice[] }) {
  const next6 = hourly.slice(0, 6);
  if (!next6.length) return null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${next6.length}, 1fr)`,
      gap: 2,
      borderTop: '1px solid rgba(255,255,255,.07)',
      paddingTop: 10,
      marginTop: 6,
    }}>
      {next6.map((sl, i) => {
        const isCurrent = i === 0;
        const pColor    = precipColor(sl.precip);
        return (
          <div key={sl.time} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '4px 2px 5px',
            borderRadius: 7,
            background: isCurrent ? 'color-mix(in oklch, var(--accent), transparent 92%)' : 'transparent',
            border: isCurrent ? '1px solid color-mix(in oklch, var(--accent), transparent 80%)' : '1px solid transparent',
          }}>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9,
              color: isCurrent ? 'var(--accent)' : 'var(--faint)',
              fontWeight: isCurrent ? 700 : 400,
            }}>
              {isCurrent ? 'Now' : fmtHour(sl.time)}
            </span>
            <WxIcon code={sl.code} size={13} style={{ color: 'var(--mut)', opacity: 0.85 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700 }}>
              {sl.temp}°
            </span>
            {sl.precip > 0 && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: pColor }}>
                {sl.precip}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function WeatherCard({ delay }: { delay?: number }) {
  const { wx, loading } = useWeather();

  const glyph = wx
    ? <WxIcon code={wx.code} size={15} />
    : <span style={{ opacity: .4 }}>☁</span>;

  const meta = wx
    ? <span className="pill" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{wx.temp}°F</span>
    : null;

  return (
    <Panel glyph={glyph} title="Weather" meta={meta} deepTab="weather" delay={delay}>
      {loading && !wx && (
        <div style={{ color: 'var(--faint)', fontSize: 13, padding: '8px 0' }}>Fetching…</div>
      )}

      {wx && (
        <>
          {/* ── Main temp ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 2 }}>
            <WxIcon code={wx.code} size={38} style={{ color: 'var(--text)', opacity: .9 }} />
            <div>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 42, fontWeight: 700,
                lineHeight: 1, letterSpacing: '-.02em',
              }}>
                {wx.temp}°
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginTop: 3 }}>
                {wx.desc}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 2 }}>
                Feels like {wx.feelsLike}°F
              </div>
            </div>
          </div>

          {/* ── Wind + UV ── */}
          <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 12, color: 'var(--faint)' }}>↗</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600 }}>
                {wx.windSpeed} mph
              </span>
              <span style={{ fontSize: 11, color: 'var(--mut)' }}>{wx.windDir}</span>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,.1)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 11, color: 'var(--faint)' }}>UV</span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 700,
                color: uvColor(wx.uvIndex),
              }}>
                {wx.uvIndex}
              </span>
              <span style={{ fontSize: 11, color: 'var(--mut)' }}>{uvLabel(wx.uvIndex)}</span>
            </div>
          </div>

          {/* ── Hi / Lo ── */}
          <div className="chips" style={{ marginTop: 6 }}>
            <span className="chip">
              <span style={{ color: 'var(--danger)', marginRight: 3 }}>↑</span>
              {wx.hi}°F
            </span>
            <span className="chip">
              <span style={{ color: 'var(--accent)', marginRight: 3 }}>↓</span>
              {wx.lo}°F
            </span>
          </div>

          {/* ── Next 6 hours ── */}
          {wx.hourly.length > 0 && <MiniHourly hourly={wx.hourly} />}

          {/* ── 5-day forecast ── */}
          <ForecastStrip days={wx.forecast} />
        </>
      )}
    </Panel>
  );
}
