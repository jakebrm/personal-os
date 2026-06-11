'use client';
import Link          from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from './context';
import { useWeather }   from './WeatherContext';
import { useSettings }  from './SettingsContext';
import { WxIcon }       from './WxIcon';
import { LogoMark }     from './LogoMark';
import { timeBits }     from './helpers';

export const TABS: [string, string, string][] = [
  ['dashboard','▦','Dashboard'],['tasks','☑','Tasks'],['habits','◎','Habits'],
  ['health','♡','Health'],['training','↗','Training'],['notes','✎','Notes'],
  ['reading','▭','Reading'],['friends','❀','Friends'],['goals','◎','Goals'],
  ['worklog','▤','Work Log'],['crm','◆','CRM'],['brain','◈','Brain'],
  ['bookmarks','⚑','Bookmarks'],
];

export function TopRail() {
  const { tab, setTab }    = useDashboard();
  const { wx }             = useWeather();
  const { hiddenTabs }     = useSettings();
  const router             = useRouter();
  const [time, setTime]    = useState<ReturnType<typeof timeBits> | null>(null);

  useEffect(() => {
    setTime(timeBits());
    const id = setInterval(() => setTime(timeBits()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Dashboard is always shown; the rest can be hidden via Settings.
  const visibleTabs = TABS.filter(([id]) => id === 'dashboard' || !hiddenTabs.has(id));

  return (
    <div className="rail">
      <div className="profile">
        <div className="avatar avatar-logo" style={{ background: 'transparent', border: 'none' }}>
          <LogoMark size={38} radius={32} />
        </div>
        <div className="who">
          <b>{process.env.NEXT_PUBLIC_OWNER_NAME || 'Owner'}</b>
        </div>
      </div>

      <div className="tabs">
        {visibleTabs.map(([id, g, label]) => (
          <Link
            key={id}
            href={id === 'dashboard' ? '/dashboard' : `/dashboard/${id}`}
            className={`tab${tab === id ? ' on' : ''}`}
            style={{ textDecoration: 'none' }}
            // Also fire setTab for the instant animation trigger — URL sync
            // via usePathname() in context handles back/forward on its own.
            onClick={() => setTab(id)}
          >
            <span className="g">{g}</span>{label}
          </Link>
        ))}
      </div>

      {/* Mobile tab picker — hidden on desktop, full-width row on mobile */}
      <select
        className="mob-nav"
        value={tab}
        onChange={e => {
          const id = e.target.value;
          setTab(id);
          router.push(id === 'dashboard' ? '/dashboard' : `/dashboard/${id}`);
        }}
      >
        {visibleTabs.map(([id, g, label]) => (
          <option key={id} value={id}>{g}  {label}</option>
        ))}
        <option value="settings">⚙  Settings</option>
      </select>

      <div className="now">
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div className="clock">{time?.clock ?? '–'}<span className="ap">{time?.ap ?? ''}</span></div>
          <div className="date">{time?.date ?? ''}</div>
        </div>

        <Link
          href="/dashboard/weather"
          className="wx"
          style={{ textDecoration: 'none', cursor: 'pointer' }}
          onClick={() => setTab('weather')}
        >
          {wx ? (
            <>
              <WxIcon code={wx.code} size={18} />
              <div>
                <div className="wt">{wx.temp}°F</div>
                <div className="wc">{wx.desc.toLowerCase()}</div>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 18, opacity: .3 }}>○</span>
              <div>
                <div className="wt">–°F</div>
                <div className="wc">loading</div>
              </div>
            </>
          )}
        </Link>

        <button
          type="button"
          className="kbd-hint"
          title="Command palette (⌘K)"
          aria-label="Open command palette"
          onClick={() => window.dispatchEvent(new Event('os:kbar'))}
        >
          ⌘K
        </button>

        <Link
          href="/dashboard/settings"
          onClick={() => setTab('settings')}
          aria-label="Settings"
          title="Settings"
          className={`rail-gear${tab === 'settings' ? ' on' : ''}`}
          style={{ textDecoration: 'none' }}
        >
          ⚙
        </Link>
      </div>
    </div>
  );
}
