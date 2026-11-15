-- Saved searches with alerts, reviews, stale-listing expiry, a second factor
-- for staff, and the check behind account deletion.

-- ---------------------------------------------------------------------------
-- saved searches (Blueprint §38)
-- ---------------------------------------------------------------------------

create table public.saved_searches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 80),
  -- The app's Filters object, exactly as the feed uses it.
  filters    jsonb not null check (jsonb_typeof(filters) = 'object'),
  created_at timestamptz not null default now()
);

create index saved_searches_user_idx on public.saved_searches (user_id, created_at desc);

alter table public.saved_searches enable row level security;

create policy saved_searches_select_own on public.saved_searches
  for select to authenticated using (user_id = auth.uid());
create policy saved_searches_insert_own on public.saved_searches
  for insert to authenticated with check (user_id = auth.uid());
create policy saved_searches_delete_own on public.saved_searches
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.saved_searches_limit()
returns trigger
language plpgsql
as $fn$
begin
  if (select count(*) from public.saved_searches where user_id = new.user_id) >= 10 then
    raise exception 'You can keep up to 10 saved searches. Delete one first.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$fn$;

create trigger saved_searches_limit
  before insert on public.saved_searches
  for each row execute function public.saved_searches_limit();

-- Whether a listing satisfies a Filters object. This is a THIRD statement of
-- the filter rules, after useListingsFeed in the app and the model's schema in
-- functions/_shared/filters.ts. It has to exist, because alerts are decided
-- here with no app running. Keep it in step with useListingsFeed: the same
-- "unstated terms match" rule, and amenities as all-of.
create or replace function public.listing_matches_filters(l public.listings, f jsonb)
returns boolean
language sql
immutable
as $fn$
  select
        (f ->> 'minPrice' is null or l.price_rwf >= (f ->> 'minPrice')::int)
    and (f ->> 'maxPrice' is null or l.price_rwf <= (f ->> 'maxPrice')::int)
    and (f ->> 'district' is null or l.district = f ->> 'district')
    and (f ->> 'sector' is null or l.sector = f ->> 'sector')
    and (f ->> 'propertyType' is null or l.property_type = f ->> 'propertyType')
    and (f ->> 'minBedrooms' is null or l.bedrooms >= (f ->> 'minBedrooms')::int)
    and (not coalesce((f ->> 'furnishedOnly')::boolean, false) or l.furnished)
    and (f ->> 'minBathrooms' is null or l.bathrooms >= (f ->> 'minBathrooms')::int)
    and (
      jsonb_typeof(f -> 'amenities') is distinct from 'array'
      or l.amenities @> array(select jsonb_array_elements_text(f -> 'amenities'))
    )
    and (f ->> 'maxMinRentalMonths' is null or l.min_rental_months is null
         or l.min_rental_months <= (f ->> 'maxMinRentalMonths')::int)
    and (f ->> 'availableBy' is null or l.available_from is null
         or l.available_from <= (f ->> 'availableBy')::date);
$fn$;

-- A listing that has just come onto the feed is announced to everyone whose
-- saved search it matches. Only on arrival from review, or on becoming
-- available again after being rented; a landlord pausing and unpausing must
-- not buzz anyone's phone.
create or replace function public.listings_notify_saved_searches()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s record;
begin
  if new.status = 'published' and old.status in ('pending_review', 'rented') then
    for s in
      select id, user_id, name from public.saved_searches
      where user_id <> new.owner_id
        and public.listing_matches_filters(new, filters)
    loop
      perform public.notify_user(
        s.user_id,
        'saved_search_match',
        'New rental for "' || s.name || '"',
        new.title || ' · ' || to_char(new.price_rwf, 'FM999,999,999') || ' RWF',
        jsonb_build_object('listing_id', new.id, 'search_id', s.id),
        -- One unread line per search, however many arrive.
        s.id::text
      );
    end loop;
  end if;
  return new;
end;
$fn$;

create trigger listings_notify_saved_searches
  after update of status on public.listings
  for each row execute function public.listings_notify_saved_searches();

-- ---------------------------------------------------------------------------
-- reviews (rule 13: tied to a completed rental)
-- ---------------------------------------------------------------------------

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  -- One review per booking, and no review without one.
  booking_id  uuid not null unique references public.bookings (id) on delete cascade,
  listing_id  uuid references public.listings (id) on delete set null,
  landlord_id uuid not null references public.profiles (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  rating      smallint not null check (rating between 1 and 5),
  body        text check (length(body) <= 1000),
  created_at  timestamptz not null default now()
);

create index reviews_listing_idx  on public.reviews (listing_id, created_at desc);
create index reviews_landlord_idx on public.reviews (landlord_id, created_at desc);

alter table public.reviews enable row level security;

-- Public, like badges: a review nobody can read is not reputation.
create policy reviews_select on public.reviews
  for select to anon, authenticated using (true);

