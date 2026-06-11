'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { BiomarkerGroup, Biomarker } from './useHealthData';
import type { ImportResult } from '../../app/api/health/biomarkers/import-url/route';
import { Skel, CardHead, PAL } from './shared';
import { homeDateStr } from '@/lib/dates';

type Props = { groups: BiomarkerGroup[]; loading: boolean; onAdded: () => void };
type MarkerInput = { name: string; value: string; unit: string; ref_low: string; ref_high: string };

// ── Category definitions ──────────────────────────────────────────────────────

const CATEGORIES: { label: string; icon: string; keys: string[] }[] = [
  { label: 'Hormones',            icon: '⚡', keys: ['Testosterone (Total)', 'Testosterone (Free)', 'SHBG', 'Estradiol', 'Cortisol', 'DHEA-S'] },
  { label: 'Thyroid',             icon: '◎', keys: ['TSH', 'Free T3', 'Free T4'] },
  { label: 'Vitamins & Minerals', icon: '✦', keys: ['Vitamin D', 'B12', 'Iron', 'Ferritin'] },
  { label: 'Blood Count',         icon: '◈', keys: ['WBC', 'RBC', 'Hemoglobin', 'Hematocrit'] },
  { label: 'Metabolic',           icon: '◇', keys: ['Glucose', 'HbA1c', 'Insulin', 'ALT', 'AST', 'GGT', 'Creatinine', 'eGFR'] },
  { label: 'Lipids',              icon: '◑', keys: ['Total Cholesterol', 'LDL', 'HDL', 'Triglycerides'] },
  { label: 'Inflammation',        icon: '◐', keys: ['hsCRP', 'Homocysteine'] },
];

const RYTHM_MARKERS: Array<{ name: string; unit: string; ref_low: number; ref_high: number }> = [
  { name: 'Testosterone (Total)',  unit: 'ng/dL',  ref_low: 300,   ref_high: 1000  },
  { name: 'Testosterone (Free)',   unit: 'pg/mL',  ref_low: 50,    ref_high: 210   },
  { name: 'SHBG',                  unit: 'nmol/L', ref_low: 10,    ref_high: 57    },
  { name: 'Estradiol',             unit: 'pg/mL',  ref_low: 7.6,   ref_high: 42.6  },
  { name: 'Cortisol',              unit: 'µg/dL',  ref_low: 6,     ref_high: 23    },
  { name: 'DHEA-S',                unit: 'µg/dL',  ref_low: 80,    ref_high: 560   },
  { name: 'TSH',                   unit: 'mIU/L',  ref_low: 0.4,   ref_high: 4.0   },
  { name: 'Free T3',               unit: 'pg/mL',  ref_low: 2.3,   ref_high: 4.2   },
  { name: 'Free T4',               unit: 'ng/dL',  ref_low: 0.8,   ref_high: 1.8   },
  { name: 'Vitamin D',             unit: 'ng/mL',  ref_low: 30,    ref_high: 80    },
  { name: 'B12',                   unit: 'pg/mL',  ref_low: 200,   ref_high: 900   },
  { name: 'Iron',                  unit: 'µg/dL',  ref_low: 60,    ref_high: 170   },
  { name: 'Ferritin',              unit: 'ng/mL',  ref_low: 12,    ref_high: 300   },
  { name: 'WBC',                   unit: 'K/µL',   ref_low: 4.5,   ref_high: 11.0  },
  { name: 'RBC',                   unit: 'M/µL',   ref_low: 4.7,   ref_high: 6.1   },
  { name: 'Hemoglobin',            unit: 'g/dL',   ref_low: 13.8,  ref_high: 17.2  },
  { name: 'Hematocrit',            unit: '%',      ref_low: 41,    ref_high: 53    },
  { name: 'Glucose',               unit: 'mg/dL',  ref_low: 70,    ref_high: 99    },
  { name: 'HbA1c',                 unit: '%',      ref_low: 0,     ref_high: 5.7   },
  { name: 'Insulin',               unit: 'µIU/mL', ref_low: 2,     ref_high: 19.6  },
  { name: 'ALT',                   unit: 'U/L',    ref_low: 7,     ref_high: 56    },
  { name: 'AST',                   unit: 'U/L',    ref_low: 10,    ref_high: 40    },
  { name: 'GGT',                   unit: 'U/L',    ref_low: 8,     ref_high: 61    },
  { name: 'Creatinine',            unit: 'mg/dL',  ref_low: 0.74,  ref_high: 1.35  },
  { name: 'eGFR',                  unit: 'mL/min', ref_low: 60,    ref_high: 999   },
  { name: 'Total Cholesterol',     unit: 'mg/dL',  ref_low: 0,     ref_high: 200   },
  { name: 'LDL',                   unit: 'mg/dL',  ref_low: 0,     ref_high: 100   },
  { name: 'HDL',                   unit: 'mg/dL',  ref_low: 40,    ref_high: 999   },
  { name: 'Triglycerides',         unit: 'mg/dL',  ref_low: 0,     ref_high: 150   },
  { name: 'hsCRP',                 unit: 'mg/L',   ref_low: 0,     ref_high: 3.0   },
  { name: 'Homocysteine',          unit: 'µmol/L', ref_low: 0,     ref_high: 15    },
];

