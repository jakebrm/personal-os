// "Today" must follow the owner's clock, never UTC — `toISOString()` flips to
// tomorrow in the evening for anyone west of Greenwich. Pinning to HOME_TZ
// (rather than device-local) keeps server (Vercel runs UTC) and client on the
// same day and avoids SSR/hydration drift.
// NEXT_PUBLIC_ so the same value is inlined into the client bundle — set it in
// .env.local (e.g. "America/New_York"); unset, days roll over at UTC midnight.
export const HOME_TZ = process.env.NEXT_PUBLIC_USER_TIMEZONE || 'UTC';

// YYYY-MM-DD for `d` on the owner's clock. en-CA locale formats as ISO.
export function homeDateStr(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: HOME_TZ });
}
