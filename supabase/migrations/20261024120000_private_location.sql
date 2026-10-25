-- Exact location becomes private; listings carry only an approximate point.
--
-- Blueprint rules 3 and 4: no exact address or map pin before the appropriate
-- booking stage. Until now address/latitude/longitude sat on `listings`, whose
-- select policy is open to anon, so the exact pin was one REST call away for
-- anyone holding the (extractable) anon key. Hiding it in the UI would not
-- have helped; it has to leave the publicly readable row.
--
-- Also drops profiles.phone: it duplicated auth.users.phone and was readable by
-- every signed-in user, which is Blueprint rule 1 broken for no benefit.

-- ---------------------------------------------------------------------------
-- listing_locations
-- ---------------------------------------------------------------------------

create table public.listing_locations (
  listing_id     uuid primary key references public.listings (id) on delete cascade,
  address        text,
  latitude       double precision check (latitude between -90 and 90),
  longitude      double precision check (longitude between -180 and 180),
  -- Random, fixed for the life of the row. A deterministic offset (e.g. hashed
  -- from the listing id) would be reversible by anyone reading this migration,
  -- and a fresh offset per write would let repeated edits be averaged back to
  -- the real point.
  offset_bearing double precision not null default (random() * 2 * pi()),
  offset_m       double precision not null default (500 * sqrt(random())),
  updated_at     timestamptz not null default now()
);

comment on column public.listing_locations.offset_m is
  'Uniform over a 500 m disc (sqrt of a uniform draw), so the real point is equally likely anywhere in the circle the app draws around the approximate one.';

alter table public.listings
  add column approx_latitude  double precision,
  add column approx_longitude double precision;

-- Offsets are set once. Without this an owner could zero them; that only
-- exposes their own property, but the approximate point should mean the same
-- thing on every listing.
create or replace function public.listing_locations_keep_offset()
returns trigger
language plpgsql
as $fn$
begin
  new.offset_bearing := old.offset_bearing;
  new.offset_m := old.offset_m;
  new.updated_at := now();
  return new;
end;
$fn$;

create trigger listing_locations_keep_offset
  before update on public.listing_locations
  for each row execute function public.listing_locations_keep_offset();

-- Security definer because the approximate point is derived data: the caller
-- has already passed the owner-only policy on listing_locations, and this only
-- ever writes the two approx columns of that same listing.
create or replace function public.listing_locations_sync_approx()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  loc public.listing_locations;
begin
  if tg_op = 'DELETE' then
    update public.listings
    set approx_latitude = null, approx_longitude = null
    where id = old.listing_id;
    return old;
  end if;

  loc := new;
  if loc.latitude is null or loc.longitude is null then
    update public.listings
    set approx_latitude = null, approx_longitude = null
    where id = loc.listing_id;
  else
    -- Flat-earth offset: exact to well under a metre at 500 m, and Kigali is
    -- two degrees from the equator, so the longitude correction barely moves.
    update public.listings
    set approx_latitude  = loc.latitude + (loc.offset_m * cos(loc.offset_bearing)) / 111320.0,
        approx_longitude = loc.longitude
          + (loc.offset_m * sin(loc.offset_bearing)) / (111320.0 * cos(radians(loc.latitude)))
    where id = loc.listing_id;
  end if;
  return new;
end;
$fn$;

create trigger listing_locations_sync_approx
  after insert or update or delete on public.listing_locations
  for each row execute function public.listing_locations_sync_approx();

-- ---------------------------------------------------------------------------
-- move existing data, then drop the public columns
-- ---------------------------------------------------------------------------

insert into public.listing_locations (listing_id, address, latitude, longitude)
select id, address, latitude, longitude
from public.listings
where address is not null or latitude is not null or longitude is not null;

alter table public.listings
  drop column address,
  drop column latitude,
  drop column longitude;

-- ---------------------------------------------------------------------------
-- RLS: owner only. Phase 4 (booking) adds the confirmed renter.
-- ---------------------------------------------------------------------------

alter table public.listing_locations enable row level security;

create policy listing_locations_owner on public.listing_locations
  for all to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- profiles.phone
-- ---------------------------------------------------------------------------
-- The login number already lives in auth.users and reaches the owner's own
-- client through the session. A public copy is a leak with no reader.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$fn$;

alter table public.profiles drop column phone;
