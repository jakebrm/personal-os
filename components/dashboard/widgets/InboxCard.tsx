'use client';
import { Panel } from '../Panel';

export function InboxCard({ delay }: { delay?: number }) {
  return (
    <Panel glyph="◇" title="Inbox" meta={<span className="pill">3 new</span>} deepTab="inbox" delay={delay}>
      <div className="rows">
        <div className="row">
          <div className="rg">PK</div>
          <div className="rb"><div className="rt">Priya Kapoor</div><div className="rmeta">Re: roadmap — can we…</div></div>
          <div className="raside"><span className="dot" />9:02</div>
        </div>
        <div className="row">
          <div className="rg">@</div>
          <div className="rb"><div className="rt">Newsletter · Calm Tech</div><div className="rmeta">This week in…</div></div>
          <div className="raside">8:14</div>
        </div>
        <div className="row">
          <div className="rg">JL</div>
          <div className="rb"><div className="rt">Jordan (msg)</div><div className="rmeta">see you sat?</div></div>
          <div className="raside"><span className="dot" />yest</div>
        </div>
      </div>
    </Panel>
  );
}
