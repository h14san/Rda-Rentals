-- Structured rental terms and the full listing status model.
--
-- Features #6: rent alone is not enough to compare two places; deposit,
-- minimum stay and move-in date decide whether a renter can take it at all.
-- Features #5/#8/#9: listings show a clear state, and when availability was
-- last confirmed, because a stale "available" is the WhatsApp-group problem
-- this app exists to fix.

-- ---------------------------------------------------------------------------
-- terms
-- ---------------------------------------------------------------------------

alter table public.listings
  add column bathrooms         smallint check (bathrooms between 0 and 20),
  add column size_sqm          integer  check (size_sqm between 5 and 5000),
  -- Integer RWF, like price.
  add column deposit_rwf       integer  check (deposit_rwf >= 0),
  -- The landlord's minimum, in months. Null means not stated, not "no minimum".
  add column min_rental_months smallint check (min_rental_months between 1 and 60),
  -- Null means available now.
  add column available_from    date,
  -- Vocabulary lives in src/lib/amenities.ts, the same way place names live in
  -- locations.ts. Not checked here: an unknown key matches no filter and shows
  -- no label, which is harmless, whereas a SQL copy of the list would drift.
  add column amenities         text[] not null default '{}'
                                 check (cardinality(amenities) <= 30);

-- `@>` on amenities is the only array filter the app issues.
create index listings_amenities_idx on public.listings using gin (amenities);

-- ---------------------------------------------------------------------------
-- status
-- ---------------------------------------------------------------------------

alter table public.listings drop constraint listings_status_check;

update public.listings set status = 'published' where status = 'active';
update public.listings set status = 'paused'    where status = 'archived';

alter table public.listings
  add constraint listings_status_check check (status in (
    'draft', 'pending_review', 'published', 'paused',
    'unavailable', 'rented', 'rejected', 'suspended'
  )),
  add column availability_confirmed_at timestamptz;

update public.listings
set availability_confirmed_at = updated_at
where status = 'published';

-- The feed index was keyed on the old 'active' literal only through queries,
-- so it still serves `status = 'published'` unchanged.

-- Public visibility follows the rename.
drop policy listings_select_active_or_own on public.listings;
create policy listings_select_published_or_own on public.listings
  for select to anon, authenticated
  using (status = 'published' or owner_id = auth.uid());

drop policy listing_images_select on public.listing_images;
create policy listing_images_select on public.listing_images
  for select to anon, authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and (l.status = 'published' or l.owner_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- what a landlord may do
-- ---------------------------------------------------------------------------
-- Enforced here, not in the UI: the anon key is extractable, so a hidden
-- button is not a rule. Requests through PostgREST run as `authenticated`;
-- anything else (SQL editor, service role, a future admin function) is staff
-- and is not restricted by this trigger.
--
-- Until verification exists (Phase 3), draft -> published is allowed directly.
-- Phase 3 removes 'published' from the draft row below and adds
-- pending_review, which is the one-line switch the plan calls for.

create or replace function public.listings_guard_status()
returns trigger
language plpgsql
as $fn$
declare
  allowed text[];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New listings start as drafts.'
        using errcode = 'insufficient_privilege';
    end if;
    new.availability_confirmed_at := null;
    return new;
  end if;

  -- Confirming availability is stamped by the server clock, whatever the
  -- client sent, so a listing cannot claim to have been confirmed tomorrow.
  if new.availability_confirmed_at is distinct from old.availability_confirmed_at then
    new.availability_confirmed_at := now();
  end if;

  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'draft'          then array['published']
    when 'published'      then array['paused', 'unavailable', 'rented']
    when 'paused'         then array['published', 'unavailable', 'rented']
    when 'unavailable'    then array['published', 'paused', 'rented']
    when 'rented'         then array['published', 'paused', 'unavailable']
    -- A rejected listing goes back to draft to be fixed and resubmitted.
    when 'rejected'       then array['draft']
    -- pending_review and suspended are decided by staff only.
    else array[]::text[]
  end;

  if not (new.status = any (allowed)) then
    raise exception 'A listing cannot move from % to %.', old.status, new.status
      using errcode = 'insufficient_privilege';
  end if;

  -- Going live is itself a confirmation that the place is available.
  if new.status = 'published' then
    new.availability_confirmed_at := now();
  end if;

  return new;
end;
$fn$;

create trigger listings_guard_status
  before insert or update on public.listings
  for each row execute function public.listings_guard_status();

-- ---------------------------------------------------------------------------
-- status history
-- ---------------------------------------------------------------------------
-- The audit trail moderation will need, and what lets favorites say when a
-- saved place stopped being available.

create table public.listing_status_history (
  id          bigint generated always as identity primary key,
  listing_id  uuid not null references public.listings (id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid default auth.uid(),
  changed_at  timestamptz not null default now()
);

create index listing_status_history_listing_idx
  on public.listing_status_history (listing_id, changed_at desc);

create or replace function public.listings_record_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.listing_status_history (listing_id, from_status, to_status)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status);
  end if;
  return new;
end;
$fn$;

create trigger listings_record_status
  after insert or update on public.listings
  for each row execute function public.listings_record_status();

alter table public.listing_status_history enable row level security;

-- Read-only to the owner. Rows are written only by the trigger above, so there
-- is deliberately no insert/update/delete policy.
create policy listing_status_history_owner on public.listing_status_history
  for select to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = auth.uid()
  ));
