'use client';
import { useEffect, useRef, useState } from 'react';
import { DemoProvider }    from './DemoContext';
import { SettingsProvider } from './SettingsContext';
import { DashboardProvider, useDashboard } from './context';
import { HabitsProvider }  from './HabitsContext';
import { TasksProvider }   from './TasksContext';
import { WeatherProvider } from './WeatherContext';
import { ReadingProvider } from './ReadingContext';
import { GoalsProvider }   from './GoalsContext';
import { TopRail }         from './TopRail';
import { DashboardView }   from './DashboardView';
import { AgendaDeep }      from './deeps/AgendaDeep';
import { TasksDeep }       from './deeps/TasksDeep';
import { NotesDeep }       from './deeps/NotesDeep';
import { FinanceDeep }     from './deeps/FinanceDeep';
import { HabitsDeep }      from './deeps/HabitsDeep';
import { HealthDeep }      from './deeps/HealthDeep';
import { TrainingDeep }    from './deeps/TrainingDeep';
import { FriendsDeep }     from './deeps/FriendsDeep';
import { GoalsDeep }       from './deeps/GoalsDeep';
import { ReadingDeep }     from './deeps/ReadingDeep';
import { StatsDeep }       from './deeps/StatsDeep';
import { WeatherDeep }     from './deeps/WeatherDeep';
import { NowPlayingDeep }  from './deeps/NowPlayingDeep';
import { BrainDeep }       from './deeps/BrainDeep';
import { WorkLogDeep }     from './deeps/WorkLogDeep';
import { SettingsDeep }    from './deeps/SettingsDeep';
import { CrmDeep }         from './deeps/CrmDeep';
import { BookmarksDeep }   from './deeps/BookmarksDeep';
import { CommandPalette }  from './CommandPalette';

const NAV_ORDER = ['dashboard','agenda','tasks','habits','health','training','finance','notes','reading','friends','goals','worklog','crm','bookmarks','stats','weather','nowplaying','brain','settings'];

const DEEP_VIEWS: Record<string, React.ComponentType> = {
  agenda: AgendaDeep, tasks: TasksDeep, notes: NotesDeep,
  finance: FinanceDeep, habits: HabitsDeep, health: HealthDeep,
  training: TrainingDeep,
  friends: FriendsDeep, goals: GoalsDeep, reading: ReadingDeep,
  stats: StatsDeep, weather: WeatherDeep, nowplaying: NowPlayingDeep,
  brain: BrainDeep, worklog: WorkLogDeep, crm: CrmDeep, settings: SettingsDeep,
  bookmarks: BookmarksDeep,
};

function ShellInner() {
  const { tab } = useDashboard();
  const stageRef = useRef<HTMLElement>(null);
  const prevIdx  = useRef(0);
  // Visited tabs stay mounted (hidden) so switching back is instant — no refetch,
  // no lost state. `seen` tabs skip the entrance animation on re-show.
  const [panes, setPanes] = useState<string[]>(() => [tab]);
  const seen    = useRef(new Set<string>());
  const prevTab = useRef(tab);

  if (!panes.includes(tab)) setPanes(p => p.includes(tab) ? p : [...p, tab]);

  useEffect(() => {
    if (prevTab.current !== tab) {
      seen.current.add(prevTab.current);
      prevTab.current = tab;
    }

    const idx = NAV_ORDER.indexOf(tab);
    const dir = idx >= prevIdx.current ? '22px' : '-22px';
    stageRef.current?.style.setProperty('--ex', dir);
    prevIdx.current = idx >= 0 ? idx : 0;

    if (typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion:reduce)').matches) {
      stageRef.current
        ?.querySelectorAll<HTMLElement>('.tabpane-active :is(.cmd-hero,.deep-head,.card)')
        .forEach((el, i) => {
          el.style.setProperty('--d', (Math.min(i, 12) * 0.022).toFixed(3) + 's');
        });
    }
  }, [tab]);

  // Pointer spotlight — cards read --mx/--my in their ::after glow.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const card = (e.target as Element | null)?.closest?.('.card');
      if (!(card instanceof HTMLElement)) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => document.removeEventListener('pointermove', onMove);
  }, []);

  // Time-of-day ambience — dashboard.css keys --hue off this attribute.
  useEffect(() => {
    const set = () => {
      const h = new Date().getHours();
      document.documentElement.dataset.daypart =
        h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'dusk' : 'night';
    };
    set();
    const id = setInterval(set, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* SVG grain filter — referenced by .noise */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency={0.65} numOctaves={3} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>

      <div className="stage-bg"><i /><b className="slash" /></div>
      <div className="noise" />

      <div className="wrap">
        <main className="stage" ref={stageRef}>
          <TopRail />
          {panes.map(t => {
            const Deep   = DEEP_VIEWS[t];
            const active = t === tab;
            return (
              <div
                key={t}
                className={active ? 'tabpane tabpane-active' : 'tabpane'}
                data-seen={seen.current.has(t) ? '' : undefined}
                style={active ? undefined : { display: 'none' }}
              >
                {Deep ? <Deep /> : <DashboardView />}
              </div>
            );
          })}
        </main>
      </div>

      <CommandPalette />
    </>
  );
}

export function Shell() {
  return (
    <DemoProvider>
      <SettingsProvider>
        <DashboardProvider>
          <WeatherProvider>
            <HabitsProvider>
              <TasksProvider>
                <ReadingProvider>
                  <GoalsProvider>
                    <ShellInner />
                  </GoalsProvider>
                </ReadingProvider>
              </TasksProvider>
            </HabitsProvider>
          </WeatherProvider>
        </DashboardProvider>
      </SettingsProvider>
    </DemoProvider>
  );
}
