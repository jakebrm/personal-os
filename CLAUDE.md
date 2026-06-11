# Personal OS — assistant instructions

This is a single-user life dashboard (Next.js + Supabase). If the user just
cloned it and asks to "set me up" (or anything similar), run the **Guided
Setup** below. Otherwise, these notes also cover the codebase conventions.

## Guided Setup

Walk the user through this interactively — one step at a time, confirming as
you go. Never paste their secrets into chat history summaries; write them
straight to `.env.local` (gitignored).

**Golden rule: only the REQUIRED block is required.** Every optional
integration they skip simply leaves its cards empty / showing `--`. Never
pressure the user to connect anything; offer, explain what it lights up, move
on.

### 1. Required (the app won't boot without these)

1. `npm install`, then `cp .env.example .env.local`.
2. **Supabase**: have them create a free project at supabase.com. Then apply
   the schema — every file in `supabase/migrations/` in numeric order. If you
   have a Supabase MCP/CLI available, offer to apply them for the user;
   otherwise walk them through pasting each file into the SQL Editor
   (tedious but foolproof). Get `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API into `.env.local`.
3. **Login**: ask them to choose a `DASHBOARD_PASSWORD`, and generate
   `AUTH_SECRET` yourself (`openssl rand -hex 32`).
4. `npm run dev` → http://localhost:3000 → log in. Confirm the dashboard
   renders (cards will be empty — that's correct).

### 2. Personalization (quick wins, all optional)

- `NEXT_PUBLIC_OWNER_NAME` in `.env.local` — the greeting name on the
  dashboard ("Hello, ___").
- `NEXT_PUBLIC_USER_TIMEZONE` — their IANA timezone (e.g. `America/New_York`).
  Strongly recommend setting this: it controls when "today" rolls over for
  habits, journal, and stats (unset, days flip at UTC midnight).
- `NEXT_PUBLIC_WEATHER_LAT` / `NEXT_PUBLIC_WEATHER_LON` — coordinates for the
  weather card (Open-Meteo, free, no API key). Ask for their city and look up
  rough coordinates yourself; without these the weather card stays empty.
  Optionally `NEXT_PUBLIC_WEATHER_LABEL` — a place name ("Brooklyn, NY") shown
  in the Weather tab header.
- **Nutritionist profile**: `app/api/chat/nutritionist/route.ts` has an
  `EDIT ME` profile block in the system prompt. Offer to interview the user
  (sex/age/height/weight, training style, goal, eating quirks) and fill it in.
  If they'd rather not share health info, leave the placeholders — the chat
  still works and asks in-conversation instead.
- Bookmarks seeds in `components/dashboard/deeps/BookmarksDeep.tsx` (or just
  edit in the UI).

### 3. Optional integrations (offer as a menu, set up only what they pick)

For each: explain the one-line value, then give exact steps.

| Pick | Env vars | Steps |
|---|---|---|
| AI nutritionist chat | `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`) | console.anthropic.com → API keys |
| Brain (semantic notes search) | `OPENAI_API_KEY` | platform.openai.com → API keys (used for embeddings) |
| Calendar cards | `GOOGLE_CALENDAR_ICAL_URL` | Google Calendar → Settings → your calendar → "Secret address in iCal format" |
| Extra calendars | `CALENDAR_EXTRA_FEEDS` | comma-separated `Name\|ical-url` pairs |
| Strava | `STRAVA_CLIENT_ID/SECRET/REFRESH_TOKEN` | strava.com/settings/api → create app, then visit `/api/health/strava/connect` once the app runs |
| intervals.icu | `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID` | intervals.icu → Settings → Developer |
| Apple Health | `APPLE_EXPORT_SECRET` (any random string) | iOS "Health Auto Export" app → REST API → POST to `https://<host>/api/health/apple-export` with `Authorization: Bearer <secret>` |
| Telegram capture + morning brief | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_USER_ID`, `TELEGRAM_WEBHOOK_SECRET` | @BotFather → new bot; set webhook to `https://<host>/api/telegram/webhook?secret=…` |
| Birthday calendar feed | `BIRTHDAY_ICS_TOKEN` (any random string) | subscribe to `/api/calendar/birthdays.ics?token=…` |

macOS-only local syncs (need this machine, not the deployment): address-book
import (`npm run sync:contacts`) and iMessage/call-log → friends tracking
(`npm run sync:comms`, needs Full Disk Access for the node binary; see script
headers for the launchd scheduling pattern).

### 4. Deploy (optional)

Vercel: import the GitHub repo, copy the same env vars, deploy. Crons in
`vercel.json` are safe no-ops without Telegram configured.

## Codebase notes

- **Single-user by design**: all rows carry `user_id = 'owner'` (a fixed tag,
  not an auth system). Auth is one password + a signed cookie (`middleware.ts`).
- **Deny-all RLS everywhere** — the app talks to Supabase exclusively through
  the service-role key on the server. Never expose the service key client-side;
  new tables MUST `ENABLE ROW LEVEL SECURITY` in their migration.
- "Today" must use `homeDateStr()` / `localDateKey()` (`lib/dates.ts`,
  `NEXT_PUBLIC_USER_TIMEZONE` env) — never UTC `toISOString().slice(0,10)`.
- Cards/tabs follow the `Panel` + `.card`/`.chead` pattern; charts are recharts
  with shared tooltip chrome from `components/health/shared.tsx`.
- Migrations are plain SQL in `supabase/migrations/`, applied in order; keep
  numbering sequential.
