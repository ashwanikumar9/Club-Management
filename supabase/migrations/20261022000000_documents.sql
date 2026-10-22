-- Shared storage for matches, tournaments and team ties.
--
-- Each record is stored as one JSON document, exactly as the app works with it. The scoring logic runs in
-- the app; the database stores the result, keeps every phone in sync (realtime) and enforces who may write:
-- anyone can read (spectators), only the organiser or a scorer listed on a record can change it.

create table public.documents (
  collection text not null check (collection in ('matches', 'tournaments', 'ties')),
  id text not null,
  data jsonb not null,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

-- Realtime sends the full row on every change.
alter table public.documents replica identity full;
alter publication supabase_realtime add table public.documents;

-- The signed-in person's identity key as the app writes it: lower-case email, or "+<country code><number>".
create or replace function public.my_identity() returns text
language sql stable
set search_path = ''
as $$
  select case
    when coalesce(auth.jwt() ->> 'email', '') <> '' then lower(auth.jwt() ->> 'email')
    when coalesce(auth.jwt() ->> 'phone', '') <> '' then '+' || ltrim(auth.jwt() ->> 'phone', '+')
    else null
  end
$$;

-- Organiser, or listed as a scorer (tournaments and ties list identity keys; matches list {user, ...}).
create or replace function public.can_write(doc jsonb) returns boolean
language sql stable
set search_path = ''
as $$
  select public.my_identity() is not null and (
    doc ->> 'organiser' = public.my_identity()
    or exists (
      select 1
      from jsonb_array_elements(coalesce(doc -> 'scorers', '[]'::jsonb)) as s(entry)
      where (jsonb_typeof(s.entry) = 'string' and s.entry #>> '{}' = public.my_identity())
         or (jsonb_typeof(s.entry) = 'object' and s.entry ->> 'user' = public.my_identity())
    )
  )
$$;

alter table public.documents enable row level security;

create policy "Anyone can follow matches and tournaments"
  on public.documents for select
  using (true);

create policy "Organisers and scorers can create"
  on public.documents for insert to authenticated
  with check (public.can_write(data));

create policy "Organisers and scorers can update"
  on public.documents for update to authenticated
  using (public.can_write(data))
  with check (public.can_write(data));

create policy "Organisers can delete"
  on public.documents for delete to authenticated
  using (data ->> 'organiser' = public.my_identity());

-- Optimistic concurrency: the app sends the version it read; a stale write updates nothing and the app
-- re-applies its change to the latest version.
create index documents_updated_at on public.documents (updated_at desc);
