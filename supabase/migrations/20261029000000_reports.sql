-- Emailed reports: a player's performance report and an organiser's event report, on request and as a
-- monthly summary. Email is not a way to sign in for these; it's an address confirmed with a code that
-- reports are sent to.
--
-- The app's server (on Vercel) sends the emails. It proves itself to the database with a shared secret,
-- created below: copy it into Vercel as CRON_SECRET (see docs/DATABASE_SETUP.md, "Email reports").

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_config (
  key text primary key,
  value text not null
);
insert into private.app_config (key, value)
values ('report_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Shows the secret to copy into Vercel. Only works in the SQL editor (not callable from the app).
create or replace function private.report_secret() returns text
language sql stable
as $$ select value from private.app_config where key = 'report_secret' $$;

create or replace function private.secret_ok(given text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select given is not null and exists (select 1 from private.app_config where key = 'report_secret' and value = given)
$$;

-- One row per signed-in person (their mobile number, or email if they signed in with one).
create table public.report_settings (
  identity text primary key,
  email text not null,
  monthly boolean not null default true,
  confirmed_at timestamptz not null default now(),
  last_sent_at timestamptz
);

alter table public.report_settings enable row level security;

-- People see their own row. All changes go through the functions below.
create policy "read own report settings" on public.report_settings
  for select to authenticated using (identity = public.my_identity());

-- Server only: saves an address after the person typed the code emailed to it.
create or replace function public.set_report_email(secret text, who text, address text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.secret_ok(secret) then raise exception 'Not allowed.'; end if;
  insert into public.report_settings (identity, email, confirmed_at)
  values (who, lower(trim(address)), now())
  on conflict (identity) do update set email = excluded.email, confirmed_at = now();
end
$$;

-- Server only: the address to send a requested report to, at most once every `gap_minutes`.
-- Returns null when there is no address or a report was sent too recently.
create or replace function public.claim_report_send(secret text, who text, gap_minutes integer) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  address text;
begin
  if not private.secret_ok(secret) then raise exception 'Not allowed.'; end if;
  update public.report_settings r
  set last_sent_at = now()
  where r.identity = who
    and (r.last_sent_at is null or r.last_sent_at < now() - make_interval(mins => gap_minutes))
  returning r.email into address;
  return address;
end
$$;

-- Server only (monthly job): everyone who wants the monthly summary, with their player cards.
create or replace function public.report_recipients(secret text)
returns table (identity text, email text, card_ids text[])
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.secret_ok(secret) then raise exception 'Not allowed.'; end if;
  return query
    select r.identity, r.email,
           array(select distinct c.player_id from public.player_contacts c where c.contact = r.identity)
    from public.report_settings r
    where r.monthly;
end
$$;

-- The person themselves: monthly summary on / off, or forget the address.
create or replace function public.set_report_monthly(wanted boolean) returns void
language sql security definer
set search_path = ''
as $$
  update public.report_settings set monthly = wanted where identity = public.my_identity()
$$;

create or replace function public.remove_report_email() returns void
language sql security definer
set search_path = ''
as $$
  delete from public.report_settings where identity = public.my_identity()
$$;

revoke execute on function public.set_report_email(text, text, text) from public;
revoke execute on function public.claim_report_send(text, text, integer) from public;
revoke execute on function public.report_recipients(text) from public;
grant execute on function public.set_report_email(text, text, text) to anon, authenticated;
grant execute on function public.claim_report_send(text, text, integer) to anon, authenticated;
grant execute on function public.report_recipients(text) to anon, authenticated;

revoke execute on function public.set_report_monthly(boolean) from public, anon;
revoke execute on function public.remove_report_email() from public, anon;
grant execute on function public.set_report_monthly(boolean) to authenticated;
grant execute on function public.remove_report_email() to authenticated;