-- No write policy. The only way in is submit_review(), which is what makes
-- "tied to a completed rental" true rather than a convention.
create or replace function public.submit_review(
  p_booking_id uuid,
  p_rating     integer,
  p_body       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b      public.bookings%rowtype;
  v_id   uuid;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found or b.renter_id is distinct from auth.uid() then
    raise exception 'Only the renter of this booking can review it.'
      using errcode = 'insufficient_privilege';
  end if;

  if b.status <> 'completed' then
    raise exception 'You can review a rental once you have moved in.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose 1 to 5 stars.' using errcode = 'invalid_parameter_value';
  end if;

  begin
    insert into public.reviews (booking_id, listing_id, landlord_id, author_id, rating, body)
    values (
      b.id, b.listing_id, b.landlord_id, auth.uid(), p_rating,
      -- A public review is not a place to publish someone's phone number.
      public.mask_contact_details(left(v_body, 1000))
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You have already reviewed this rental.'
      using errcode = 'object_not_in_prerequisite_state';
  end;

  perform public.notify_user(
    b.landlord_id, 'review_received', 'You have a new review',
    b.listing_title || ' · ' || p_rating || ' of 5',
    jsonb_build_object('listing_id', b.listing_id)
  );

  return v_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- stale listings
-- ---------------------------------------------------------------------------
-- "Availability confirmed 3 months ago" on a live listing is the stale
-- WhatsApp-group post this app exists to replace. A live listing nobody has
-- confirmed for 30 days is paused; the landlord is warned a week before, and
-- republishing (which re-confirms) is one tap.

alter table public.listings add column stale_reminded_at timestamptz;

create or replace function public.expire_stale_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  -- Listings that were live before this rule existed get their 30 days from
  -- the day it was introduced, not a mass pause on the first night.
  rule_start constant timestamptz := '2026-11-23 00:00:00+00';
  l public.listings%rowtype;
  n integer := 0;
begin
  for l in
    select * from public.listings
    where status = 'published'
      and greatest(coalesce(availability_confirmed_at, created_at), rule_start)
            < now() - interval '30 days'
    for update skip locked
  loop
    update public.listings set status = 'paused' where id = l.id;
    perform public.notify_user(
      l.owner_id, 'listing_stale_paused', 'Your listing was paused',
      l.title || ': nobody confirmed it was still available for 30 days. Republish it if it is.',
      jsonb_build_object('listing_id', l.id)
    );
    n := n + 1;
  end loop;

  for l in
    select * from public.listings
    where status = 'published'
      and greatest(coalesce(availability_confirmed_at, created_at), rule_start)
            < now() - interval '23 days'
      -- Once per confirmation: reminded already since it was last confirmed?
      and (stale_reminded_at is null
           or stale_reminded_at < coalesce(availability_confirmed_at, created_at))
    for update skip locked
  loop
    update public.listings set stale_reminded_at = now() where id = l.id;
    perform public.notify_user(
      l.owner_id, 'listing_stale_warning', 'Is your place still available?',
      l.title || ': confirm it within a week or it will be paused.',
      jsonb_build_object('listing_id', l.id)
    );
  end loop;

  return n;
end;
$fn$;

do $cron$
begin
  perform cron.schedule('expire-stale-listings', '0 6 * * *', 'select public.expire_stale_listings()');
exception when others then
  raise notice 'pg_cron not scheduled (%); stale listings will not expire.', sqlerrm;
end;
$cron$;

-- ---------------------------------------------------------------------------
-- staff: a second factor (Features #63)
-- ---------------------------------------------------------------------------
-- Staff read identity documents and suspend people, behind the same emailed
-- code as everyone else. Once a staff member has enrolled an authenticator
-- app, their role only counts in a session that has passed it (aal2). The app
-- makes staff enroll before the console opens; this is what makes it real:
-- every staff policy and function goes through has_role().
--
-- An account with no verified factor is not locked out here, on purpose. The
-- first admin is still created from the SQL editor, and refusing them until
-- they enrol would need a way to enrol without the role.
create or replace function public.has_role(r text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and (role = r or role = 'admin')
  )
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    )
  );
$fn$;

-- ---------------------------------------------------------------------------
-- account deletion: what stands in the way
-- ---------------------------------------------------------------------------
-- The deleting itself is the delete-account Edge Function, because files in
-- Storage must go through the Storage API. This says whether it may proceed,
-- in words for the person asking. Null means nothing blocks it.
create or replace function public.account_deletion_blocker()
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return 'Sign in first.';
  end if;

  if exists (
    select 1 from public.bookings
    where (renter_id = v_uid or landlord_id = v_uid)
      and status in ('requested', 'accepted', 'confirmed')
  ) then
    return 'You have a booking in progress. Cancel it, or wait until it is finished, then delete your account.';
  end if;

  if exists (select 1 from public.user_roles where user_id = v_uid and role = 'admin')
     and (select count(*) from public.user_roles where role = 'admin') <= 1 then
    return 'You are the only admin. Make someone else an admin first.';
  end if;

  return null;
end;
$fn$;

revoke execute on function public.expire_stale_listings() from public, anon, authenticated;
revoke execute on function public.submit_review(uuid, integer, text) from public, anon;
revoke execute on function public.account_deletion_blocker() from public, anon;
grant execute on function public.submit_review(uuid, integer, text) to authenticated;
grant execute on function public.account_deletion_blocker() to authenticated;
