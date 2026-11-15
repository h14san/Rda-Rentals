-- An approved listing goes back to review when its location or photos change.
--
-- Until now an approved listing could be edited freely and kept its badges.
-- A landlord could have a real flat approved, then swap the photos and move
-- the pin, and the "Property checked" badge would vouch for something nobody
-- had looked at. Decided 2026-11-19 (work plan M6):
--
--   location or photos changed  -> back to review, and the badges that the
--                                  change invalidates are removed
--   rent, terms, description    -> no review; rent changes are already visible
--                                  to people who saved it (price_at_save)

alter table public.listings
  -- Why the listing must be reviewed again, or null. Set and cleared only by
  -- the database. 'location' outranks 'photos'.
  add column review_reason text check (review_reason in ('location', 'photos'));

alter table public.verification_cases
  -- Copied from the listing when the case opens, so the reviewer sees why an
  -- already-approved listing is back in the queue.
  add column reopen_reason text check (reopen_reason in ('location', 'photos'));

-- ---------------------------------------------------------------------------
-- the one place a material edit is handled
-- ---------------------------------------------------------------------------
-- Internal: execute is revoked from every client role below. Called by the
-- triggers further down, which fire on the owner's own writes.

create or replace function public.listing_material_edit(p_listing_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  l public.listings%rowtype;
begin
  select * into l from public.listings where id = p_listing_id for update;

  -- Not found covers a listing in the middle of being deleted, whose photo
  -- rows are cascading away. Only the owner's own edits count: staff do not
  -- edit listings, and a function restoring one must not trip this.
  if not found or l.owner_id is distinct from auth.uid() then
    return;
  end if;

  -- Only listings that have been through review. A draft, a rejected listing
  -- or one already in review is going to be looked at anyway.
  if l.status not in ('published', 'paused', 'unavailable', 'rented') then
    return;
  end if;

  -- A new location is a different property: every listing check is void.
  -- New photos void only the check that looked at the photos.
  delete from public.listing_badges
  where listing_id = l.id
    and (p_kind = 'location' or kind = 'information_checked');

  if l.status = 'published' then
    -- listings_open_review_case fires on this update and opens the case.
    update public.listings
    set status = 'pending_review',
        review_reason = case when l.review_reason = 'location' then 'location' else p_kind end
    where id = l.id;
  else
    -- Paused, unavailable or rented: nothing is public, so nothing needs to
    -- leave. The reason is remembered and the guard trigger turns the next
    -- "republish" into "submit for review". Without this, pausing first would
    -- be a way around the whole rule.
    update public.listings
    set review_reason = case when l.review_reason = 'location' then 'location' else p_kind end
    where id = l.id;
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- what counts as a material edit
-- ---------------------------------------------------------------------------

create or replace function public.listing_locations_material_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'DELETE' then
    perform public.listing_material_edit(old.listing_id, 'location');
    return old;
  end if;

  -- The edit screen upserts the location on every save. Unchanged values are
  -- not an edit.
  if tg_op = 'INSERT' then
    if new.address is not null or new.latitude is not null or new.longitude is not null then
      perform public.listing_material_edit(new.listing_id, 'location');
    end if;
  elsif new.address is distinct from old.address
     or new.latitude is distinct from old.latitude
     or new.longitude is distinct from old.longitude then
    perform public.listing_material_edit(new.listing_id, 'location');
  end if;
  return new;
end;
$fn$;

create trigger listing_locations_material_edit
  after insert or update or delete on public.listing_locations
  for each row execute function public.listing_locations_material_edit();

-- The district and sector are the public half of the location.
create or replace function public.listings_material_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.district is distinct from old.district or new.sector is distinct from old.sector then
    perform public.listing_material_edit(new.id, 'location');
  end if;
  return new;
end;
$fn$;

create trigger listings_material_edit
  after update of district, sector on public.listings
  for each row execute function public.listings_material_edit();

-- Adding or removing a photo. Reordering (position) is not a new photo.
create or replace function public.listing_images_material_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'DELETE' then
    perform public.listing_material_edit(old.listing_id, 'photos');
    return old;
  end if;
  if tg_op = 'INSERT' or new.storage_path is distinct from old.storage_path then
    perform public.listing_material_edit(new.listing_id, 'photos');
  end if;
  return new;
end;
$fn$;

create trigger listing_images_material_edit
  after insert or update or delete on public.listing_images
  for each row execute function public.listing_images_material_edit();

-- ---------------------------------------------------------------------------
-- the guard learns about review_reason
-- ---------------------------------------------------------------------------

create or replace function public.listings_guard_status()
returns trigger
language plpgsql
as $fn$
declare
  allowed text[];
begin
  if current_user <> 'authenticated' then
    -- Staff approving the listing settles whatever sent it back.
    if tg_op = 'UPDATE' and new.status = 'published' and old.status = 'pending_review' then
      new.review_reason := null;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New listings start as drafts.'
        using errcode = 'insufficient_privilege';
    end if;
    new.availability_confirmed_at := null;
    new.review_reason := null;
    return new;
  end if;

  -- A landlord cannot clear, or invent, the reason their listing needs review.
  new.review_reason := old.review_reason;

  -- Confirming availability is stamped by the server clock, whatever the
  -- client sent, so a listing cannot claim to have been confirmed tomorrow.
  if new.availability_confirmed_at is distinct from old.availability_confirmed_at then
    new.availability_confirmed_at := now();
  end if;

  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'draft'          then array['pending_review']
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

  if new.status = 'published' then
    if old.review_reason is not null then
      -- Its location or photos changed while it was off the feed. Republishing
      -- is a request for review, not a publication.
      new.status := 'pending_review';
    else
      -- Going live is itself a confirmation that the place is available.
      new.availability_confirmed_at := now();
    end if;
  end if;

  return new;
end;
$fn$;

-- The case records why it was reopened.
create or replace function public.listings_open_review_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_case uuid;
begin
  if new.status = 'pending_review' and old.status is distinct from 'pending_review' then
    select id into v_case
    from public.verification_cases
    where subject_type = 'listing' and listing_id = new.id
      and status in ('submitted', 'changes_requested');

    if v_case is null then
      insert into public.verification_cases (subject_type, profile_id, listing_id, reopen_reason)
      values ('listing', new.owner_id, new.id, new.review_reason)
      returning id into v_case;

      insert into public.verification_events (case_id, action, note)
      values (
        v_case,
        case when new.review_reason is null then 'submitted' else 'reopened_for_review' end,
        case new.review_reason
          when 'location' then 'The landlord changed the location.'
          when 'photos' then 'The landlord changed the photos.'
        end
      );
    end if;
  end if;
  return new;
end;
$fn$;

revoke execute on function public.listing_material_edit(uuid, text)
  from public, anon, authenticated;
