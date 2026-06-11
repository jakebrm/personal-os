import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/auth';

// Icons + manifest must be public: PWA installers and tab-icon fetches
// don't send cookies, and the artwork isn't sensitive.
const ALWAYS_PUBLIC = ['/login', '/icon', '/apple-icon', '/manifest.webmanifest'];
// Cron-hit routes are public at the middleware layer but validate
// `Authorization: Bearer CRON_SECRET` themselves (Vercel cron can't send
// cookies or custom headers, so the middleware would otherwise block them).
const PUBLIC_PREFIXES = [
  '/api/auth/', '/api/webhooks/', '/api/telegram/',
  '/api/friends/reminders', '/api/brief/auto',
  '/api/health/apple-export', // Health Auto Export app — validates its own Bearer secret
  '/api/calendar/birthdays',  // ICS feed for calendar apps (no cookies) — validates its own ?token
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    ALWAYS_PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Fail closed — misconfigured environment
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Programmatic access via header (API routes only)
  if (pathname.startsWith('/api/')) {
    const header = req.headers.get('x-api-secret');
    if (header && header === secret) return NextResponse.next();
  }

  // Browser access via signed cookie
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie && (await verifySession(cookie.value, secret))) {
    return NextResponse.next();
  }

  const next = encodeURIComponent(pathname);
  return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.svg$).*)'],
};