// ── Age-22 athlete lens ───────────────────────────────────────────────────────
// Lab "normal" ranges are population-wide; these are tighter optimal bands for a
// 22-year-old male hybrid athlete. null = unbounded on that side.

const OPTIMAL_22M: Record<string, { lo: number | null; hi: number | null; note: string }> = {
  'Testosterone (Total)': { lo: 600, hi: 950,  note: 'These are your peak years — under ~600 at 22 usually traces to sleep, under-eating, or training load.' },
  'Vitamin D':            { lo: 40,  hi: 60,   note: 'Recovery and bone health favor 40–60; lab passes you at 30.' },
  'Ferritin':             { lo: 50,  hi: 150,  note: 'Run volume burns iron — under 50 quietly caps aerobic gains even when "in range".' },
  'HDL':                  { lo: 55,  hi: null, note: 'Your cardio volume should keep this 55+ — the athlete zone, not the lab floor of 40.' },
  'LDL':                  { lo: null, hi: 90,  note: 'Under 90 at 22 banks decades of low arterial exposure; lab passes at 100.' },
  'Triglycerides':        { lo: null, hi: 80,  note: 'Under 80 means carbs are being burned, not stored — lab allows 150.' },
  'hsCRP':                { lo: null, hi: 0.8, note: 'Baseline inflammation — under 0.8 is elite; note hard sessions in the 48h before a draw inflate it.' },
  'HbA1c':                { lo: null, hi: 5.3, note: '90-day glucose picture — 5.3 or under is excellent headroom at your age.' },
  'Glucose':              { lo: 70,  hi: 90,  note: 'Fasting under 90 pairs with the HbA1c story.' },
  'TSH':                  { lo: 0.5, hi: 2.5, note: 'The engine throttle — mid-range runs best; above 2.5 is "fine" but not optimal.' },
  'B12':                  { lo: 500, hi: 900, note: 'Lab floor is 200, but energy and recovery favor 500+.' },
  'Hemoglobin':           { lo: 14.5, hi: 17, note: 'O₂-carrying capacity — your endurance ceiling lives here.' },
  'Cortisol':             { lo: 8,   hi: 18,  note: 'Morning draw assumed — chronically high alongside hard weeks means recovery debt.' },
};

type OptStatus = 'optimal' | 'push' | null;

/** Is this marker inside the tighter age-22 optimal band? */
function optimalStatus(m: Biomarker): OptStatus {
  const opt = OPTIMAL_22M[m.marker_name];
  if (!opt || m.value == null) return null;
  const aboveLo = opt.lo == null || m.value >= opt.lo;
  const belowHi = opt.hi == null || m.value <= opt.hi;
  return aboveLo && belowHi ? 'optimal' : 'push';
}

