import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type CaptureKind =
  | 'task' | 'note' | 'health' | 'finance'
  | 'friends' | 'reading' | 'habit' | 'agenda';

export type Urgency = 'today' | 'this_week' | 'this_month' | 'someday' | 'key';

export interface Classification {
  kind: CaptureKind;
  urgency: Urgency;
  title: string;
  summary: string;
  method: 'anthropic' | 'openai' | 'regex';
}

const KINDS: CaptureKind[] = ['task','note','health','finance','friends','reading','habit','agenda'];
const URGENCIES: Urgency[]  = ['today','this_week','this_month','someday','key'];

const SYSTEM = `You classify personal life captures into a structured format.

kind:
- task     — actionable to-do item (buy, call, finish, send, book, fix, pay)
- note     — idea, thought, observation, reminder to self
- health   — exercise, food, nutrition, sleep, vitals, wellness
- finance  — spending, income, budget, investments, debt
- friends  — people to contact, social plans, relationship notes
- reading  — books, articles, podcasts, essays to read/listen
- habit    — recurring behaviors to log or track (water, vitamins, steps)
- agenda   — calendar events, meetings, appointments, time-boxed plans

urgency:
- today      — mentions today/tonight/ASAP/urgent/right now
- this_week  — this week, tomorrow, next few days
- this_month — this month, next week, end of month
- key        — important/critical/must-do/priority, no explicit time
- someday    — default; no time pressure mentioned`.trim();

const TOOL_SCHEMA = {
  name: 'classify',
  description: 'Classify a personal capture',
  input_schema: {
    type: 'object' as const,
    properties: {
      kind:    { type: 'string', enum: KINDS },
      urgency: { type: 'string', enum: URGENCIES },
      title:   { type: 'string', description: 'Concise title, max 60 chars' },
      summary: { type: 'string', description: 'One-sentence summary' },
    },
    required: ['kind', 'urgency', 'title', 'summary'],
  },
} satisfies Anthropic.Tool;

// ── Anthropic (primary) ──────────────────────────────────────────────────────

async function tryAnthropic(text: string): Promise<Classification> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: SYSTEM,
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'classify' },
    messages: [{ role: 'user', content: text }],
  });

  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!block) throw new Error('No tool_use block in Anthropic response');

  const inp = block.input as { kind: CaptureKind; urgency: Urgency; title: string; summary: string };
  if (!KINDS.includes(inp.kind) || !URGENCIES.includes(inp.urgency)) {
    throw new Error('Invalid enum value in Anthropic output');
  }
  return { kind: inp.kind, urgency: inp.urgency, title: inp.title, summary: inp.summary, method: 'anthropic' };
}

// ── OpenAI (fallback) ────────────────────────────────────────────────────────

async function tryOpenAI(text: string): Promise<Classification> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 256,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM + '\n\nReply with JSON only: {"kind":"...","urgency":"...","title":"...","summary":"..."}' },
      { role: 'user', content: text },
    ],
  });

  const raw = res.choices[0]?.message?.content ?? '{}';
  const p = JSON.parse(raw) as Record<string, string>;

  const kind:    CaptureKind = KINDS.includes(p.kind as CaptureKind)      ? (p.kind as CaptureKind)    : 'note';
  const urgency: Urgency     = URGENCIES.includes(p.urgency as Urgency)   ? (p.urgency as Urgency)     : 'someday';
  return {
    kind, urgency,
    title:   String(p.title   ?? text.slice(0, 60)).trim(),
    summary: String(p.summary ?? text.slice(0, 120)).trim(),
    method: 'openai',
  };
}

// ── Regex (last resort) ──────────────────────────────────────────────────────

function tryRegex(text: string): Classification {
  const s = text.toLowerCase();

  let kind: CaptureKind = 'note';
  if      (/\b(call|text|catch up|reach out|ping|email|message|check in with)\b/.test(s))                kind = 'friends';
  else if (/\b(ate|eating|protein|calor|meal|breakfast|lunch|dinner|snack|workout|ran|run|bike|swim|gym|lift|steps|sleep|weight|hrv)\b/.test(s)) kind = 'health';
  else if (/\b(read|reading|book|article|chapter|essay|paper|podcast)\b/.test(s))                        kind = 'reading';
  else if (/\b(buy|todo|task|finish|complete|fix|send|draft|submit|pay|remind|sign|file)\b/.test(s))     kind = 'task';
  else if (/\b(spent|spend|cost|bought|paid|budget|money|dollar|bank|invest|expense|income|salary)\b/.test(s)) kind = 'finance';
  else if (/\b(water|vitamin|meditate|meditation|habit|streak)\b/.test(s))                               kind = 'habit';
  else if (/\b(meeting|standup|appointment|calendar|event|schedule with|dentist|doctor|interview)\b/.test(s)) kind = 'agenda';

  let urgency: Urgency = 'someday';
  if      (/\b(today|tonight|this morning|this afternoon|asap|urgent|now|immediately)\b/.test(s)) urgency = 'today';
  else if (/\b(tomorrow|this week|this weekend|next few days)\b/.test(s))                         urgency = 'this_week';
  else if (/\b(this month|next week|end of month)\b/.test(s))                                    urgency = 'this_month';
  else if (/\b(important|critical|key|vital|must|essential|priority|high priority)\b/.test(s))   urgency = 'key';

  return {
    kind, urgency,
    title:   text.slice(0, 60).trim(),
    summary: text.slice(0, 120).trim(),
    method: 'regex',
  };
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function classifyCapture(text: string): Promise<Classification> {
  try {
    return await tryAnthropic(text);
  } catch (e) {
    console.warn('[classify] Anthropic failed, trying OpenAI:', (e as Error).message);
    try {
      return await tryOpenAI(text);
    } catch (e2) {
      console.warn('[classify] OpenAI failed, using regex:', (e2 as Error).message);
      return tryRegex(text);
    }
  }
}
