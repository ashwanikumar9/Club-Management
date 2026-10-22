# Connecting the database (Supabase)

Without a database the app runs in **prototype mode**: everything stays in one browser. Connecting Supabase
gives you:

- live scores shared between every phone (scorers, organisers, spectators)
- sign-in with a one-time code sent by email (or SMS)
- database rules that let only a match's organiser and scorers change it, while anyone can follow

Supabase's free plan is enough to start. Free projects pause after about a week without activity, so open
the dashboard (or upgrade) before an event.

## 1. Create the project

1. Sign up at <https://supabase.com> and create a new project. Pick the region closest to your players
   (for India: Mumbai).
2. Wait for it to finish setting up.

## 2. Create the table and rules

1. In the dashboard open **SQL Editor → New query**.
2. Paste the whole of [`supabase/migrations/20261022000000_documents.sql`](../supabase/migrations/20261022000000_documents.sql)
   and click **Run**. It creates the `documents` table, turns on live updates for it and adds the
   permission rules.

## 3. Sign-in by code

1. **Authentication → Sign In / Providers → Email**: make sure Email is enabled.
2. **Authentication → Emails → Templates**: in both **Magic Link** and **Confirm signup**, replace the body
   with the contents of [`supabase/templates/sign-in-code.html`](../supabase/templates/sign-in-code.html)
   and set the subject to "Your Rally Scorer sign-in code". The app asks for the 6-digit code, so the email
   must contain `{{ .Token }}`.
3. Optional, SMS codes: **Authentication → Sign In / Providers → Phone**, enable it and connect an SMS
   provider (Twilio, MessageBird, Vonage or Textlocal). SMS costs money per message; email codes are free.
4. **Authentication → URL Configuration**: set **Site URL** to your app's address (for example your Vercel
   URL).

Supabase's built-in email sender is limited to a few emails per hour. For a real event, add your own SMTP
server under **Authentication → Emails → SMTP Settings** (for example Resend, Brevo or Amazon SES).

## 4. Connect the app

In **Project Settings → API** (or **Data API**) copy the **Project URL** and the **anon / publishable key**.

- **Vercel**: Project → Settings → Environment Variables, add
  - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon (or publishable) key

  then redeploy.
- **Your computer**: create a file `.env.local` in the project folder with the same two lines
  (`NAME=value`), then restart `npm run dev`.

Never use the `service_role` / secret key in the app.

## Running Supabase on your computer (optional, for development)

With Docker installed:

```bash
npx supabase start      # starts a local database, auth and live updates; prints the URL and anon key
npx supabase stop
```

The local setup already uses the sign-in code template. Emails are caught by the local mail viewer printed
by `supabase start` (Mailpit, usually <http://127.0.0.1:54324>).

## How it works

- Matches, tournaments and team ties are stored as JSON documents in one table, exactly as the app uses them.
- Changes appear on the scorer's phone at once and are then saved with a version check. If two people
  change the same record at the same moment, the second change is re-applied on top of the first, so
  nothing is lost.
- Live updates reach every open page within about a second.

## Current limits

- Usernames (`@name`) work only in prototype mode, because a sign-in code has to go to an email address or
  a phone. Add scorers by email or mobile number when the database is connected.
- Moving a winner to the next round is done by the device that closes the match. If that person is a
  scorer of a single tie but not of the tournament, the tournament updates the next time the organiser or
  a tournament scorer closes a match or makes a change.
