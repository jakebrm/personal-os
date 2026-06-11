export const DAYS   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function timeBits() {
  const d = new Date(), h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
  const ap = h < 12 ? 'AM' : 'PM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  const greet = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Winding down';
  return { clock: `${h12}:${m}`, ap, greet, date: `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}` };
}

export function Ring({ pct, val, lbl }: { pct: number; val: string; lbl: string }) {
  const r = 24, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return (
    <div className="ring">
      <svg viewBox="0 0 58 58">
        <circle className="track" cx="29" cy="29" r={r} />
        <circle className="fill" cx="29" cy="29" r={r}
          strokeDasharray={c.toFixed(1)} strokeDashoffset={off.toFixed(1)} />
      </svg>
      <div className="rv">{val}</div>
      <div className="rl">{lbl}</div>
    </div>
  );
}

export function Ph({ cap, h = 70 }: { cap: string; h?: number }) {
  return (
    <div className="ph" style={{ minHeight: h }}>
      <span className="cap">{cap}</span>
    </div>
  );
}

export function Sparkline({ data, h = 36 }: { data: number[]; h?: number }) {
  const w = 200, max = Math.max(...data), min = Math.min(...data), rng = (max - min) || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1) * (w - 6) + 3).toFixed(1)},${((1 - (v - min) / rng) * (h - 8) + 4).toFixed(1)}`
  ).join(' ');
  const last = pts.split(' ').pop()!.split(',');
  return (
    <svg viewBox={`0 0 ${w} ${h}`}
      style={{ width: '100%', height: h, display: 'block', overflow: 'visible' }}
      preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--accent)"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <circle cx={last[0]} cy={last[1]} r="3" fill="var(--accent)" />
    </svg>
  );
}

export function classifyCmd(text: string): [string, string, string] {
  const s = ' ' + text.toLowerCase() + ' ';
  if (/(call|text|catch up|reach out|ping|miss|check in)/.test(s)) return ['friends', '❀', 'Friends'];
  if (/(ate|eat|protein|calor| cal |macro|carb|meal|breakfast|lunch|dinner|snack|workout|ran |run |bike|swim|gym|lift|water)/.test(s)) return ['health', '♡', 'Health'];
  if (/(read|article|book|chapter|essay|paper|podcast)/.test(s)) return ['reading', '▭', 'Reading'];
  if (/(todo|task|buy|finish|pay|book|remind|schedule|fix|send|draft|email)/.test(s)) return ['tasks', '☑', 'Tasks'];
  return ['notes', '✎', 'Notes'];
}