function optRangeLabel(name: string): string {
  const o = OPTIMAL_22M[name];
  if (!o) return '';
  if (o.lo != null && o.hi != null) return `${o.lo}–${o.hi}`;
  if (o.lo != null) return `≥${o.lo}`;
  return `≤${o.hi}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const OPEN_HIGH = 990; // ref_high >= this means "no upper bound" (e.g. HDL > 40)

function rangeStatus(m: { value: number | null; reference_low: number | null; reference_high: number | null }): 'ok' | 'warn' | 'danger' | 'unknown' {
  if (m.value == null) return 'unknown';
  const lo = m.reference_low, hi = m.reference_high;
  if (lo == null && hi == null) return 'unknown';

  const openHigh = hi == null || hi >= OPEN_HIGH;
  const openLow  = lo == null || lo <= 0;

  if (openHigh && lo != null && m.value >= lo) return 'ok';
  if (openLow  && hi != null && m.value <= hi) return 'ok';
  if (lo != null && hi != null && m.value >= lo && m.value <= hi) return 'ok';

  // borderline: within 15% of the violated bound
  const span = (lo != null && hi != null && !openHigh) ? hi - lo : (hi ?? lo ?? 1);
  if (lo != null && m.value < lo && m.value >= lo - span * 0.15) return 'warn';
  if (hi != null && !openHigh && m.value > hi && m.value <= hi + span * 0.15) return 'warn';
  return 'danger';
}

const STATUS_COLOR: Record<ReturnType<typeof rangeStatus>, string> = {
  ok:      PAL.ok,
  warn:    PAL.warn,
  danger:  PAL.danger,
  unknown: 'var(--n3)',
};
const STATUS_LABEL: Record<ReturnType<typeof rangeStatus>, string> = {
  ok:      'In range',
  warn:    'Borderline',
  danger:  'Out of range',
  unknown: '—',
};

function fmtVal(v: number): string {
  if (v >= 1000) return v.toLocaleString();
  if (Number.isInteger(v)) return String(v);
  return v < 10 ? v.toFixed(2) : v.toFixed(1);
}

function trendArrow(curr: number, prev: number): { arrow: string; pct: string; up: boolean } {
  const delta = ((curr - prev) / Math.abs(prev)) * 100;
  return {
    arrow: delta > 0.5 ? '↑' : delta < -0.5 ? '↓' : '→',
    pct:   Math.abs(delta) < 0.5 ? '' : `${Math.abs(delta).toFixed(1)}%`,
    up:    delta > 0,
  };
}

function exportText(groups: BiomarkerGroup[]): string {
  return groups.map(g => {
    const lines = [`Test Date: ${g.date} (${g.test_source})`];
    g.markers.forEach(m => {
      const s = rangeStatus(m);
      const flag = s === 'ok' ? '✓' : s === 'warn' ? '⚠' : s === 'danger' ? '✗' : ' ';
      lines.push(`  ${flag} ${m.marker_name}: ${m.value ?? '—'} ${m.unit ?? ''} (ref ${m.reference_low}–${m.reference_high})`);
    });
    return lines.join('\n');
  }).join('\n\n');
}

// ── Range gauge ───────────────────────────────────────────────────────────────

function MarkerGauge({ m }: { m: Biomarker }) {
  if (m.value == null) return null;
  const lo = m.reference_low, hi = m.reference_high;
  if (lo == null && hi == null) return null;

  const openHigh = hi == null || hi >= OPEN_HIGH;
  const openLow  = lo == null || lo <= 0;
  const status   = rangeStatus(m);
  const color    = STATUS_COLOR[status];

  // Build display domain
  let domMin: number, domMax: number;
  if (openHigh && lo != null) {
    domMin = lo * 0.5;
    domMax = Math.max(m.value * 1.4, lo * 2.2);
  } else if (openLow && hi != null) {
    domMin = 0;
    domMax = hi * 1.5;
  } else {
    const span = (hi! - lo!);
    domMin = lo! - span * 0.35;
    domMax = hi! + span * 0.35;
  }
  const domSpan = domMax - domMin;

  const valPct = Math.min(97, Math.max(3, ((m.value - domMin) / domSpan) * 100));
  const loPct  = lo != null && !openLow  ? Math.max(0, ((lo - domMin) / domSpan) * 100) : 0;
  const hiPct  = hi != null && !openHigh ? Math.min(100, ((hi - domMin) / domSpan) * 100) : 100;

  return (
    <div style={{ marginTop: 9, marginBottom: 4, position: 'relative', paddingBottom: 16 }}>
      {/* Track */}
      <div style={{ position: 'relative', height: 5, borderRadius: 3, background: 'var(--ph)' }}>
        {/* Green zone */}
        <div style={{
          position: 'absolute',
          left: `${loPct}%`, width: `${hiPct - loPct}%`,
          height: '100%', borderRadius: 3,
          background: openHigh
            ? `linear-gradient(90deg, color-mix(in oklch, ${PAL.ok}, transparent 62%) 0%, color-mix(in oklch, ${PAL.ok}, transparent 92%) 100%)`
            : `color-mix(in oklch, ${PAL.ok}, transparent 70%)`,
        }} />
        {/* Value pin */}
        <div style={{
          position: 'absolute',
          left: `${valPct}%`, top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 13, height: 13, borderRadius: '50%',
          background: color,
          border: '2.5px solid var(--bg)',
          boxShadow: `0 0 0 2.5px color-mix(in oklch, ${color}, transparent 65%)`,
          transition: 'left .45s cubic-bezier(.22,.61,.36,1)',
        }} />
      </div>
      {/* Labels under bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
        {lo != null && !openLow && (
          <span style={{ position: 'absolute', left: `${loPct}%`, transform: 'translateX(-50%)', fontSize: 9, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>{lo}</span>
        )}
        {hi != null && !openHigh && (
          <span style={{ position: 'absolute', left: `${hiPct}%`, transform: 'translateX(-50%)', fontSize: 9, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>{hi}</span>
        )}
        {openHigh && lo != null && (
          <span style={{ position: 'absolute', left: `${loPct}%`, transform: 'translateX(-50%)', fontSize: 9, color: 'var(--faint)' }}>≥{lo}</span>
        )}
      </div>
    </div>
  );
}

// ── Dashboard: marker row ─────────────────────────────────────────────────────

function MarkerRow({ m, prev }: { m: Biomarker; prev?: Biomarker | null }) {
  const status = rangeStatus(m);
  const color  = STATUS_COLOR[status];
  const isOut  = status === 'danger';
  const isBorder = status === 'warn';

  const trend = (prev?.value != null && m.value != null)
    ? trendArrow(m.value, prev.value)
    : null;

  return (
    <div style={{
      padding: '11px 12px',
      borderRadius: 10,
      background: isOut ? `color-mix(in oklch, ${PAL.danger}, transparent 92%)` : isBorder ? `color-mix(in oklch, ${PAL.warn}, transparent 94%)` : 'transparent',
      border: isOut ? `1px solid color-mix(in oklch, ${PAL.danger}, transparent 80%)` : isBorder ? `1px solid color-mix(in oklch, ${PAL.warn}, transparent 84%)` : '1px solid transparent',
      marginBottom: 3,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {/* Status dot */}
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block', marginBottom: 1 }} />
        {/* Name */}
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--n1)' }}>
          {m.marker_name}
        </span>
        {/* Trend */}
        {trend && trend.pct && (
          <span style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>
            {trend.arrow}{trend.pct}
          </span>
        )}
        {/* Value */}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--n1)', letterSpacing: '-.02em' }}>
          {m.value != null ? fmtVal(m.value) : '—'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--mut)', minWidth: 40 }}>{m.unit}</span>
      </div>
      <MarkerGauge m={m} />
    </div>
  );
}

// ── Dashboard: category section ───────────────────────────────────────────────

function CategorySection({
  cat, markers, prevMarkers,
}: {
  cat: typeof CATEGORIES[0];
  markers: Biomarker[];
  prevMarkers: Biomarker[];
}) {
  const present = markers.filter(m => m.value != null);
  if (present.length === 0) return null;

  const counts = present.reduce((acc, m) => {
    acc[rangeStatus(m)]++;
    return acc;
  }, { ok: 0, warn: 0, danger: 0, unknown: 0 } as Record<string, number>);

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Category header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '0 2px' }}>
        <span style={{ fontSize: 11, color: 'var(--faint)' }}>{cat.icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>
          {cat.label}
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--n4)' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {counts.danger > 0 && <span style={{ fontSize: 10, color: PAL.danger, fontFamily: 'var(--mono)' }}>{counts.danger} ✗</span>}
          {counts.warn   > 0 && <span style={{ fontSize: 10, color: PAL.warn, fontFamily: 'var(--mono)' }}>{counts.warn} ⚠</span>}
          {counts.ok     > 0 && <span style={{ fontSize: 10, color: PAL.ok, fontFamily: 'var(--mono)' }}>{counts.ok} ✓</span>}
        </div>
      </div>
      {/* Markers */}
      {present.map(m => (
        <MarkerRow
          key={m.id}
          m={m}
          prev={prevMarkers.find(p => p.marker_name === m.marker_name) ?? null}
        />
      ))}
    </div>
  );
}

// ── Dashboard: summary bar ────────────────────────────────────────────────────

function SummaryBar({ markers }: { markers: Biomarker[] }) {
  const present = markers.filter(m => m.value != null);
  const ok      = present.filter(m => rangeStatus(m) === 'ok').length;
  const warn    = present.filter(m => rangeStatus(m) === 'warn').length;
  const danger  = present.filter(m => rangeStatus(m) === 'danger').length;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 4, borderBottom: '1px solid var(--n4)', marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: PAL.ok, fontWeight: 600 }}>{ok} in range</span>
      {warn   > 0 && <><span style={{ color: 'var(--faint)', fontSize: 12 }}>·</span><span style={{ fontSize: 12, color: PAL.warn, fontWeight: 600 }}>{warn} borderline</span></>}
      {danger > 0 && <><span style={{ color: 'var(--faint)', fontSize: 12 }}>·</span><span style={{ fontSize: 12, color: PAL.danger, fontWeight: 600 }}>{danger} out of range</span></>}
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--faint)' }}>{present.length} markers</span>
    </div>
  );
}

// ── Age-22 lens highlights ────────────────────────────────────────────────────

function AgeLens({ markers }: { markers: Biomarker[] }) {
  const scored = markers.filter(m => m.value != null && OPTIMAL_22M[m.marker_name]);
  if (scored.length === 0) return null;

  const dialed = scored.filter(m => optimalStatus(m) === 'optimal' && rangeStatus(m) === 'ok');
  // Worth pushing: outside the optimal band (including anything the lab already flags)
  const push = scored
    .filter(m => optimalStatus(m) === 'push')
    .sort((a, b) => {
      const rank = (m: Biomarker) => rangeStatus(m) === 'danger' ? 0 : rangeStatus(m) === 'warn' ? 1 : 2;
      return rank(a) - rank(b);
    })
    .slice(0, 4);

  return (
    <div style={{
      border: '1px solid color-mix(in oklch, var(--accent2), transparent 70%)',
      background: 'color-mix(in oklch, var(--accent2), transparent 95%)',
      borderRadius: 14, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: 'var(--accent2)' }}>
          AGE-22 LENS
        </span>
        <span style={{ fontSize: 11, color: 'var(--mut)' }}>
          optimal bands for a 22-year-old athlete, not just lab “normal”
        </span>
      </div>

      {dialed.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: PAL.ok, marginRight: 2 }}>✓ dialed in</span>
          {dialed.map(m => (
            <span key={m.id} className="chip" style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>
              {m.marker_name} <b style={{ color: PAL.ok, marginLeft: 4 }}>{fmtVal(m.value!)}</b>
            </span>
          ))}
        </div>
      )}

      {push.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent2)' }}>◆ worth pushing</span>
          {push.map(m => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{m.marker_name}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 700 }}>{fmtVal(m.value!)} {m.unit}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--accent2)' }}>
                  → optimal {optRangeLabel(m.marker_name)}
                </span>
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--mut)', lineHeight: 1.5 }}>
                {OPTIMAL_22M[m.marker_name].note}
              </span>
            </div>
          ))}
        </div>
      )}

      {push.length === 0 && (
        <span style={{ fontSize: 12, color: PAL.ok }}>
          Every tracked marker is inside the athlete-optimal band. Keep doing exactly this.
        </span>
      )}
    </div>
  );
}

// ── Dashboard: full view ──────────────────────────────────────────────────────

function Dashboard({
  groups, activeDate, onDateChange,
}: {
  groups: BiomarkerGroup[];
  activeDate: string | null;
  onDateChange: (d: string) => void;
}) {
  const activeGroup = groups.find(g => g.date === activeDate) ?? groups[0];
  // Previous panel = the one right after activeGroup in the date-desc list
  const activeIdx  = groups.findIndex(g => g.date === activeGroup?.date);
  const prevGroup  = groups[activeIdx + 1] ?? null;

  if (!activeGroup) return null;

  const markers     = activeGroup.markers as Biomarker[];
  const prevMarkers = (prevGroup?.markers ?? []) as Biomarker[];

  // Group markers by category; collect "other" markers not in any category
  const categorized = new Set(CATEGORIES.flatMap(c => c.keys));
  const others = markers.filter(m => !categorized.has(m.marker_name));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Test date selector */}
      {groups.length > 1 && (
        <div className="hx-seg" style={{ marginBottom: 12 }}>
          {groups.map(g => (
            <button key={g.date} className={g.date === activeGroup.date ? 'on' : ''}
              onClick={() => onDateChange(g.date)}>
              {g.date} · {g.test_source}
            </button>
          ))}
        </div>
      )}

      <SummaryBar markers={markers} />

      <div style={{ marginTop: 10 }}>
        <AgeLens markers={markers} />
      </div>

      {/* Category sections */}
      <div style={{ marginTop: 8 }}>
        {CATEGORIES.map(cat => (
          <CategorySection
            key={cat.label}
            cat={cat}
            markers={markers.filter(m => cat.keys.includes(m.marker_name))}
            prevMarkers={prevMarkers.filter(m => cat.keys.includes(m.marker_name))}
          />
        ))}

        {/* Uncategorized markers */}
        {others.length > 0 && (
          <CategorySection
            cat={{ label: 'Other', icon: '◫', keys: others.map(m => m.marker_name) }}
            markers={others}
            prevMarkers={prevMarkers.filter(m => others.some(o => o.marker_name === m.marker_name))}
          />
        )}
      </div>

      {/* Test meta */}
      <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--n4)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--faint)' }}>
          {activeGroup.test_source} · {activeGroup.date}
        </span>
        {prevGroup && (
          <span style={{ fontSize: 11, color: 'var(--faint)', opacity: 0.7 }}>
            vs {prevGroup.date}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Import modal ──────────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported }: {
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { areaRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const extract = useCallback(async () => {
    if (!text.trim()) { setError('Paste your results first'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/health/biomarkers/import-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const json = await res.json() as { error?: string } & ImportResult;
      if (!res.ok) { setError(json.error ?? 'Extraction failed'); return; }
      onImported(json);
    } catch (e) { setError(String(e)); }
    finally     { setLoading(false); }
  }, [text, onImported]);

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', padding: '20px 16px', boxSizing: 'border-box' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, background: 'linear-gradient(155deg,rgba(255,255,255,.09),rgba(255,255,255,.04))', border: '1px solid rgba(255,255,255,.13)', borderRadius: 18, padding: '20px 22px', boxShadow: '0 1px 0 rgba(255,255,255,.20) inset, 0 32px 80px rgba(0,0,0,.8)', backdropFilter: 'blur(28px) saturate(1.4)', WebkitBackdropFilter: 'blur(28px) saturate(1.4)', fontFamily: 'var(--sans,"Space Grotesk",system-ui,sans-serif)', color: 'var(--text,#ecedf2)', animation: 'cardIn .22s cubic-bezier(.22,.61,.36,1) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 16, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.13)' }}>🧬</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>Import from Rythm</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>Claude extracts every marker automatically</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.11)', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }}>×</button>
        </div>

        <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 10, padding: '10px 13px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>💡</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', lineHeight: 1.65 }}>
            Open your Rythm share link → press <Kbd>⌘A</Kbd> → <Kbd>⌘C</Kbd> → paste below.
          </div>
        </div>

        <textarea ref={areaRef} value={text} onChange={e => { setText(e.target.value); if (error) setError(''); }}
          placeholder="Paste your Rythm results here…"
          style={{ width: '100%', minHeight: 200, padding: '12px 14px', background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.11)', borderRadius: 11, color: '#ecedf2', fontFamily: 'var(--mono,"Space Mono",ui-monospace,monospace)', fontSize: 12, lineHeight: 1.6, resize: 'vertical', outline: 'none', transition: 'border-color .12s', boxSizing: 'border-box' }}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,.11)')}
        />

        {error && <div style={{ background: 'rgba(212,82,82,.1)', border: '1px solid rgba(212,82,82,.3)', borderRadius: 9, padding: '9px 13px', fontSize: 13, color: '#e88' }}>{error}</div>}

        <button onClick={extract} disabled={loading || !text.trim()} style={{ width: '100%', padding: '13px 0', background: loading || !text.trim() ? 'rgba(255,255,255,.07)' : 'var(--accent)', border: 'none', borderRadius: 11, color: loading || !text.trim() ? 'rgba(255,255,255,.3)' : '#fff', fontFamily: 'var(--sans,"Space Grotesk",system-ui,sans-serif)', fontSize: 14, fontWeight: 700, cursor: loading || !text.trim() ? 'default' : 'pointer', transition: 'background .15s, color .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loading ? <><span className="thinking"><i /><i /><i /></span>Extracting…</> : 'Extract Results'}
        </button>
      </div>
    </div>,
    document.body
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-block', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 5, padding: '1px 5px', color: '#ecedf2', verticalAlign: 'middle' }}>
      {children}
    </span>
  );
}

// ── Import preview ────────────────────────────────────────────────────────────

function ImportPreview({ result, onConfirm, onDiscard }: {
  result: ImportResult;
  onConfirm: (rows: MarkerInput[], date: string, src: string) => void;
  onDiscard: () => void;
}) {
  return (
    <div style={{ background: 'var(--ph)', border: '1px solid var(--card-bd)', borderRadius: 14, overflow: 'hidden', animation: 'cardIn .25s cubic-bezier(.22,.61,.36,1) both' }}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--n4)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--chip-bg)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: PAL.ok }}>✓ {result.markers.length} markers extracted</span>
        <span style={{ fontSize: 12, color: 'var(--faint)' }}>· {result.date} · {result.test_source}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn ghost" onClick={onDiscard} style={{ fontSize: 12, padding: '5px 10px' }}>Discard</button>
          <button className="btn" style={{ fontSize: 12, padding: '5px 14px' }}
            onClick={() => onConfirm(
              result.markers.map(m => ({ name: m.name, value: m.value != null ? String(m.value) : '', unit: m.unit ?? '', ref_low: m.reference_low != null ? String(m.reference_low) : '', ref_high: m.reference_high != null ? String(m.reference_high) : '' })),
              result.date, result.test_source,
            )}>
            Review & save →
          </button>
        </div>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto', padding: '2px 0' }}>
        {result.markers.map((m, i) => {
          const s = rangeStatus(m);
          const c = STATUS_COLOR[s];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', borderBottom: '1px solid var(--n4)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{m.name}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>
                {m.value ?? '—'}<span style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 400, marginLeft: 3 }}>{m.unit}</span>
              </span>
              {m.reference_low != null && (m.reference_high == null || m.reference_high < OPEN_HIGH) && (
                <span style={{ fontSize: 10, color: 'var(--faint)', minWidth: 68, textAlign: 'right', fontFamily: 'var(--mono)' }}>
                  {m.reference_low}–{m.reference_high}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BiomarkersSection({ groups, loading, onAdded }: Props) {
  const [view, setView]                 = useState<'list' | 'add'>('list');
  const [showImportModal, setShowImport] = useState(false);
  const [importPreview, setPreview]      = useState<ImportResult | null>(null);

  const [date, setDate]     = useState(homeDateStr());
  const [src, setSrc]       = useState('Rythm');
  const [rows, setRows]     = useState<MarkerInput[]>(
    RYTHM_MARKERS.slice(0, 8).map(m => ({ name: m.name, value: '', unit: m.unit, ref_low: String(m.ref_low), ref_high: String(m.ref_high) }))
  );
  const [saving, setSaving]   = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [activeDate, setActiveDate] = useState<string | null>(groups[0]?.date ?? null);
  const [exported, setExported]     = useState(false);

  useEffect(() => {
    if (!groups.length) return;
    if (!activeDate || !groups.some(g => g.date === activeDate)) {
      setActiveDate(groups[0].date);
    }
  }, [groups, activeDate]);

  const addRow    = () => setRows(r => [...r, { name: '', value: '', unit: '', ref_low: '', ref_high: '' }]);
  const removeRow = (i: number) => setRows(r => r.filter((_, j) => j !== i));
  const updateRow = (i: number, field: keyof MarkerInput, val: string) =>
    setRows(r => r.map((row, j) => j === i ? { ...row, [field]: val } : row));
  const addPreset = (preset: typeof RYTHM_MARKERS[0]) =>
    setRows(r => [...r, { name: preset.name, value: '', unit: preset.unit, ref_low: String(preset.ref_low), ref_high: String(preset.ref_high) }]);

  const applyImport = useCallback((importedRows: MarkerInput[], importDate: string, importSrc: string) => {
    setRows(importedRows);
    setDate(importDate);
    setSrc(importSrc);
    setPreview(null);
    setView('add');
  }, []);

  const save = useCallback(async () => {
    const markers = rows.filter(r => r.name && r.value).map(r => ({
      name: r.name, value: parseFloat(r.value), unit: r.unit,
      reference_low:  r.ref_low  ? parseFloat(r.ref_low)  : null,
      reference_high: r.ref_high ? parseFloat(r.ref_high) : null,
    }));
    if (!markers.length) { setSaveErr('Enter at least one value before saving'); return; }

    setSaving(true); setSaveErr('');
    try {
      const res = await fetch('/api/health/biomarkers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, test_source: src, markers }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json() as { error?: string }; msg = j.error ?? msg; } catch { /* */ }
        setSaveErr(msg); return;
      }
      setActiveDate(date);
      setView('list');
      setRows(RYTHM_MARKERS.slice(0, 8).map(m => ({ name: m.name, value: '', unit: m.unit, ref_low: String(m.ref_low), ref_high: String(m.ref_high) })));
      onAdded();
    } catch (e) {
      setSaveErr(`Network error: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [rows, date, src, onAdded]);

  return (
    <div className="card" style={{ gap: 16 }}>
      {/* ── Header ── */}
      <CardHead icon="biomarkers" title="Biomarkers" source="rythm">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {groups.length > 0 && (
            <button className="btn ghost" style={{ fontSize: 12, padding: '6px 10px' }}
              onClick={() => { navigator.clipboard?.writeText(exportText(groups)); setExported(true); setTimeout(() => setExported(false), 2000); }}>
              {exported ? '✓ Copied' : '↗ Export'}
            </button>
          )}
          <button className="btn ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setShowImport(true)}>
            Import from Rythm
          </button>
          <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => setView(v => v === 'add' ? 'list' : 'add')}>
            {view === 'add' ? 'Cancel' : '+ Manual entry'}
          </button>
        </div>
      </CardHead>

      {/* ── Portals ── */}
      {showImportModal && (
        <ImportModal onClose={() => setShowImport(false)} onImported={r => { setShowImport(false); setPreview(r); }} />
      )}
      {importPreview && (
        <ImportPreview result={importPreview} onConfirm={applyImport} onDiscard={() => setPreview(null)} />
      )}

      {/* ── Manual entry form ── */}
      {view === 'add' && (
        <div style={{ background: 'var(--ph)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="hs-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 140 }} />
            <select className="hs-input" value={src} onChange={e => setSrc(e.target.value)} style={{ width: 130 }}>
              <option>Rythm</option><option>Manual</option>
            </select>
            <span style={{ fontSize: 12, color: 'var(--faint)' }}>
              {rows.filter(r => r.value).length > 0 ? `${rows.filter(r => r.value).length} values filled` : 'Fill in your values below'}
            </span>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Quick add</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {RYTHM_MARKERS.map(m => (
                <button key={m.name} onClick={() => addPreset(m)} className="chip" style={{ cursor: 'pointer', fontSize: 11 }}>{m.name}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 6 }}>
            {['Marker', 'Value', 'Unit', 'Ref low', 'Ref high', ''].map(h => (
              <div key={h} style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.04em', padding: '0 2px' }}>{h}</div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 340, overflowY: 'auto' }}>
            {rows.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 6, alignItems: 'center' }}>
                <input className="hs-input" placeholder="Marker name" value={row.name} onChange={e => updateRow(i, 'name', e.target.value)} />
                <input className="hs-input" placeholder="Value" type="number" value={row.value} onChange={e => updateRow(i, 'value', e.target.value)} />
                <input className="hs-input" placeholder="Unit" value={row.unit} onChange={e => updateRow(i, 'unit', e.target.value)} />
                <input className="hs-input" placeholder="Low" type="number" value={row.ref_low} onChange={e => updateRow(i, 'ref_low', e.target.value)} />
                <input className="hs-input" placeholder="High" type="number" value={row.ref_high} onChange={e => updateRow(i, 'ref_high', e.target.value)} />
                <button className="hs-btn hs-delete" onClick={() => removeRow(i)}>×</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={addRow} style={{ fontSize: 12 }}>+ Row</button>
            <button className="btn" onClick={save} disabled={saving} style={{ fontSize: 12 }}>
              {saving ? '…' : `Save panel (${rows.filter(r => r.value).length} values)`}
            </button>
            {saveErr && <span style={{ fontSize: 12, color: 'var(--danger)', alignSelf: 'center' }}>{saveErr}</span>}
          </div>
        </div>
      )}

      {/* ── Dashboard content ── */}
      {loading ? (
        <Skel h={200} />
      ) : groups.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, opacity: .4 }}>🧬</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--n1)', marginBottom: 6 }}>No blood panels yet</div>
            <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.6, maxWidth: 360 }}>
              Import your Rythm results by opening your share link, pressing <Kbd>⌘A</Kbd> <Kbd>⌘C</Kbd>, and clicking <strong style={{ color: 'var(--n2)' }}>Import from Rythm</strong> above.
            </div>
          </div>
        </div>
      ) : (
        <Dashboard groups={groups} activeDate={activeDate} onDateChange={setActiveDate} />
      )}
    </div>
  );
}
