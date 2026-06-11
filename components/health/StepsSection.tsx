'use client';
import {
  BarChart, Bar, Cell, XAxis, YAxis,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { WellnessRow } from './useHealthData';
import { Skel, CardHead, Tile, Legend, TOOLTIP_STYLE, PAL } from './shared';
import { homeDateStr } from '@/lib/dates';

// ── Color scale ───────────────────────────────────────────────────────────────

const GOAL      = 10_000;
const AMBER_MIN =  7_000;

function stepColor(n: number): string {
  if (n >= GOAL)      return PAL.ok;
  if (n >= AMBER_MIN) return PAL.warn;
  return PAL.danger;
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

type TooltipProps = {
  active?:  boolean;
  payload?: { payload: StepDay }[];
};

function StepTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d     = payload[0].payload;
  const color = stepColor(d.steps);
  const label = new Date(d.date + 'T12:00').toLocaleString('en-US', { month: 'short', day: 'numeric' });
  const note  = d.steps >= GOAL
    ? '✓ goal reached'
    : d.steps >= AMBER_MIN
      ? `${(GOAL - d.steps).toLocaleString()} to goal`
      : 'below target';

  return (
    <div style={{ ...TOOLTIP_STYLE, padding: '9px 13px' }}>
      <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 5, letterSpacing: '.04em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>
        {d.steps.toLocaleString()}
      </div>
      <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 4 }}>
        {note}
      </div>
    </div>
  );
}

// ── Data types ────────────────────────────────────────────────────────────────

type StepDay = { date: string; day: number; steps: number };

// ── Main component ────────────────────────────────────────────────────────────

type Props = { wellness: WellnessRow[]; loading: boolean };

export function StepsSection({ wellness, loading }: Props) {
  const today = homeDateStr();

  // Use all available days with step data (up to 60 days from the garmin endpoint)
  const data: StepDay[] = wellness
    .filter(r => r.steps != null && r.steps > 0)
    .map(r => ({ date: r.date, day: Number(r.date.slice(8, 10)), steps: r.steps as number }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const vals       = data.map(d => d.steps);
  const avgSteps   = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  const bestSteps  = vals.length ? Math.max(...vals) : 0;
  const goalDays   = vals.filter(s => s >= GOAL).length;
  const todaySteps = data.find(d => d.date === today)?.steps ?? null;

  // Chart Y domain: headroom above best or goal
  const yMax = Math.max(GOAL * 1.25, bestSteps * 1.1);

  // X-axis: month abbreviation at day-1, day number at weekly anchors
  const tickFormatter = (dateStr: string): string => {
    const item = data.find(d => d.date === dateStr);
    if (!item) return '';
    if (item.day === 1) {
      return new Date(dateStr + 'T12:00').toLocaleString('en-US', { month: 'short' });
    }
    if ([8, 15, 22, 29].includes(item.day)) return String(item.day);
    return '';
  };

  // Span label e.g. "Apr 7 – Jun 6"
  const spanLabel = data.length >= 2
    ? (() => {
        const fmt = (d: string) => new Date(d + 'T12:00').toLocaleString('en-US', { month: 'short', day: 'numeric' });
        return `${fmt(data[0].date)} – ${fmt(data[data.length - 1].date)}`;
      })()
    : undefined;

  return (
    <div className="card" style={{ gap: 16 }}>
      <CardHead icon="steps" title="Daily Steps" source="garmin" meta={spanLabel} />

      {loading ? (
        <Skel h={200} />
      ) : data.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--faint)', padding: '24px 0', textAlign: 'center' }}>
          No steps data yet — sync Garmin in Health → Sources
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="steps-kpi-grid">
            <Tile
              label="Avg / day"
              value={avgSteps > 0 ? avgSteps.toLocaleString() : '—'}
              color={avgSteps > 0 ? stepColor(avgSteps) : undefined}
            />
            <Tile
              label="Best day"
              value={bestSteps > 0 ? bestSteps.toLocaleString() : '—'}
              color={PAL.ok}
            />
            <Tile
              label="Hit 10k"
              value={`${goalDays} / ${data.length}`}
              color={goalDays / data.length >= 0.5 ? PAL.ok : goalDays / data.length >= 0.25 ? PAL.warn : 'var(--n2)'}
              sub={`${Math.round(goalDays / data.length * 100)}% of days`}
            />
            <Tile
              label="Today"
              value={todaySteps != null ? todaySteps.toLocaleString() : '—'}
              color={todaySteps != null ? stepColor(todaySteps) : 'var(--faint)'}
              sub={todaySteps != null && todaySteps < GOAL ? `${(GOAL - todaySteps).toLocaleString()} to go` : undefined}
            />
          </div>

          {/* Bar chart */}
          <ResponsiveContainer width="100%" height={128}>
            <BarChart
              data={data}
              barCategoryGap="18%"
              margin={{ top: 10, right: 4, left: 4, bottom: 0 }}
            >
              {/* Goal reference line */}
              <ReferenceLine
                y={GOAL}
                stroke="var(--card-bd)"
                strokeDasharray="3 4"
                ifOverflow="extendDomain"
              />

              <XAxis
                dataKey="date"
                tickFormatter={tickFormatter}
                tick={{ fontSize: 9, fill: 'var(--faint)', fontFamily: 'var(--mono)' }}
                tickLine={false}
                axisLine={false}
                interval={0}
              />

              <YAxis hide domain={[0, yMax]} />

              <Tooltip
                content={<StepTooltip />}
                cursor={{ fill: 'var(--chip-bg)', radius: [3, 3, 0, 0] as unknown as number }}
              />

              <Bar dataKey="steps" radius={[3, 3, 0, 0]}>
                {data.map(e => (
                  <Cell
                    key={e.date}
                    fill={stepColor(e.steps)}
                    opacity={e.date === today ? 1 : 0.6}
                    stroke={e.date === today ? stepColor(e.steps) : 'none'}
                    strokeWidth={e.date === today ? 1 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Goal line label + color key */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Legend items={[
              { color: PAL.ok,     label: '≥ 10k goal' },
              { color: PAL.warn,   label: '≥ 7k'       },
              { color: PAL.danger, label: '< 7k'       },
            ]} />
            <span style={{ fontSize: 10, color: 'var(--faint)', opacity: 0.6 }}>— 10k goal line</span>
          </div>
        </>
      )}
    </div>
  );
}
