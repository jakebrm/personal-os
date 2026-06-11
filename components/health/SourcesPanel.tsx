'use client';
import type { WellnessRow, StravaRow, NutritionLog, BiomarkerGroup } from './useHealthData';
import { CardHead } from './shared';

type Props = {
  wellness:         WellnessRow[];
  activities:       StravaRow[];
  nutrition:        NutritionLog[];
  biomarkers:       BiomarkerGroup[];
  wLoading:         boolean;
  aLoading:         boolean;
  stravaError:      string | null;
  stravaNeedsAuth:  boolean;
  onSyncStrava:     () => void;
  onSyncGarmin:     () => void;
};

function SourceRow({ icon, name, status, meta, action }: {
  icon: string; name: string; status: 'ok' | 'warn' | 'off'; meta: string; action?: React.ReactNode;
}) {
  return (
    <div className="row">
      <div className="rg">{icon}</div>
      <div className="rb">
        <div className="rt">{name}</div>
        <div className="rmeta">{meta}</div>
      </div>
      <div className="raside" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {action}
        <span className={`dot ${status === 'ok' ? 'ok' : status === 'warn' ? 'warn' : 'faint'}`} />
      </div>
    </div>
  );
}

export function SourcesPanel({
  wellness, activities, nutrition, biomarkers,
  wLoading, aLoading, stravaError, stravaNeedsAuth,
  onSyncStrava, onSyncGarmin,
}: Props) {
  const lastWellness  = wellness[wellness.length - 1]?.date;
  const lastActivity  = activities[0]?.date;
  const lastNutrition = nutrition[nutrition.length - 1]?.date;
  const lastBlood     = biomarkers[0]?.date;

  const syncBtn = (label: string, onClick: () => void, loading: boolean) => (
    <button className="btn ghost" onClick={onClick} disabled={loading}
      style={{ fontSize: 11, padding: '4px 9px', borderRadius: 9 }}>
      {loading ? '…' : label}
    </button>
  );

  const stravaConnectBtn = (
    <a href="/api/health/strava/connect"
      className="btn"
      style={{ fontSize: 11, padding: '4px 12px', borderRadius: 9, textDecoration: 'none' }}>
      Connect →
    </a>
  );

  const stravaMeta = stravaNeedsAuth
    ? 'Authorization expired — click Connect to re-authorize with Strava'
    : stravaError
    ? `Error: ${stravaError}`
    : lastActivity
    ? `Last activity: ${lastActivity}`
    : 'Not connected — add STRAVA_ env vars';

  return (
    <div className="card" style={{ gap: 14 }}>
      <CardHead icon="sources" title="Sources" />
      <div className="rows">
        <SourceRow icon="↗" name="Strava"
          status={stravaNeedsAuth ? 'warn' : lastActivity ? 'ok' : 'warn'}
          meta={stravaMeta}
          action={stravaNeedsAuth
            ? stravaConnectBtn
            : syncBtn('↻ Sync', onSyncStrava, aLoading)}
        />
        <SourceRow icon="◔" name="Intervals.icu (Garmin)"
          status={lastWellness ? 'ok' : 'warn'}
          meta={lastWellness
            ? `Last wellness: ${lastWellness} · HRV / RHR / sleep / VO₂`
            : 'Not connected — add INTERVALS_ env vars'}
          action={syncBtn('↻ Sync', onSyncGarmin, wLoading)}
        />
        <SourceRow icon="▦" name="Apple Health"
          status="ok"
          meta="Health Auto Export app → POST /api/health/apple-export (auto: MacroFactor nutrition, scale weigh-ins) · bulk history via /api/health/apple-import"
        />
        <SourceRow icon="⚖" name="Starfit"
          status="warn"
          meta="Webhook ready at POST /api/health/starfit-webhook — waiting for Starfit API access"
        />
        <SourceRow icon="◈" name="Rythm"
          status={lastBlood ? 'ok' : 'off'}
          meta={lastBlood ? `Last panel: ${lastBlood}` : 'Log panels manually in Biomarkers section'}
        />
        <SourceRow icon="◐" name="MacroFactor"
          status={lastNutrition ? 'ok' : 'off'}
          meta={lastNutrition ? `Last entry: ${lastNutrition} · flows automatically via Apple Health export` : 'Flows automatically via Apple Health export once Health Auto Export is set up'}
        />
      </div>

      <div style={{
        background: 'var(--ph)', border: '1px solid var(--ph-bd)',
        borderRadius: 12, padding: '12px 14px',
        fontSize: 12, color: 'var(--faint)', lineHeight: 1.6,
      }}>
        <span style={{ fontWeight: 600, color: 'var(--mut)' }}>Body Battery & Stress</span>
        {' — '}not available via Intervals.icu. These require a direct Garmin Connect sync.
        HRV, sleep, and CTL/ATL are available through Intervals.icu.
      </div>

      <div style={{ fontSize: 12, color: 'var(--faint)', paddingTop: 8, borderTop: '1px solid var(--n4)', lineHeight: 1.6 }}>
        Data blending: Apple Health covers history before May 17 2026 · Garmin/Intervals.icu + Strava after.
        {stravaNeedsAuth && (
          <span style={{ color: 'var(--warn)', display: 'block', marginTop: 4 }}>
            ⚠ Strava needs re-authorization. Strava rotates refresh tokens — visit{' '}
            <a href="/api/health/strava/connect" style={{ color: 'var(--accent)' }}>/api/health/strava/connect</a>{' '}
            to get a fresh token (will auto-save).
          </span>
        )}
      </div>
    </div>
  );
}
