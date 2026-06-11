import { NextResponse } from 'next/server';
import { getStravaAccessToken } from '@/lib/strava-sync';

/**
 * Athlete heart-rate zones from Strava (/athlete/zones).
 * Falls back to the owner's known zones (pulled from his Strava account, June 2026,
 * source MaxHeartRateFromAge) when the token lacks profile:read_all.
 */
const FALLBACK_ZONES = [
  { min: 0,   max: 129  },
  { min: 130, max: 160  },
  { min: 161, max: 176  },
  { min: 177, max: 192  },
  { min: 193, max: null },
];

let cache: { data: unknown; ts: number } | null = null;
const CACHE_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const token = await getStravaAccessToken();
    const res = await fetch('https://www.strava.com/api/v3/athlete/zones', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`zones: ${res.status}`);
    const j = await res.json() as { heart_rate?: { zones?: { min: number; max: number }[] } };
    const hr = j.heart_rate?.zones ?? [];
    if (hr.length < 3) throw new Error('no hr zones');
    const data = {
      zones: hr.map(z => ({ min: z.min, max: z.max < 0 ? null : z.max })),
      source: 'strava',
    };
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch {
    const data = { zones: FALLBACK_ZONES, source: 'profile' };
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  }
}
