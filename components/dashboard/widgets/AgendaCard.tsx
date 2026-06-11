'use client';
import { Panel } from '../Panel';

export function AgendaCard({ delay }: { delay?: number }) {
  return (
    <Panel glyph="◷" title="Today" meta={<span className="pill">4 events</span>} deepTab="agenda" delay={delay}>
      <div className="timeline">
        <div className="tev">
          <div className="tm">9:00 AM</div><div className="tbar" />
          <div className="tc"><div className="tt">Standup</div><div className="td">Video · 15 min</div></div>
        </div>
        <div className="tev">
          <div className="tm">11:30 AM</div><div className="tbar" />
          <div className="tc"><div className="tt">Design review</div><div className="td">Studio B · 4 people</div></div>
        </div>
        <div className="tev ghost">
          <div className="tm">2:00 PM</div><div className="tbar" />
          <div className="tc"><div className="tt">Focus block</div><div className="td">Personal OS · 90 min</div></div>
        </div>
      </div>
      <div className="chips"><span className="chip">⟲ google calendar</span></div>
    </Panel>
  );
}
