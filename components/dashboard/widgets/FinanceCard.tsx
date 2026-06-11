'use client';
import { Panel } from '../Panel';
import { Sparkline } from '../helpers';

export function FinanceCard({ delay }: { delay?: number }) {
  return (
    <Panel glyph="◆" title="Finance" meta={<span className="pill">net worth</span>} deepTab="finance" delay={delay}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div className="nw">$182.4k</div>
        <div className="delta up">▲ 1.2% mo</div>
      </div>
      <Sparkline data={[162,165,168,170,172,175,176,179,182]} h={30} />
      <div className="bgt warn">
        <div className="bl"><span>May budget</span><span className="bv">$1,840 / $2,500</span></div>
        <div className="bbar"><i style={{ width: '74%' }} /></div>
      </div>
      <div className="chips">
        <span className="chip">cash $12.1k</span>
        <span className="chip">invest $164k</span>
      </div>
    </Panel>
  );
}
