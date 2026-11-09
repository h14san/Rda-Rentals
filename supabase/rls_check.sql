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
  -- Verification staff. Created below and rolled back with everything else,
  -- so the check does not depend on the seed having a staff account.
  user_c uuid := 'aaaaaaaa-0000-4000-8000-0000000000c3';
  a_case uuid;
  b_case uuid;
  b_listing uuid;
  a_active_listing uuid;
  a_draft_listing uuid;
  visible int;
  affected int;
  approx_lat double precision;
begin
  -- Look these up as the table owner, before dropping into a restricted role.
  select id into a_active_listing
  from public.listings
  where owner_id = user_a and status = 'published'
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

  -- Verification fixtures, as the table owner: a staff account, and an open
  -- identity case for A with one evidence row and its storage object. B starts
  -- with no identity badge, whatever the seed did.
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', user_c,
          'authenticated', 'authenticated', 'rls.check.staff@example.com', now(), now())
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (user_c, 'verifier')
  on conflict do nothing;

  delete from public.profile_badges where profile_id = user_b;
  delete from public.verification_cases where profile_id in (user_a, user_b)
    and status in ('submitted', 'changes_requested');

  insert into public.verification_cases (subject_type, profile_id)
  values ('landlord', user_a) returning id into a_case;
  insert into public.verification_evidence (case_id, kind, storage_path)
  values (a_case, 'id_document', user_a || '/' || a_case || '/rls-check.jpg');
  insert into storage.objects (bucket_id, name, owner)
  values ('verification-evidence', user_a || '/' || a_case || '/rls-check.jpg', user_a);

  -- Become user B.
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );

  -- 1. B can see A's PUBLISHED listing (the feed must work across landlords).
  select count(*) into visible from public.listings where id = a_active_listing;
  if visible <> 1 then
    raise exception 'FAIL: user B cannot see user A''s published listing.';
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
    values (user_a, 'Forged listing', 100000, 'studio', 'draft');
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

  -- 7b. A landlord cannot skip moderation (rule 9). A draft goes to review,
  --     never straight to published; suspending or approving is staff-only.
  begin
    update public.listings set status = 'published'
    where owner_id = user_b and title = 'B own listing';
    raise exception 'FAIL: user B published a draft without review.';
  exception
    when insufficient_privilege then null;
  end;

  update public.listings set status = 'pending_review'
  where owner_id = user_b and title = 'B own listing'
  returning id into b_listing;

  if b_listing is null then
    raise exception 'FAIL: user B cannot submit its own draft for review.';
  end if;

  select count(*) into visible
  from public.verification_cases
  where listing_id = b_listing and subject_type = 'listing' and status = 'submitted';
  if visible <> 1 then
    raise exception 'FAIL: submitting for review opened % cases, expected 1.', visible;
  end if;

  begin
    update public.listings set status = 'suspended'
    where owner_id = user_b and title = 'B own listing';
    raise exception 'FAIL: user B set its own listing to suspended.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.listings (owner_id, title, price_rwf, property_type, status)
    values (user_b, 'Born published', 100000, 'studio', 'published');
    raise exception 'FAIL: user B inserted a listing that skipped draft.';
  exception
    when insufficient_privilege then null;
  end;

  -- 7c. Availability confirmation is stamped with the server clock.
  update public.listings set availability_confirmed_at = '2100-01-01'
  where owner_id = user_b and title = 'B own listing';
  if exists (
    select 1 from public.listings
    where owner_id = user_b and title = 'B own listing'
      and availability_confirmed_at > now() + interval '1 minute'
  ) then
    raise exception 'FAIL: a client-supplied availability date was stored.';
  end if;

  -- 7d. Status history: B reads its own, never A's.
  select count(*) into visible
  from public.listing_status_history h
  join public.listings l on l.id = h.listing_id
  where l.owner_id = user_b and l.title = 'B own listing';
  if visible < 2 then
    raise exception 'FAIL: user B cannot read its own status history (% rows).', visible;
  end if;

  select count(*) into visible
  from public.listing_status_history where listing_id = a_active_listing;
  if visible <> 0 then
    raise exception 'FAIL: user B can read user A''s status history.';
  end if;

  -- 7e. Favorites: B saves A's published listing and still sees it after A
  --     marks it rented; B cannot save a listing that is not published, and
  --     cannot read anyone else's favorites.
  insert into public.favorites (user_id, listing_id) values (user_b, a_active_listing);

  if not exists (
    select 1 from public.favorites
    where user_id = user_b and listing_id = a_active_listing and price_at_save is not null
  ) then
    raise exception 'FAIL: favorite was not saved with its price.';
  end if;

  begin
    insert into public.favorites (user_id, listing_id) values (user_b, a_draft_listing);
    raise exception 'FAIL: user B favorited a draft listing.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.favorites (user_id, listing_id) values (user_a, a_active_listing);
    raise exception 'FAIL: user B created a favorite for user A.';
  exception
    when insufficient_privilege then null;
  end;

  -- Become A for a moment to mark the listing rented, then back to B.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );
  update public.listings set status = 'rented' where id = a_active_listing;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.listings where id = a_active_listing;
  if visible <> 1 then
    raise exception 'FAIL: a favorited listing vanished once it was rented.';
  end if;

  -- 10. Verification, as B: another landlord's case, documents and roles are
  --     invisible; badges, roles and decisions cannot be forged.
  select count(*) into visible from public.verification_cases where profile_id = user_a;
  if visible <> 0 then
    raise exception 'FAIL: user B can read user A''s verification case.';
  end if;

  select count(*) into visible from public.verification_evidence where case_id = a_case;
  if visible <> 0 then
    raise exception 'FAIL: user B can read user A''s evidence rows.';
  end if;

  select count(*) into visible from storage.objects
  where bucket_id = 'verification-evidence' and name like user_a || '/%';
  if visible <> 0 then
    raise exception 'FAIL: user B can read user A''s identity documents.';
  end if;

  select count(*) into visible from public.user_roles where user_id = user_c;
  if visible <> 0 then
    raise exception 'FAIL: user B can see who the staff are.';
  end if;

  select count(*) into visible from public.verification_cases where listing_id = b_listing;
  if visible <> 1 then
    raise exception 'FAIL: user B cannot read its own listing''s case.';
  end if;

  begin
    insert into public.profile_badges (profile_id, kind) values (user_b, 'identity_checked');
    raise exception 'FAIL: user B gave itself an identity badge.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.listing_badges (listing_id, kind) values (b_listing, 'existence_checked');
    raise exception 'FAIL: user B gave its listing a badge.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.user_roles (user_id, role) values (user_b, 'admin');
    raise exception 'FAIL: user B made itself an admin.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.verification_evidence (case_id, kind, storage_path)
    values (a_case, 'other', user_b || '/' || a_case || '/planted.jpg');
    raise exception 'FAIL: user B added evidence to user A''s case.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.decide_verification(a_case, 'approved');
    raise exception 'FAIL: user B decided a verification case.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform * from public.staff_listing_location(b_listing);
    raise exception 'FAIL: user B called the staff location function.';
  exception
    when insufficient_privilege then null;
  end;

  b_case := public.request_identity_verification();
  if b_case is null then
    raise exception 'FAIL: user B cannot open an identity case.';
  end if;

  -- 11. Verification, as C (staff).
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_c, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.listings where id = b_listing;
  if visible <> 1 then
    raise exception 'FAIL: staff cannot see a listing waiting for review.';
  end if;

  select count(*) into visible from public.verification_evidence where case_id = a_case;
  if visible <> 1 then
    raise exception 'FAIL: staff cannot see submitted evidence.';
  end if;

  select count(*) into visible from storage.objects
  where bucket_id = 'verification-evidence' and name like user_a || '/%';
  if visible <> 1 then
    raise exception 'FAIL: staff cannot read submitted documents.';
  end if;

  -- Staff still cannot read exact locations directly; only via the function,
  -- which logs the look.
  select count(*) into visible from public.listing_locations where listing_id = b_listing;
  if visible <> 0 then
    raise exception 'FAIL: staff read listing_locations directly.';
  end if;

  perform * from public.staff_listing_location(b_listing);
  select count(*) into visible from public.verification_events e
  join public.verification_cases c on c.id = e.case_id
  where c.listing_id = b_listing and e.action = 'viewed_location';
  if visible <> 1 then
    raise exception 'FAIL: a staff look at an exact location was not logged.';
  end if;

  -- Rule 9: the listing cannot be approved before its landlord is checked.
  begin
    perform public.decide_verification(
      (select id from public.verification_cases where listing_id = b_listing),
      'approved', null, array['existence_checked']);
    raise exception 'FAIL: a listing was approved before its landlord''s identity.';
  exception
    when raise_exception then
      if sqlerrm not like '%identity before approving%' then raise; end if;
  end;

  begin
    perform public.decide_verification(b_case, 'rejected', '');
    raise exception 'FAIL: a case was refused without a note.';
  exception
    when invalid_parameter_value then null;
  end;

  perform public.decide_verification(b_case, 'approved');
  if not exists (
    select 1 from public.profile_badges where profile_id = user_b and kind = 'identity_checked'
  ) then
    raise exception 'FAIL: approving identity did not record the badge.';
  end if;

  perform public.decide_verification(
    (select id from public.verification_cases where listing_id = b_listing),
    'approved', null, array['existence_checked', 'authorization_checked']);

  if not exists (
    select 1 from public.listings where id = b_listing and status = 'published'
  ) then
    raise exception 'FAIL: an approved listing was not published.';
  end if;

  select count(*) into visible from public.listing_badges where listing_id = b_listing;
  if visible <> 2 then
    raise exception 'FAIL: approving recorded % listing badges, expected 2.', visible;
  end if;

  begin
    perform * from public.staff_listing_location(b_listing);
    raise exception 'FAIL: staff read a location with no open review.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.decide_verification(b_case, 'rejected', 'second thoughts');
    raise exception 'FAIL: a decided case was decided again.';
  exception
    when raise_exception then
      if sqlerrm not like '%already been decided%' then raise; end if;
  end;

  -- Staff cannot approve themselves.
  begin
    perform public.decide_verification(public.request_identity_verification(), 'approved');
    raise exception 'FAIL: a reviewer approved their own identity.';
  exception
    when insufficient_privilege then null;
  end;

  -- 8. Anonymous users see published listings only.
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

  -- 12. Anonymous users see badges, but no cases, documents or staff functions.
  select count(*) into visible from public.listing_badges where listing_id = b_listing;
  if visible <> 2 then
    raise exception 'FAIL: anonymous user cannot see listing badges.';
  end if;

  begin
    select count(*) into visible from public.verification_cases;
    if visible <> 0 then
      raise exception 'FAIL: anonymous user can read verification cases.';
    end if;
  exception
    when insufficient_privilege then null;  -- no grant at all is also a pass
  end;

  begin
    select count(*) into visible from public.verification_evidence;
    if visible <> 0 then
      raise exception 'FAIL: anonymous user can read evidence rows.';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.request_identity_verification();
    raise exception 'FAIL: anonymous user opened a verification case.';
  exception
    when insufficient_privilege then null;
  end;

  raise notice 'All RLS checks passed.';
end;
$check$;

-- Nothing above should persist.
rollback;
