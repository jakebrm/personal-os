import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { homeDateStr } from '@/lib/dates';

export type ImportedMarker = {
  name: string;
  value: number | null;
  unit: string;
  reference_low: number | null;
  reference_high: number | null;
};

export type ImportResult = {
  date: string;
  test_source: string;
  markers: ImportedMarker[];
};

const TODAY = homeDateStr();

const SYSTEM_PROMPT = `You are a medical lab data extraction assistant. Extract every biomarker test result from the provided content.

Return ONLY a JSON object — no markdown fences, no commentary:

{
  "date": "YYYY-MM-DD",
  "test_source": "Rythm",
  "markers": [
    {
      "name": "Marker Name",
      "value": 123.4,
      "unit": "unit string",
      "reference_low": 0.0,
      "reference_high": 100.0
    }
  ]
}

Rules:
- date: use the test/collection date if visible. Fall back to ${TODAY}.
- value: numeric only. null if missing or non-numeric.
- reference_low / reference_high: range bounds. null if not shown.
- "> X" → reference_low=X, reference_high=null. "< X" → reference_low=null, reference_high=X.
- Include every biomarker even if no reference range.
- Normalize names: "Testosterone, Total" → "Testosterone (Total)", "T3, Free" → "Free T3", etc.
- If given structured JSON (e.g. from __NEXT_DATA__), prefer that over HTML text.`;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'identity',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

/** Extract the __NEXT_DATA__ JSON blob that Next.js SSR pages embed in the HTML. */
function extractNextData(html: string): unknown | null {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
               ?? html.match(/<script[^>]*type=["']application\/json["'][^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

/** Strip tags/scripts/styles and return visible text, capped to avoid token blowout. */
function visibleText(html: string, maxChars = 40_000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{3,}/g, '\n')
    .trim()
    .slice(0, maxChars);
}

async function runClaude(content: string): Promise<ImportResult> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  });
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI returned no JSON — no biomarkers found in the content');
  const result = JSON.parse(match[0]) as ImportResult;
  if (!result.markers?.length) throw new Error('No biomarkers found in the page content');
  return result;
}

export async function POST(req: Request) {
  const body = await req.json() as { url?: string; text?: string };

  // ── Paste / text fallback ─────────────────────────────────────────────────
  if (body.text) {
    const text = body.text.slice(0, 60_000);
    try {
      const result = await runClaude(`Extract biomarkers from this pasted lab report text:\n\n${text}`);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 422 });
    }
  }

  // ── URL fetch ─────────────────────────────────────────────────────────────
  const { url } = body;
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'Invalid URL — must start with http:// or https://' }, { status: 400 });
  }

  let html: string;
  let fetchStatus: number;
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    fetchStatus = res.status;
    html = await res.text();

    if (!res.ok) {
      const isNotFound = res.status === 404;
      const msg = isNotFound
        ? `Page not found (404). Double-check the share link is correct and the results are still shared publicly.`
        : `The page returned an error (HTTP ${res.status}). Try the "Paste text" option instead.`;
      return NextResponse.json({ error: msg, fetchStatus }, { status: 422 });
    }
  } catch (err) {
    return NextResponse.json({
      error: `Could not reach the URL: ${String(err)}. Check your connection or try the "Paste text" option.`,
    }, { status: 422 });
  }

  // ── Try __NEXT_DATA__ first (structured JSON = much better extraction) ────
  const nextData = extractNextData(html);
  let contentForClaude: string;

  if (nextData) {
    const jsonStr = JSON.stringify(nextData, null, 2).slice(0, 60_000);
    const visText = visibleText(html, 10_000);
    contentForClaude = `Rythm health share page — structured page data (JSON from __NEXT_DATA__):\n\n${jsonStr}\n\n---\nVisible page text:\n${visText}`;
  } else {
    // Fall back to stripped HTML text only
    const visText = visibleText(html, 50_000);
    if (visText.length < 100) {
      return NextResponse.json({
        error: 'The page appears to require JavaScript to render. Try the "Paste text" option — open the Rythm link in your browser, select all text (⌘A), copy it, and paste it here.',
      }, { status: 422 });
    }
    contentForClaude = `Lab results page text:\n\n${visText}`;
  }

  try {
    const result = await runClaude(contentForClaude);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      error: String(err),
      hint: 'Try the "Paste text" option — open the Rythm link in your browser, select all (⌘A), copy, and paste.',
    }, { status: 422 });
  }
}
