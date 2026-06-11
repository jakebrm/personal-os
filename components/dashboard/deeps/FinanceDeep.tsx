'use client';
import { useDashboard } from '../context';

export function FinanceDeep() {
  const { setTab } = useDashboard();
  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>
      <div className="deep-head">
        <div>
          <h1>Finance</h1>
          <div className="sub">MONARCH MONEY INTEGRATION · COMING SOON</div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 340,
        gap: 28,
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 64,
          lineHeight: 1,
          opacity: 0.18,
          userSelect: 'none',
        }}>◆</div>

        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
            Monarch Money integration coming soon
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--mut)', lineHeight: 1.65 }}>
            Net worth tracking, budget views, and transaction history will sync
            automatically once the Monarch API connection is set up.
            In the meantime, view your finances directly in Monarch Money.
          </div>
        </div>

        <a
          href="https://app.monarchmoney.com"
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
          style={{ fontSize: 14, padding: '11px 28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <span style={{ fontSize: 16 }}>◆</span>
          Open Monarch Money
        </a>

        <div style={{ fontSize: 11.5, color: 'var(--faint)' }}>
          Opens in a new tab · monarchmoney.com
        </div>
      </div>
    </div>
  );
}
