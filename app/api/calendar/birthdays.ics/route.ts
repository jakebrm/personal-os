import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { HOME_TZ } from '@/lib/dates';

/**
 * Live birthday calendar built from `friends.birthday` — one yearly-recurring
 * all-day event per friend. Subscribe to it from Google Calendar / iOS via
 *   https://<host>/api/calendar/birthdays.ics?token=BIRTHDAY_ICS_TOKEN
 * so it stays in sync as friends are added, edited, or written off.
 *
 * Public at the middleware layer (calendar apps can't send cookies); access
 * is gated by the token instead. Returns 404 rather than 401 so the URL
 * doesn't advertise itself when probed without a token.
 */

const pad = (n: number) => String(n).padStart(2, '0');

// RFC 5545: backslash, comma and semicolon must be escaped in TEXT values
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1');

function dtstamp(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export async function GET(req: Request) {
  const expected = process.env.BIRTHDAY_ICS_TOKEN;
  const token = new URL(req.url).searchParams.get('token');
  if (!expected || token !== expected) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('friends')
    .select('id, name, birthday, updated_at')
    .eq('user_id', 'owner')
    .not('birthday', 'is', null)
    .neq('status', 'written_off')
    .order('name');
  if (error) return new NextResponse('error', { status: 500 });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//personal-os//birthdays//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Birthdays',
    `X-WR-TIMEZONE:${HOME_TZ}`,
  ];

  for (const f of data ?? []) {
    const [y, m, d] = (f.birthday as string).split('-').map(Number);
    // 1900 = unknown birth year sentinel; anchor those at 2020 (a leap year,
    // so Feb 29 birthdays get a valid DTSTART)
    const year = y > 1900 ? y : 2020;
    const start = `${year}${pad(m)}${pad(d)}`;
    const dayAfter = new Date(Date.UTC(year, m - 1, d + 1));
    const end = `${dayAfter.getUTCFullYear()}${pad(dayAfter.getUTCMonth() + 1)}${pad(dayAfter.getUTCDate())}`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:bday-${f.id}@personal-os`,
      `DTSTAMP:${dtstamp(f.updated_at as string)}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      'RRULE:FREQ=YEARLY',
      `SUMMARY:🎂 ${esc(f.name as string)}'s birthday`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  return new NextResponse(lines.join('\r\n') + '\r\n', {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
