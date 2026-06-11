'use client';
import React from 'react';
import { wxIconType, type WxIconType } from '@/lib/weather';

const COMMON = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function SunSvg({ s }: { s: number }) {
  const w = 1.4 * (s / 20);
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" {...COMMON} strokeWidth={w}>
      <circle cx="10" cy="10" r="3.3" />
      <line x1="10" y1="1.5" x2="10" y2="3.8" />
      <line x1="10" y1="16.2" x2="10" y2="18.5" />
      <line x1="1.5" y1="10" x2="3.8" y2="10" />
      <line x1="16.2" y1="10" x2="18.5" y2="10" />
      <line x1="3.9" y1="3.9" x2="5.6" y2="5.6" />
      <line x1="14.4" y1="14.4" x2="16.1" y2="16.1" />
      <line x1="16.1" y1="3.9" x2="14.4" y2="5.6" />
      <line x1="5.6" y1="14.4" x2="3.9" y2="16.1" />
    </svg>
  );
}

function PartlySvg({ s }: { s: number }) {
  const w = 1.4 * (s / 20);
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" {...COMMON} strokeWidth={w}>
      {/* Small sun top-right */}
      <circle cx="13.5" cy="6.5" r="2.2" />
      <line x1="13.5" y1="2.2" x2="13.5" y2="3.4" />
      <line x1="17.8" y1="6.5" x2="16.6" y2="6.5" />
      <line x1="16.2" y1="3.8" x2="15.3" y2="4.7" />
      {/* Cloud lower-left */}
      <path d="M2.5 15.5 Q2.5 12.5 5.5 12.5 Q6 10 9 10.5 Q11.5 8 14 10.8 Q16.5 10.8 16.5 13.2 Q16.5 15.5 13.5 15.5 Z" />
    </svg>
  );
}

function CloudSvg({ s }: { s: number }) {
  const w = 1.4 * (s / 20);
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" {...COMMON} strokeWidth={w}>
      <path d="M3 14.5 Q3 11 6 11 Q6.5 8.5 9.5 9 Q12 6.5 15 9.5 Q17.5 9.5 17.5 12 Q17.5 14.5 14.5 14.5 Z" />
    </svg>
  );
}

function FogSvg({ s }: { s: number }) {
  const w = 1.4 * (s / 20);
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" {...COMMON} strokeWidth={w}>
      <line x1="2" y1="7"  x2="18" y2="7" />
      <line x1="2" y1="11" x2="18" y2="11" />
      <line x1="4" y1="15" x2="16" y2="15" />
    </svg>
  );
}

function RainSvg({ s }: { s: number }) {
  const w = 1.4 * (s / 20);
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" {...COMMON} strokeWidth={w}>
      <path d="M3 10.5 Q3 7 6 7 Q6.5 4.5 9.5 5 Q12 3 14.5 5.5 Q17 5.5 17 8 Q17 10.5 14 10.5 Z" />
      <line x1="6"  y1="13" x2="5"  y2="16.5" />
      <line x1="10" y1="13" x2="9"  y2="16.5" />
      <line x1="14" y1="13" x2="13" y2="16.5" />
    </svg>
  );
}

function SnowSvg({ s }: { s: number }) {
  const w = 1.4 * (s / 20);
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" {...COMMON} strokeWidth={w}>
      <path d="M3 9 Q3 6 6 6 Q6.5 3.5 9.5 4 Q12 2 14.5 4.5 Q17 4.5 17 7 Q17 9 14 9 Z" />
      {/* Snowflake */}
      <line x1="10" y1="11.5" x2="10" y2="18.5" />
      <line x1="7.1" y1="13"   x2="12.9" y2="16" />
      <line x1="12.9" y1="13"  x2="7.1"  y2="16" />
      <line x1="8.4"  y1="11.5" x2="7"   y2="13" />
      <line x1="11.6" y1="11.5" x2="13"  y2="13" />
      <line x1="8.4"  y1="18.5" x2="7"   y2="17" />
      <line x1="11.6" y1="18.5" x2="13"  y2="17" />
    </svg>
  );
}

function StormSvg({ s }: { s: number }) {
  const w = 1.4 * (s / 20);
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" {...COMMON} strokeWidth={w}>
      <path d="M3 10 Q3 7 6 7 Q6.5 4.5 9.5 5 Q12 3 14.5 5.5 Q17 5.5 17 8 Q17 10 14 10 Z" />
      <polyline points="11,11.5 8.5,15.5 11.5,15.5 9,19" strokeWidth={w * 1.1} />
    </svg>
  );
}

const RENDERERS: Record<WxIconType, (s: number) => React.ReactElement> = {
  sun:    s => <SunSvg s={s} />,
  partly: s => <PartlySvg s={s} />,
  cloud:  s => <CloudSvg s={s} />,
  fog:    s => <FogSvg s={s} />,
  rain:   s => <RainSvg s={s} />,
  snow:   s => <SnowSvg s={s} />,
  storm:  s => <StormSvg s={s} />,
};

export function WxIcon({
  code,
  size = 20,
  style,
}: {
  code: number;
  size?: number;
  style?: React.CSSProperties;
}) {
  const type = wxIconType(code);
  const el = RENDERERS[type](size);
  if (!style) return el;
  return <span style={{ display: 'inline-flex', ...style }}>{el}</span>;
}
