-- Teams (collection 'teams' in documents), finding a player's card by mobile / email, and joining a team by
-- its invite link.
--
-- A team document lists its admins in 'scorers', so the existing write rules (organiser or scorers) let the
-- creator and admins change it. Players join through the invite link with join_team(), which checks the
-- link's code and that the card being added belongs to the signed-in person.

alter table public.documents drop constraint documents_collection_check;
alter table public.documents
  add constraint documents_collection_check
  check (collection in ('matches', 'tournaments', 'ties', 'players', 'meets', 'teams'));

-- The card registered to a mobile number or email, if any. Returns only the card id (never anyone's contact),
-- so adding "Riya, +91 98…" to a team reuses Riya's existing card instead of creating a duplicate.
create or replace function public.find_player(contact_key text) returns text
language sql stable security definer
set search_path = ''
as $$
  select c.player_id from public.player_contacts c
  where c.contact = contact_key
  order by c.created_at
  limit 1
$$;

revoke execute on function public.find_player(text) from public, anon;
grant execute on function public.find_player(text) to authenticated;

-- Adds the signed-in person's own card to a team, if the invite code is right. Returns the team's new version.
create or replace function public.join_team(team_id text, invite_code text, card_id text, player_name text) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  doc jsonb;
  new_version integer;
begin
  if public.my_identity() is null then
    raise exception 'Sign in first.';
  end if;
  if not public.owns_player(card_id) then
    raise exception 'You can only join with your own player card.';
  end if;
  select d.data into doc from public.documents d where d.collection = 'teams' and d.id = team_id for update;
  if doc is null then
    raise exception 'Team not found.';
  end if;
  if doc ->> 'inviteCode' is distinct from invite_code then
    raise exception 'This invite link is no longer valid. Ask the captain for a new one.';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(doc -> 'players', '[]'::jsonb)) as p(m) where p.m ->> 'cardId' = card_id) then
    select d.version into new_version from public.documents d where d.collection = 'teams' and d.id = team_id;
    return new_version;
  end if;
  update public.documents d
  set data = jsonb_set(
        doc,
        '{players}',
        coalesce(doc -> 'players', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'cardId', card_id,
          'name', left(trim(player_name), 80),
          'joinedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ))
      ),
      version = d.version + 1,
      updated_at = now()
  where d.collection = 'teams' and d.id = team_id
  returning d.version into new_version;
  return new_version;
end
$$;

revoke execute on function public.join_team(text, text, text, text) from public, anon;
grant execute on function public.join_team(text, text, text, text) to authenticated;
