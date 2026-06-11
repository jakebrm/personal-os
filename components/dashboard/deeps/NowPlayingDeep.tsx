'use client';
import { Panel } from '../Panel';
import { useDashboard } from '../context';
import { Sparkline } from '../helpers';

export function NowPlayingDeep() {
  const { setTab } = useDashboard();
  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>
      <div className="deep-head">
        <div><h1>Now Playing</h1><div className="sub">SPOTIFY · CONNECTED</div></div>
        <div className="actions"><span className="chip acc">● playing</span></div>
      </div>
      <div className="two-col">
        <div className="stack">
          <Panel className="nowplaying">
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div className="art" style={{ width: 90, height: 90, borderRadius: 16 }}>
                <span className="eq"><span /><span /><span /><span /></span>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Weightless</div>
                <div className="rmeta" style={{ marginTop: 5 }}>Marconi Union</div>
                <div className="chips" style={{ marginTop: 10 }}>
                  <span className="chip">Ambient · Chillout</span>
                </div>
              </div>
            </div>
            <div className="npprog" style={{ height: 6, marginTop: 16 }}><i style={{ width: '38%' }} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mut)', marginTop: 4 }}>
              <span>3:47</span><span>8:09</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 22, color: 'var(--mut)', marginTop: 6 }}>
              <span style={{ cursor: 'pointer' }}>⏮</span>
              <span style={{ cursor: 'pointer', color: 'var(--text)' }}>⏸</span>
              <span style={{ cursor: 'pointer' }}>⏭</span>
            </div>
          </Panel>
          <Panel glyph="◎" title="Up next">
            <div className="rows">
              <div className="row"><div className="rg">▷</div><div className="rb"><div className="rt">Gymnopédie No.1</div><div className="rmeta">Erik Satie · 3:04</div></div></div>
              <div className="row"><div className="rg">▷</div><div className="rb"><div className="rt">Clair de Lune</div><div className="rmeta">Claude Debussy · 4:56</div></div></div>
              <div className="row"><div className="rg">▷</div><div className="rb"><div className="rt">On the Nature of Daylight</div><div className="rmeta">Max Richter · 6:02</div></div></div>
            </div>
          </Panel>
        </div>
        <div className="stack">
          <Panel glyph="★" title="Recent plays">
            <div className="rows">
              <div className="row"><div className="rg">▭</div><div className="rb"><div className="rt">Calm Focus · playlist</div><div className="rmeta">12 tracks · 48 min</div></div><div className="raside">today</div></div>
              <div className="row"><div className="rg">▭</div><div className="rb"><div className="rt">Morning Run · playlist</div><div className="rmeta">18 tracks · 52 min</div></div><div className="raside">today</div></div>
              <div className="row"><div className="rg">▭</div><div className="rb"><div className="rt">Study / Deep Work</div><div className="rmeta">24 tracks · 1h 40m</div></div><div className="raside">yest</div></div>
            </div>
          </Panel>
          <Panel glyph="◈" title="Listening stats">
            <div className="statgrid">
              <div className="stat"><div className="n">2.4h</div><div className="l">today</div></div>
              <div className="stat"><div className="n">14h</div><div className="l">this week</div></div>
            </div>
            <Sparkline data={[1.2,3,2,1.8,2.4,1,2.4]} h={28} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
