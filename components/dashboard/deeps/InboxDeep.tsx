'use client';
import { Panel } from '../Panel';
import { useDashboard } from '../context';
import { Ph } from '../helpers';

function Msg({ ini, from, preview, time, unread }: { ini: string; from: string; preview: string; time: string; unread?: boolean }) {
  return (
    <div className="row">
      <div className="rg" style={unread ? { background: 'var(--accent-soft)', borderColor: 'color-mix(in oklch,var(--accent),transparent 70%)' } : undefined}>
        <span style={unread ? { color: 'var(--accent)' } : undefined}>{ini}</span>
      </div>
      <div className="rb">
        <div className="rt" style={unread ? { fontWeight: 700 } : undefined}>{from}</div>
        <div className="rmeta">{preview}</div>
      </div>
      <div className="raside">{unread && <span className="dot" />} {time}</div>
    </div>
  );
}

export function InboxDeep() {
  const { setTab } = useDashboard();
  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>
      <div className="deep-head">
        <div><h1>Inbox</h1><div className="sub">3 UNREAD · EMAIL + MESSAGES</div></div>
        <div className="actions">
          <button className="btn ghost">mark all read</button>
          <button className="btn ghost">compose</button>
        </div>
      </div>
      <div className="scaffold">
        <aside className="card" style={{ gap: 5 }}>
          <div className="snav on"><span className="g">◇</span>All<span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>3</span></div>
          <div className="snav"><span className="g">✉</span>Email<span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mut)' }}>2</span></div>
          <div className="snav"><span className="g">◈</span>Messages<span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mut)' }}>1</span></div>
          <div className="sdiv" />
          <div className="snav"><span className="g">★</span>Flagged</div>
          <div className="snav"><span className="g">◒</span>Sent</div>
        </aside>
        <div className="two-col">
          <div className="stack">
            <Panel glyph="◇" title="Messages">
              <div className="rows">
                <Msg ini="PK" from="Priya Kapoor"       preview="Re: roadmap — can we push the…" time="9:02 AM" unread />
                <Msg ini="JL" from="Jordan (iMessage)"  preview="see you saturday?"              time="yest"   unread />
                <Msg ini="@"  from="Newsletter · Calm Tech" preview="This week in calm technology…" time="8:14 AM" />
                <Msg ini="DT" from="Devon T."           preview="thanks for the rec!"            time="Mon" />
                <Msg ini="SR" from="Sana R."            preview="are you free this weekend?"     time="Sun" />
              </div>
            </Panel>
          </div>
          <div className="stack">
            <Panel glyph="PK" title="Priya Kapoor" meta="9:02 AM · email">
              <div className="rmeta" style={{ marginBottom: 8 }}>Re: roadmap — can we push the…</div>
              <Ph cap="message body" h={200} />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
