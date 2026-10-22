-- Sports meets and team registrations.
--
-- A meet (collection 'meets' in documents) groups several events; each event is played as its own tournament.
-- Teams register for an event through the meet's link. Registrations live in their own table: a captain sees
-- their own requests, and the meet's organiser or that event's admins see and decide on the event's requests.

alter table public.documents drop constraint documents_collection_check;
alter table public.documents
  add constraint documents_collection_check
  check (collection in ('matches', 'tournaments', 'ties', 'players', 'meets'));

create table public.registrations (
  id text primary key,
  meet_id text not null,
  event_id text not null,
  captain text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  data jsonb not null,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index registrations_meet on public.registrations (meet_id);
create index registrations_captain on public.registrations (captain);

-- The meet's organiser, or an admin of this event.
create or replace function public.can_manage_event(mid text, eid text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.my_identity() is not null and exists (
    select 1 from public.documents d
    where d.collection = 'meets' and d.id = mid and (
      d.data ->> 'organiser' = public.my_identity()
      or exists (
        select 1 from jsonb_array_elements(coalesce(d.data -> 'events', '[]'::jsonb)) as e(ev)
        where e.ev ->> 'id' = eid and coalesce(e.ev -> 'admins', '[]'::jsonb) ? public.my_identity()
      )
    )
  )
$$;

create or replace function public.meet_registration_open(mid text, eid text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.collection = 'meets' and d.id = mid
      and coalesce((d.data -> 'registration' ->> 'open')::boolean, false)
      and exists (select 1 from jsonb_array_elements(coalesce(d.data -> 'events', '[]'::jsonb)) as e(ev) where e.ev ->> 'id' = eid)
  )
$$;

alter table public.registrations enable row level security;

create policy "Captains and event managers see registrations"
  on public.registrations for select to authenticated
  using (captain = public.my_identity() or public.can_manage_event(meet_id, event_id));

create policy "Signed-in captains can register while registration is open"
  on public.registrations for insert to authenticated
  with check (captain = public.my_identity() and status = 'pending' and public.meet_registration_open(meet_id, event_id));

create policy "Event managers decide on registrations"
  on public.registrations for update to authenticated
  using (public.can_manage_event(meet_id, event_id))
  with check (public.can_manage_event(meet_id, event_id));

create policy "Captains can withdraw pending requests; managers can delete"
  on public.registrations for delete to authenticated
  using ((captain = public.my_identity() and status = 'pending') or public.can_manage_event(meet_id, event_id));

-- Live updates so organisers see new requests (and captains see decisions) without refreshing.
alter table public.registrations replica identity full;
alter publication supabase_realtime add table public.registrations;
