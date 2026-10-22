-- Player cards: one public profile per person, reused across matches, ties and tournaments.
--
-- The card (collection 'players' in documents) is public and holds no contact details. The mobile numbers and
-- emails that identify a player live in player_contacts, readable only by whoever added them and by the
-- player (whoever signs in with that number / email). Signing in with a card's contact makes it yours.

alter table public.documents drop constraint documents_collection_check;
alter table public.documents
  add constraint documents_collection_check check (collection in ('matches', 'tournaments', 'ties', 'players'));

create table public.player_contacts (
  player_id text not null,
  contact text not null,
  added_by text not null,
  created_at timestamptz not null default now(),
  primary key (player_id, contact)
);

create index player_contacts_contact on public.player_contacts (contact);

-- Whether the signed-in person owns the card: one of its contacts is theirs. Security definer so policies on
-- player_contacts can use it without recursing into themselves.
create or replace function public.owns_player(pid text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.my_identity() is not null and exists (
    select 1 from public.player_contacts c where c.player_id = pid and c.contact = public.my_identity()
  )
$$;

-- Created the card, or owns it.
create or replace function public.can_edit_player(pid text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.my_identity() is not null and (
    exists (
      select 1 from public.documents d
      where d.collection = 'players' and d.id = pid and d.data ->> 'organiser' = public.my_identity()
    )
    or public.owns_player(pid)
  )
$$;

alter table public.player_contacts enable row level security;

create policy "Contacts are visible to whoever added them and to the player"
  on public.player_contacts for select to authenticated
  using (added_by = public.my_identity() or contact = public.my_identity());

create policy "The card's creator or owner can add contacts"
  on public.player_contacts for insert to authenticated
  with check (added_by = public.my_identity() and public.can_edit_player(player_id));

create policy "The card's creator or owner can remove contacts"
  on public.player_contacts for delete to authenticated
  using (public.can_edit_player(player_id));

-- Cards can be changed by their creator (can_write: the 'organiser' field) or their owner.
drop policy "Organisers and scorers can update" on public.documents;
create policy "Organisers and scorers can update"
  on public.documents for update to authenticated
  using (public.can_write(data) or (collection = 'players' and public.owns_player(id)))
  with check (public.can_write(data) or (collection = 'players' and public.owns_player(id)));
