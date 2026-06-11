import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// After a successful OAuth exchange, persist the new refresh token to .env.local
// and update process.env so subsequent requests use it without a server restart.
function persistRefreshToken(token: string) {
  process.env.STRAVA_REFRESH_TOKEN = token;

  try {
    const path = join(process.cwd(), '.env.local');
    let content = readFileSync(path, 'utf8');
    if (/^STRAVA_REFRESH_TOKEN=.*/m.test(content)) {
      content = content.replace(/^STRAVA_REFRESH_TOKEN=.*/m, `STRAVA_REFRESH_TOKEN=${token}`);
    } else {
      content += `\nSTRAVA_REFRESH_TOKEN=${token}\n`;
    }
    writeFileSync(path, content, 'utf8');
  } catch {
    // In production, .env.local may not exist — process.env update above is enough
  }
}

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/dashboard?strava=denied', req.url));
  }
  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
    }),
  });

  const data = await res.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    errors?: unknown;
    message?: string;
  };

  if (!res.ok || !data.refresh_token) {
    return NextResponse.json({
      error: 'Token exchange failed',
      strava_error: data.message ?? data.errors ?? 'unknown',
    }, { status: 500 });
  }

  persistRefreshToken(data.refresh_token);

  // Redirect back to the health section — Strava sync will use the fresh token
  return NextResponse.redirect(new URL('/dashboard#health', req.url));
}
