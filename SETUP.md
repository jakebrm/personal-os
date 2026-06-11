# Personal OS — fresh setup

A personal dashboard OS: tasks, habits, health, training, reading, friends,
goals, work log, a business CRM, ⌘K command palette, themes & backgrounds.
All data lives in **your own** Supabase project — this codebase ships with none.

## 1. Install

```bash
npm install
```

## 2. Create a database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the project's **SQL Editor** and run each file in `supabase/migrations/`
   **in numeric order** (0001 → 0014). Paste + run, one at a time.
3. From **Project Settings → API**, grab the Project URL and the
   `service_role` key.

## 3. Configure

```bash
cp .env.example .env.local
```

Fill in the four REQUIRED values (Supabase URL + service-role key, a dashboard
password, and a random `AUTH_SECRET`). Everything under OPTIONAL just turns on
extra integrations — the app runs fine without them; those cards simply stay
empty.

> Note: the database rows are tagged with a fixed `user_id` of `'owner'` —
> it's a single-user app, no need to change it.

## 4. Run

```bash
npm run dev
```

Open http://localhost:3000, log in with your `DASHBOARD_PASSWORD`, and hit
the ⚙ gear → Appearance to make it yours. Try **⌘K** for the command palette.

## Deploying

The repo is Vercel-ready (`vercel.json` included): import it on
[vercel.com](https://vercel.com), set the same env vars, deploy.

## Contacts inbox + birthdays (macOS only)

Import your Mac/iCloud address book into a triage inbox in the Friends deep:

```bash
npm run sync:contacts          # add -- --dry-run to preview
```

macOS will ask once to allow Terminal to access Contacts. Every person lands
in **Friends → Inbox**, where you label them Close / Good / Acquaintance /
Professional (creating a friend with their phone, email, city, and birthday)
or dismiss them. Contacts whose name already matches a friend are auto-linked
and their missing details backfilled. Re-run the script any time — triage
decisions are preserved.

Birthdays of labeled friends show automatically in the dashboard calendar.
To get them on Google Calendar / your phone, set `BIRTHDAY_ICS_TOKEN` and
subscribe ("From URL" in Google Calendar settings) to:

```
https://<your-host>/api/calendar/birthdays.ics?token=<BIRTHDAY_ICS_TOKEN>
```
