'use client';
import type { CSSProperties } from 'react';
import { useDashboard } from './context';

type Props = {
  glyph?: React.ReactNode;
  title?: string;
  meta?: React.ReactNode;
  className?: string;
  deepTab?: string;
  delay?: number;
  /** Left-edge accent color (--card-accent). Defaults to var(--accent). */
  accent?: string;
  children: React.ReactNode;
};

export function Panel({ glyph, title, meta, className = '', deepTab, delay, accent, children }: Props) {
  const { setTab } = useDashboard();
  const style = (delay != null || accent)
    ? ({
        ...(delay != null ? { '--d': `${delay.toFixed(3)}s` } : {}),
        ...(accent ? { '--card-accent': accent } : {}),
      } as CSSProperties)
    : undefined;

  return (
    <section
      className={`card${className ? ' ' + className : ''}`}
      data-deeptab={deepTab || undefined}
      style={style}
      onClick={deepTab ? () => setTab(deepTab) : undefined}
    >
      {title && (
        <div className="chead">
          {glyph && <div className="glyph">{glyph}</div>}
          <div className="ctitle">{title}</div>
          {meta && <div className="cmeta">{meta}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
