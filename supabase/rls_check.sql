-- RLS verification.
--
-- The anon key ships inside the mobile bundle, so RLS is the only thing
-- standing between one landlord and another's data. This script proves the
-- policies actually hold by impersonating each user via request.jwt.claims,
-- exactly as PostgREST does.
--
-- Requires supabase/seed.sql to have been run first.
--   psql "$DATABASE_URL" -f supabase/rls_check.sql
--
-- Every check raises an exception on failure, so a clean run means all passed.
-- Wrapped in a transaction that always rolls back: it writes nothing.

begin;

do $check$
declare
  user_a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  user_b uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  a_active_listing uuid;
  a_draft_listing uuid;
  visible int;
  affected int;
  approx_lat double precision;
begin
  -- Look these up as the table owner, before dropping into a restricted role.
  select id into a_active_listing
  from public.listings
  where owner_id = user_a and status = 'active'
  limit 1;

  select id into a_draft_listing
  from public.listings
  where owner_id = user_a and status = 'draft'
  limit 1;

  if a_active_listing is null or a_draft_listing is null then
    raise exception 'Seed data missing. Run supabase/seed.sql first.';
  end if;

  if not exists (
    select 1 from public.listing_locations where listing_id = a_active_listing
  ) then
    raise exception 'Seed data missing a location for listing %.', a_active_listing;
  end if;

  -- The approximate point must exist and must not equal the real one. Checked
  -- as owner: a trigger that silently copied the exact pin would pass every
  -- visibility check below.
  if exists (
    select 1 from public.listings l
    join public.listing_locations p on p.listing_id = l.id
    where l.id = a_active_listing
      and (l.approx_latitude is null
           or (l.approx_latitude = p.latitude and l.approx_longitude = p.longitude))
  ) then
    raise exception 'FAIL: approximate point missing or identical to the exact pin.';
  end if;

  -- Become user B.
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );

  -- 1. B can see A's ACTIVE listing (the feed must work across landlords).
  select count(*) into visible from public.listings where id = a_active_listing;
  if visible <> 1 then
    raise exception 'FAIL: user B cannot see user A''s active listing.';
  end if;

  -- 2. B must NOT see A's DRAFT listing.
  select count(*) into visible from public.listings where id = a_draft_listing;
  if visible <> 0 then
    raise exception 'FAIL: user B can see user A''s draft listing.';
  end if;

  -- 3. B must NOT be able to update A's listing. RLS filters the rows rather
  --    than raising, so the proof is that zero rows were affected.
  update public.listings set price_rwf = 1 where id = a_active_listing;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: user B updated user A''s listing (% rows).', affected;
  end if;

  -- 4. B must NOT be able to delete A's listing.
  delete from public.listings where id = a_active_listing;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: user B deleted user A''s listing (% rows).', affected;
  end if;

  -- 5. B must NOT be able to write to A's profile.
  update public.profiles set full_name = 'hijacked' where id = user_a;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: user B modified user A''s profile.';
  end if;

  -- 5b. B must NOT see A's exact location (Blueprint rules 3/4), but MUST
  --     see the approximate point the map draws.
  select count(*) into visible
  from public.listing_locations where listing_id = a_active_listing;
  if visible <> 0 then
    raise exception 'FAIL: user B can read user A''s exact location.';
  end if;

  select approx_latitude into approx_lat
  from public.listings where id = a_active_listing;
  if approx_lat is null then
    raise exception 'FAIL: user B cannot see the approximate point.';
  end if;

  -- 5c. B must NOT be able to plant a location on A's listing.
  update public.listing_locations set latitude = 0 where listing_id = a_active_listing;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: user B moved user A''s pin.';
  end if;

  -- 6. B must NOT be able to insert a listing owned by A.
  begin
    insert into public.listings (owner_id, title, price_rwf, property_type, status)
    values (user_a, 'Forged listing', 100000, 'studio', 'active');
    raise exception 'FAIL: user B inserted a listing owned by user A.';
  exception
    when insufficient_privilege then null;  -- expected: with-check violation
  end;

  -- 7. B CAN write its own listing (the policies must not be so tight that the
  --    app stops working).
  insert into public.listings (owner_id, title, price_rwf, property_type, status)
  values (user_b, 'B own listing', 100000, 'studio', 'draft');

  update public.listings set price_rwf = 120000
  where owner_id = user_b and title = 'B own listing';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'FAIL: user B cannot update its own listing.';
  end if;

  -- 8. Anonymous users see active listings only.
  set local role anon;
  perform set_config('request.jwt.claims', null, true);

  select count(*) into visible from public.listings where id = a_draft_listing;
  if visible <> 0 then
    raise exception 'FAIL: anonymous user can see a draft listing.';
  end if;

  -- 9. Anonymous users get nothing from the exact-location table.
  select count(*) into visible from public.listing_locations;
  if visible <> 0 then
    raise exception 'FAIL: anonymous user can read exact locations.';
  end if;

  raise notice 'All RLS checks passed.';
end;
$check$;

-- Nothing above should persist.
rollback;
