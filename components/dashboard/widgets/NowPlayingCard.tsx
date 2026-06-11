'use client';
import { Panel } from '../Panel';

export function NowPlayingCard({ delay }: { delay?: number }) {
  return (
    <Panel className="nowplaying" deepTab="nowplaying" delay={delay}>
      <div className="np">
        <div className="art">
          <span className="eq"><span /><span /><span /><span /></span>
        </div>
        <div className="npmeta">
          <div className="npt">Weightless</div>
          <div className="npa">Marconi Union · spotify</div>
        </div>
        <div className="npctl"><span>⏮</span><span>⏸</span><span>⏭</span></div>
      </div>
      <div className="npprog"><i style={{ width: '38%' }} /></div>
    </Panel>
  );
}
