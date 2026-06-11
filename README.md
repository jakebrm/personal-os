# Personal OS

A single-user life dashboard you own end-to-end: tasks, habits, health & training,
nutrition, reading, journaling with mood tracking, friends ("keep in touch" CRM),
goals, work log, bookmarks, a business CRM, an AI nutritionist chat, and a
semantic "Brain" over your own notes — all in one keyboard-driven Next.js app
backed by **your own** Supabase project.

**This repo ships with zero data and zero accounts.** Everything personal lives
in your Supabase database and your `.env.local`, both of which you create.

## The 5-minute start (AI-guided)

The fastest path is to let an AI coding assistant set you up. Open this folder
in [Claude Code](https://claude.com/claude-code) (or any assistant that reads
`CLAUDE.md`) and say:

> **set me up**

The assistant will walk you through creating a free Supabase project, applying
the schema, generating secrets, and choosing which optional integrations you
want — one question at a time. Skip anything; skipped cards just show `--`.

## Manual start

```bash
npm install
cp .env.example .env.local   # fill in the 4 REQUIRED values
npm run dev                  # → http://localhost:3000
```

The four required values (see `.env.example`):

| Var | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (free tier is fine) |
| `SUPABASE_SERVICE_ROLE_KEY` | Its service-role key (server-side only) |
| `DASHBOARD_PASSWORD` | The single login password for your dashboard |
| `AUTH_SECRET` | Any long random string (`openssl rand -hex 32`) |

Then apply the schema: run each file in `supabase/migrations/` in numeric
order in the Supabase SQL Editor. Full walkthrough in [SETUP.md](SETUP.md).

## Everything else is optional

The app boots and runs with only the four values above. Each integration just
lights up more cards — without it, the card shows an empty state or `--`:

| Integration | Lights up | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_USER_TIMEZONE` | Correct "today" rollover for habits, journal & stats | your IANA timezone, e.g. `America/New_York` |
| `NEXT_PUBLIC_WEATHER_LAT` / `_LON` | Weather card & forecast | your coordinates — Open-Meteo, free, no key |
| `ANTHROPIC_API_KEY` | AI nutritionist chat | console.anthropic.com |
| `OPENAI_API_KEY` | Brain semantic search over your notes | platform.openai.com |
| `GOOGLE_CALENDAR_ICAL_URL` | Calendar & agenda cards | Google Calendar → secret iCal address |
| Strava keys | Activity sync, training stats | strava.com/settings/api |
| `INTERVALS_API_KEY` | Structured training plan sync | intervals.icu settings |
| Apple Health export | Sleep, steps, HR, weight, nutrition | Health Auto Export iOS app → `POST /api/health/apple-export` |
| Telegram bot keys | Quick-capture bot + morning brief | @BotFather |

There's also a **demo mode** (Settings → demo) that fills every card with
synthetic data so you can explore the whole UI before connecting anything.

## What's in the box

- **Dashboard** — drag-to-rearrange widget grid, ⌘K command palette, themes
- **Health** — sleep, heart, steps, weight, biomarkers, fuel/nutrition, sources
- **Training** — calendar plan + Strava/intervals.icu reconciliation
- **Habits** — streaks, consistency charts, weekday rhythm, wake-time trends
- **Daily Log** — journal with mood tracking, writing momentum, monthly trackers
- **Friends** — contact cadences, who-reached-out-first tracking, reply-time stats, address-book import (macOS)
- **Goals / Reading / Tasks / Work log / CRM / Bookmarks / Brain** — and more

macOS-only extras (optional, local `launchd` scripts): iMessage/call-log sync
into the friends tracker, and address-book import. See `scripts/`.

## Deploying

Vercel-ready: import the repo, set the same env vars, deploy. `vercel.json`
includes two daily crons (friend reminders + morning brief) that no-op unless
you configured Telegram.

## License

MIT — see [LICENSE](LICENSE).
