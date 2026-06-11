'use client';
import { Panel } from '../Panel';

export function NotesCard({ delay }: { delay?: number }) {
  return (
    <Panel glyph="✎" title="Notes" meta="⌘N" deepTab="notes" delay={delay}>
      <div className="capture">
        <span className="cur" />
        <span className="pl">jot anything…</span>
      </div>
      <div className="rows">
        <div className="row">
          <div className="rg">▤</div>
          <div className="rb"><div className="rt">Gift idea for Dad — vinyl</div><div className="rmeta">2h ago</div></div>
        </div>
        <div className="row">
          <div className="rg">▤</div>
          <div className="rb"><div className="rt">Recipe: lemon orzo</div><div className="rmeta">yesterday</div></div>
        </div>
      </div>
    </Panel>
  );
}
