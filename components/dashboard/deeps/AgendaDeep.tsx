'use client';
import { Panel } from '../Panel';
import { useDashboard } from '../context';

function Ev({ tm, tt, td, ghost }: { tm: string; tt: string; td: string; ghost?: boolean }) {
  return (
    <div className={`tev${ghost ? ' ghost' : ''}`}>
      <div className="tm">{tm}</div><div className="tbar" />
      <div className="tc"><div className="tt">{tt}</div><div className="td">{td}</div></div>
    </div>
  );
}

export function AgendaDeep() {
  const { setTab } = useDashboard();
  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>
      <div className="deep-head">
        <div><h1>Today</h1><div className="sub">WEDNESDAY · MAY 31 · 4 EVENTS · SYNCED: GOOGLE CALENDAR</div></div>
        <div className="actions">
          <button className="btn ghost">← prev</button>
          <button className="btn ghost">next →</button>
          <button className="btn">+ event</button>
        </div>
      </div>
      <div className="two-col">
        <div className="stack">
          <Panel glyph="◷" title="Schedule" meta={<span className="pill">4 events</span>}>
            <div className="timeline">
              <Ev tm="7:00 AM" tt="Morning run" td="Strava · logged · 6.4 km" ghost />
              <Ev tm="9:00 AM" tt="Standup" td="Video call · 15 min" />
              <Ev tm="11:30 AM" tt="Design review" td="Studio B · 4 people · 90 min" />
              <Ev tm="2:00 PM" tt="Focus block — Personal OS" td="Deep work · no meetings · 90 min" ghost />
              <Ev tm="6:30 PM" tt="Call Mom" td="Keep-in-touch reminder" ghost />
            </div>
          </Panel>
          <Panel glyph="▦" title="Upcoming this week">
            <div className="rows">
              <div className="row"><div className="rg">◷</div><div className="rb"><div className="rt">Thu — Team offsite</div><div className="rmeta">all day</div></div></div>
              <div className="row"><div className="rg">↗</div><div className="rb"><div className="rt">Sat — Long run · 16 km</div><div className="rmeta">8:00 AM</div></div></div>
              <div className="row"><div className="rg">◷</div><div className="rb"><div className="rt">Sun — Brunch with Jordan</div><div className="rmeta">10:30 AM</div></div></div>
            </div>
          </Panel>
        </div>
        <div className="stack">
          <Panel glyph="◈" title="Day at a glance">
            <div className="statgrid">
              <div className="stat"><div className="n">4</div><div className="l">events</div></div>
              <div className="stat"><div className="n">3h</div><div className="l">meetings</div></div>
              <div className="stat"><div className="n">1.5h</div><div className="l">focus</div></div>
              <div className="stat"><div className="n">2</div><div className="l">reminders</div></div>
            </div>
          </Panel>
          <Panel glyph="◇" title="Free time today">
            <div className="chips"><span className="chip acc">2h 30m open</span></div>
            <div className="ph" style={{ minHeight: 90 }}><span className="cap">free time visualizer</span></div>
          </Panel>
          <Panel glyph="⟲" title="Sources">
            <div className="rows">
              <div className="row"><div className="rg">▦</div><div className="rb"><div className="rt">Google Calendar</div><div className="rmeta">last sync: 3 min ago</div></div><div className="raside"><span className="dot ok" />on</div></div>
              <div className="row"><div className="rg">❀</div><div className="rb"><div className="rt">Friends reminders</div><div className="rmeta">keep-in-touch</div></div><div className="raside"><span className="dot ok" />on</div></div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
