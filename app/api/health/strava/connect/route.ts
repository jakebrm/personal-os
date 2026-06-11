import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'STRAVA_CLIENT_ID not set' }, { status: 503 });
  }

  const callbackUrl = `${req.nextUrl.origin}/api/health/strava/callback`;
  const authUrl     = new URL('https://www.strava.com/oauth/authorize');
  authUrl.searchParams.set('client_id',     clientId);
  authUrl.searchParams.set('redirect_uri',  callbackUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope',         'read,activity:read_all');
  authUrl.searchParams.set('approval_prompt', 'force'); // always re-consent to get refresh token

  return NextResponse.redirect(authUrl.toString());
}
