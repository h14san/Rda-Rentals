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

-- Contact masking fixtures. Pure functions, so no impersonation is needed.
-- The traps are the false positives: a price or a date read as a phone number
-- would make every conversation about rent unreadable.
do $mask$
declare
  s text;
  must_mask text[] := array[
    '0788123456',
    'Call me on 0788123456 please',
    '078 812 3456',
    '0788 123 456',
    '07.88.12.34.56',
    '0722-123-456',
    '+250788123456',
    '+250 788 123 456',
    '250788123456',
    '250 788 123 456',
    'my number is 788123456',
    '+254 712 345 678',
    'write to me.name+rent@example.co.rw',
    'dial *182*1*1*0788123456*5000# now',
    'use *182# to pay'
  ];
  must_keep text[] := array[
    '250,000 RWF',
    '250 000 RWF',
    'Rent is 250000 RWF per month',
    'The deposit is 780000',
    'Available from 2026-11-15',
    'I can visit on 15/07/2026',
    '15-07-2026 at 10:30',
    '2 bedrooms, 3 bathrooms, 120 m2',
    'between 300000 and 350000',
    '730000 or 800000',
    'KG 123 St, near the market',
    'Call me after 7',
    'Is 7 pm ok? I finish at 6:30',
    'the room is 3 * 4 metres'
  ];
  must_flag text[] := array[
    'see https://example.com/house',
    'www.cheap-houses.rw has more',
    'look at myhouse.com',
    'Please send money first',
    'Pay first and I will send the address',
    'whatsapp me',
    'ohereza amafaranga kuri momo',
    'Banza wishyure',
    'il faut payer d''abord',
    'envoyer l''argent par virement'
  ];
  must_not_flag text[] := array[
    'Is the house still available?',
    'How much is the deposit?',
    'I can come on Monday at 10.',
    'Rent is 250.000 per month',
    'Murakoze, nzaza ejo'
  ];
begin
  foreach s in array must_mask loop
    if public.mask_contact_details(s) !~ '•••'
       or public.mask_contact_details(s) ~ '\d{3}'
       or public.mask_contact_details(s) ~ '@' then
      raise exception 'FAIL: contact details survived masking: "%" -> "%"',
        s, public.mask_contact_details(s);
    end if;
  end loop;

  foreach s in array must_keep loop
    if public.mask_contact_details(s) <> s then
      raise exception 'FAIL: masking changed an innocent message: "%" -> "%"',
        s, public.mask_contact_details(s);
    end if;
  end loop;

  foreach s in array must_flag loop
    if not public.message_is_suspicious(s) then
      raise exception 'FAIL: not flagged: "%"', s;
    end if;
  end loop;

  foreach s in array must_not_flag loop
    if public.message_is_suspicious(s) then
      raise exception 'FAIL: an innocent message was flagged: "%"', s;
    end if;
  end loop;
end;
$mask$;

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
  a_report uuid;
  b_report uuid;
  v_status text;
  conv uuid;
  a_message uuid;
  b_message uuid;
  m_report uuid;
  transcript jsonb;
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

  -- 13. Reports and moderation.
  --     As B: report A's listing (B can see it, having saved it).
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );

  -- Staff fields are reset whatever the client sends.
  insert into public.reports (reporter_id, target_type, target_id, reason, status, severity)
  values (user_b, 'listing', a_active_listing, 'scam', 'resolved', 'high')
  returning id into a_report;

  if not exists (
    select 1 from public.reports
    where id = a_report and status = 'open' and severity is null
  ) then
    raise exception 'FAIL: a reporter set the status or severity of their own report.';
  end if;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values (user_b, 'listing', a_active_listing, 'incorrect_price');
    raise exception 'FAIL: user B reported the same listing twice.';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values (user_a, 'user', user_c, 'scam');
    raise exception 'FAIL: user B filed a report in user A''s name.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, note)
    values (user_b, 'user', user_a, 'other', '   ');
    raise exception 'FAIL: an "other" report was accepted without a note.';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values (user_b, 'listing', b_listing, 'scam');
    raise exception 'FAIL: user B reported its own listing.';
  exception
    when insufficient_privilege then null;
  end;

  -- A listing B cannot see cannot be reported, so reporting is not a probe.
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values (user_b, 'listing', a_draft_listing, 'scam');
    raise exception 'FAIL: user B reported a listing it cannot see.';
  exception
    when no_data_found then null;
  end;

  update public.reports set status = 'dismissed' where id = a_report;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: a reporter changed a report directly.';
  end if;

  delete from public.reports where id = a_report;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: a reporter deleted a report.';
  end if;

  begin
    perform public.triage_report(a_report, 'high');
    raise exception 'FAIL: user B triaged a report.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.resolve_report(a_report, 'resolved', 'done');
    raise exception 'FAIL: user B resolved a report.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.moderate_listing(a_active_listing, 'suspend', 'because');
    raise exception 'FAIL: user B suspended a listing.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.restrict_account(user_a, 'suspend', 'because');
    raise exception 'FAIL: user B suspended an account.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.account_restrictions (user_id, note) values (user_a, 'forged');
    raise exception 'FAIL: user B wrote an account restriction.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.moderation_events (action, subject_type, subject_id)
    values ('forged', 'user', user_a);
    raise exception 'FAIL: user B wrote to the moderation log.';
  exception
    when insufficient_privilege then null;
  end;

  --     As A: the reported party sees no trace of the report.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.reports;
  if visible <> 0 then
    raise exception 'FAIL: user A can read a report made about its listing.';
  end if;

  --     As C (staff): triage, then suspend through the report.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_c, 'role', 'authenticated')::text,
    true
  );

  perform public.triage_report(a_report, 'high');
  if not exists (
    select 1 from public.reports
    where id = a_report and status = 'in_review' and severity = 'high'
  ) then
    raise exception 'FAIL: triage did not record severity and in_review.';
  end if;

  begin
    perform public.moderate_listing(a_active_listing, 'suspend', '  ', a_report);
    raise exception 'FAIL: a listing was suspended without a note.';
  exception
    when invalid_parameter_value then null;
  end;

  perform public.moderate_listing(a_active_listing, 'suspend', 'Reported as a scam.', a_report);

  if not exists (
    select 1 from public.reports
    where id = a_report and status = 'resolved' and action_taken = 'listing_suspended'
  ) then
    raise exception 'FAIL: suspending through a report did not resolve it.';
  end if;

  select count(*) into visible from public.moderation_events
  where subject_type = 'listing' and subject_id = a_active_listing
    and action = 'listing_suspend' and actor = user_c and report_id = a_report;
  if visible <> 1 then
    raise exception 'FAIL: the suspension was not logged (% rows).', visible;
  end if;

  --     As B: the saved listing is gone, and the report shows its result.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.listings where id = a_active_listing;
  if visible <> 0 then
    raise exception 'FAIL: a suspended listing is still visible to someone who saved it.';
  end if;

  select count(*) into visible from public.reports
  where id = a_report and status = 'resolved';
  if visible <> 1 then
    raise exception 'FAIL: user B cannot read the result of its own report.';
  end if;

  select count(*) into visible from public.moderation_events;
  if visible <> 0 then
    raise exception 'FAIL: user B can read the moderation log.';
  end if;

  select count(*) into visible from public.listing_suspensions;
  if visible <> 0 then
    raise exception 'FAIL: user B can read why user A''s listing was suspended.';
  end if;

  --     As A: reads the reason, cannot lift it, and is not told who did it.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.listing_suspensions
  where listing_id = a_active_listing and lifted_at is null;
  if visible <> 1 then
    raise exception 'FAIL: user A cannot read why its listing was suspended.';
  end if;

  begin
    update public.listings set status = 'published' where id = a_active_listing;
    raise exception 'FAIL: user A lifted its own suspension.';
  exception
    when insufficient_privilege then null;
  end;

  select count(*) into visible from public.listing_status_history
  where listing_id = a_active_listing and to_status = 'suspended' and changed_by is not null;
  if visible <> 0 then
    raise exception 'FAIL: the status history names the staff member who suspended.';
  end if;

  --     As C: restore returns it to what it was (rented), never to published.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_c, 'role', 'authenticated')::text,
    true
  );

  perform public.moderate_listing(a_active_listing, 'restore', 'Checked, it is genuine.');
  select status into v_status from public.listings where id = a_active_listing;
  if v_status <> 'rented' then
    raise exception 'FAIL: restore put the listing in %, expected rented.', v_status;
  end if;

  begin
    perform public.restrict_account(user_c, 'suspend', 'self');
    raise exception 'FAIL: staff restricted their own account.';
  exception
    when insufficient_privilege then null;
  end;

  --     Restrict B. Its published listing leaves public reads; B keeps its own.
  perform public.restrict_account(user_b, 'suspend', 'Repeated misleading listings.');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.listings where id = b_listing;
  if visible <> 0 then
    raise exception 'FAIL: a suspended account''s listing is still public.';
  end if;

  select count(*) into visible from public.account_restrictions;
  if visible <> 0 then
    raise exception 'FAIL: user A can read user B''s restriction.';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.listings where id = b_listing;
  if visible <> 1 then
    raise exception 'FAIL: a suspended account cannot see its own listing.';
  end if;

  select count(*) into visible from public.account_restrictions
  where user_id = user_b and lifted_at is null;
  if visible <> 1 then
    raise exception 'FAIL: a suspended account cannot read why.';
  end if;

  begin
    insert into public.listings (owner_id, title, price_rwf, property_type, status)
    values (user_b, 'Posted while suspended', 100000, 'studio', 'draft');
    raise exception 'FAIL: a suspended account posted a listing.';
  exception
    when insufficient_privilege then null;
  end;

  update public.account_restrictions set lifted_at = now() where user_id = user_b;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: a suspended account lifted its own restriction.';
  end if;

  --     B reports A as a user; staff dismiss it, and must say why.
  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (user_b, 'user', user_a, 'harassment')
  returning id into b_report;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_c, 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.resolve_report(b_report, 'dismissed', null);
    raise exception 'FAIL: a report was closed without a note to the reporter.';
  exception
    when invalid_parameter_value then null;
  end;

  perform public.resolve_report(b_report, 'dismissed', 'We found nothing against the rules.');

  begin
    perform public.resolve_report(b_report, 'resolved', 'again');
    raise exception 'FAIL: a closed report was closed again.';
  exception
    when raise_exception then
      if sqlerrm not like '%already closed%' then raise; end if;
  end;

  perform public.restrict_account(user_b, 'restore', 'Appeal accepted.');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.listings where id = b_listing;
  if visible <> 1 then
    raise exception 'FAIL: restoring an account did not bring its listing back.';
  end if;

  -- 15. Chat. A is the renter, B the landlord of b_listing, C is staff and a
  --     stranger to the conversation.
  --     (Still A from the step above.)
  conv := public.start_conversation(b_listing);
  if conv is null then
    raise exception 'FAIL: user A cannot start a conversation on a published listing.';
  end if;

  if public.start_conversation(b_listing) <> conv then
    raise exception 'FAIL: starting the same conversation twice made a second one.';
  end if;

  begin
    perform public.start_conversation(a_draft_listing);
    raise exception 'FAIL: a conversation was opened on a listing that is not published.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.conversations (listing_id, listing_title, renter_id, landlord_id)
    values (b_listing, 'forged', user_a, user_c);
    raise exception 'FAIL: user A inserted a conversation directly.';
  exception
    when insufficient_privilege then null;
  end;

  insert into public.messages (conversation_id, sender_id, body)
  values (conv, user_a, 'Hello, is it free? Call me on 0788 123 456 or a@example.com')
  returning id into a_message;

  if not exists (
    select 1 from public.messages
    where id = a_message and masked
      and body = 'Hello, is it free? Call me on ••• or •••'
  ) then
    raise exception 'FAIL: a phone number and an email were stored unmasked: %',
      (select body from public.messages where id = a_message);
  end if;

  -- Not even the sender reads the original back.
  begin
    select count(*) into visible from public.message_originals;
    if visible <> 0 then
      raise exception 'FAIL: the sender can read the unmasked original.';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (conversation_id, sender_id, body)
    values (conv, user_b, 'forged');
    raise exception 'FAIL: user A sent a message as user B.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (conversation_id, sender_id, kind, body)
    values (conv, user_a, 'system', 'Booking confirmed.');
    raise exception 'FAIL: user A forged a system message.';
  exception
    when insufficient_privilege then null;
  end;

  update public.messages set body = 'edited' where id = a_message;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: a sent message was edited.';
  end if;

  delete from public.messages where id = a_message;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: a sent message was deleted.';
  end if;

  --     As B: reads it masked, replies, and keeps their own read state.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.messages
  where conversation_id = conv and body like '%•••%' and body not like '%0788%';
  if visible <> 1 then
    raise exception 'FAIL: the landlord cannot read the (masked) message.';
  end if;

  begin
    select count(*) into visible from public.message_originals;
    if visible <> 0 then
      raise exception 'FAIL: the recipient can read the unmasked original.';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  insert into public.messages (conversation_id, sender_id, body)
  values (conv, user_b, 'Yes, it is free from next month.')
  returning id into b_message;

  if not exists (
    select 1 from public.conversations
    where id = conv and last_message_sender_id = user_b
      and last_message_preview = 'Yes, it is free from next month.'
  ) then
    raise exception 'FAIL: the conversation preview did not follow the last message.';
  end if;

  select count(*) into visible from public.conversation_participants where conversation_id = conv;
  if visible <> 1 then
    raise exception 'FAIL: user B sees % participant rows, expected only its own.', visible;
  end if;

  update public.conversation_participants set last_read_at = '2100-01-01'
  where conversation_id = conv and user_id = user_b;
  if exists (
    select 1 from public.conversation_participants
    where conversation_id = conv and user_id = user_b
      and last_read_at > now() + interval '1 minute'
  ) then
    raise exception 'FAIL: a client-supplied read time was stored.';
  end if;

  update public.conversation_participants set muted = true
  where conversation_id = conv and user_id = user_a;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: user B muted the conversation for user A.';
  end if;

  begin
    update public.conversation_participants set user_id = user_c
    where conversation_id = conv and user_id = user_b;
    raise exception 'FAIL: a participant row was re-pointed at another user.';
  exception
    when insufficient_privilege then null;
  end;

  --     As C: a stranger, even one with a staff role, reads and writes nothing.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_c, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.conversations where id = conv;
  if visible <> 0 then
    raise exception 'FAIL: a non-participant can read the conversation.';
  end if;

  select count(*) into visible from public.messages where conversation_id = conv;
  if visible <> 0 then
    raise exception 'FAIL: a non-participant can read the messages.';
  end if;

  begin
    insert into public.messages (conversation_id, sender_id, body)
    values (conv, user_c, 'hello from outside');
    raise exception 'FAIL: a non-participant sent a message.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values (user_c, 'message', a_message, 'scam');
    raise exception 'FAIL: a non-participant reported a message it cannot see.';
  exception
    when no_data_found then null;
  end;

  -- A closed report (the listing report from step 13) opens no conversation.
  begin
    perform public.staff_report_conversation(a_report);
    raise exception 'FAIL: staff read a conversation through a closed report.';
  exception
    when insufficient_privilege then null;
  end;

  --     Blocks stop both directions, and the blocked side cannot see or lift it.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );

  insert into public.user_blocks (blocker_id, blocked_id) values (user_b, user_a);

  begin
    insert into public.user_blocks (blocker_id, blocked_id) values (user_a, user_b);
    raise exception 'FAIL: user B created a block in user A''s name.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (conversation_id, sender_id, body)
    values (conv, user_b, 'one more thing');
    raise exception 'FAIL: the blocker could still send.';
  exception
    when insufficient_privilege then null;
  end;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.messages (conversation_id, sender_id, body)
    values (conv, user_a, 'are you there?');
    raise exception 'FAIL: a blocked user sent a message.';
  exception
    when insufficient_privilege then null;
  end;

  select count(*) into visible from public.user_blocks;
  if visible <> 0 then
    raise exception 'FAIL: user A can see that user B blocked them.';
  end if;

  delete from public.user_blocks where blocked_id = user_a;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: a blocked user lifted the block.';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );
  delete from public.user_blocks where blocker_id = user_b and blocked_id = user_a;

  --     Reports on messages, and the automated flag.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values (user_a, 'message', a_message, 'scam');
    raise exception 'FAIL: user A reported its own message.';
  exception
    when insufficient_privilege then null;
  end;

  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (user_a, 'message', b_message, 'harassment')
  returning id into m_report;

  if not exists (
    select 1 from public.reports where id = m_report and subject_user_id = user_b
  ) then
    raise exception 'FAIL: a message report does not name the sender as its subject.';
  end if;

  -- The client cannot choose who a report is about.
  insert into public.reports (reporter_id, target_type, target_id, reason, subject_user_id)
  values (user_a, 'conversation', conv, 'scam', user_c);
  if not exists (
    select 1 from public.reports
    where reporter_id = user_a and target_type = 'conversation' and subject_user_id = user_b
  ) then
    raise exception 'FAIL: a reporter chose the subject of a report.';
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (conv, user_a, 'Please send money to my MoMo first');
  insert into public.messages (conversation_id, sender_id, body)
  values (conv, user_a, 'Pay first, see https://example.com');

  --     As C: the flag reached the queue once, and the conversation opens only
  --     through an open report, with the original text, and is logged.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_c, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.reports
  where reporter_id is null and target_type = 'message'
    and subject_user_id = user_a and status = 'open';
  if visible <> 1 then
    raise exception 'FAIL: two flagged messages made % automated reports, expected 1.', visible;
  end if;

  transcript := public.staff_report_conversation(m_report);
  if jsonb_array_length(transcript -> 'messages') <> 4 then
    raise exception 'FAIL: staff transcript has % messages, expected 4.',
      jsonb_array_length(transcript -> 'messages');
  end if;

  if not exists (
    select 1 from jsonb_array_elements(transcript -> 'messages') m
    where m ->> 'original_body' = 'Hello, is it free? Call me on 0788 123 456 or a@example.com'
  ) then
    raise exception 'FAIL: staff transcript is missing the original text.';
  end if;

  select count(*) into visible from public.moderation_events
  where action = 'conversation_viewed' and subject_id = conv
    and actor = user_c and report_id = m_report;
  if visible <> 1 then
    raise exception 'FAIL: a staff look at a conversation was not logged.';
  end if;

  -- Still no direct read, even with a report open.
  select count(*) into visible from public.messages where conversation_id = conv;
  if visible <> 0 then
    raise exception 'FAIL: staff read messages directly.';
  end if;

  perform public.resolve_report(m_report, 'dismissed', 'Nothing against the rules.');
  begin
    perform public.staff_report_conversation(m_report);
    raise exception 'FAIL: staff read a conversation after its report was closed.';
  exception
    when insufficient_privilege then null;
  end;

  --     A suspended account cannot send or start conversations.
  perform public.restrict_account(user_a, 'suspend', 'Asking for payment off the platform.');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  begin
    insert into public.messages (conversation_id, sender_id, body)
    values (conv, user_a, 'still here');
    raise exception 'FAIL: a suspended account sent a message.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.staff_report_conversation(m_report);
    raise exception 'FAIL: a non-staff user called the staff conversation function.';
  exception
    when insufficient_privilege then null;
  end;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_c, 'role', 'authenticated')::text,
    true
  );
  perform public.restrict_account(user_a, 'restore', 'Lifted for the rest of the check.');

  -- 17. Notifications. Everything above already caused some; this checks they
  --     reached the right person and nobody else, and that no client can write
  --     one. First one more source: a price drop on a saved listing.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );
  insert into public.favorites (user_id, listing_id) values (user_a, b_listing);

  select count(*) into visible from public.notifications
  where kind = 'message_new' and payload ->> 'conversation_id' = conv::text;
  if visible <> 1 then
    raise exception 'FAIL: user A has % message notifications for the conversation, expected 1.', visible;
  end if;

  select count(*) into visible from public.notifications
  where kind in ('listing_suspended', 'listing_restored', 'account_suspended', 'account_restored');
  if visible <> 4 then
    raise exception 'FAIL: user A has % moderation notifications, expected 4.', visible;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );
  update public.listings set price_rwf = price_rwf - 10000 where id = b_listing;

  -- Three messages from A collapsed into one unread row, and the masked number
  -- stayed masked in the text a lock screen would show.
  select count(*) into visible from public.notifications
  where kind = 'message_new' and payload ->> 'conversation_id' = conv::text;
  if visible <> 1 then
    raise exception 'FAIL: user B has % message notifications for the conversation, expected 1.', visible;
  end if;

  if exists (select 1 from public.notifications where body like '%0788%') then
    raise exception 'FAIL: a notification carries an unmasked phone number.';
  end if;

  select count(*) into visible from public.notifications where kind = 'saved_unavailable';
  if visible <> 1 then
    raise exception 'FAIL: user B was not told a saved listing was rented (% rows).', visible;
  end if;

  select count(*) into visible from public.notifications
  where kind in ('verification_decided', 'listing_review');
  if visible <> 2 then
    raise exception 'FAIL: user B has % verification notifications, expected 2.', visible;
  end if;

  select count(*) into visible from public.notifications where kind = 'report_resolved';
  if visible <> 2 then
    raise exception 'FAIL: user B has % report notifications, expected 2.', visible;
  end if;

  select count(*) into visible from public.notifications where user_id <> user_b;
  if visible <> 0 then
    raise exception 'FAIL: user B can read someone else''s notifications.';
  end if;

  begin
    insert into public.notifications (user_id, kind, category, title)
    values (user_a, 'account_suspended', 'account', 'Forged');
    raise exception 'FAIL: user B wrote a notification.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.notify_user(user_a, 'account_suspended', 'Forged', 'by B');
    raise exception 'FAIL: user B called notify_user.';
  exception
    when insufficient_privilege then null;
  end;

  update public.notifications set read_at = '2100-01-01' where kind = 'saved_unavailable';
  if exists (
    select 1 from public.notifications
    where kind = 'saved_unavailable'
      and (read_at is null or read_at > now() + interval '1 minute')
  ) then
    raise exception 'FAIL: marking read did not use the server clock.';
  end if;

  begin
    update public.notifications set title = 'edited' where kind = 'saved_unavailable';
    raise exception 'FAIL: user B edited a notification.';
  exception
    when insufficient_privilege then null;
  end;

  select count(*) into visible from public.push_config;
  if visible <> 0 then
    raise exception 'FAIL: a client can read the push configuration.';
  end if;

  begin
    insert into public.notification_preferences (user_id, messages) values (user_a, false);
    raise exception 'FAIL: user B set user A''s notification preferences.';
  exception
    when insufficient_privilege then null;
  end;

  insert into public.notification_preferences (user_id, messages) values (user_b, false);

  --     Push tokens. Kept last, so nothing after this could queue a real push.
  begin
    insert into public.push_tokens (token, user_id, platform)
    values ('ExponentPushToken[rls-check-direct]', user_b, 'android');
    raise exception 'FAIL: user B inserted a push token directly.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.register_push_token('not-a-token', 'android');
    raise exception 'FAIL: a malformed push token was accepted.';
  exception
    when check_violation then null;
  end;

  perform public.register_push_token('ExponentPushToken[rls-check]', 'android');
  select count(*) into visible from public.push_tokens;
  if visible <> 1 then
    raise exception 'FAIL: user B cannot see its own push token.';
  end if;

  --     As A: got the price drop, and signing in on the same phone moves the
  --     token, so B stops receiving on it.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible from public.notifications where kind = 'saved_price_drop';
  if visible <> 1 then
    raise exception 'FAIL: user A was not told about a price drop (% rows).', visible;
  end if;

  select count(*) into visible from public.push_tokens;
  if visible <> 0 then
    raise exception 'FAIL: user A can read user B''s push token.';
  end if;

  perform public.register_push_token('ExponentPushToken[rls-check]', 'android');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );
  select count(*) into visible from public.push_tokens;
  if visible <> 0 then
    raise exception 'FAIL: a push token stayed with the account that signed out.';
  end if;

  -- Unregistering someone else's token does nothing.
  perform public.unregister_push_token('ExponentPushToken[rls-check]');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );
  select count(*) into visible from public.push_tokens;
  if visible <> 1 then
    raise exception 'FAIL: user B removed user A''s push token.';
  end if;
  perform public.unregister_push_token('ExponentPushToken[rls-check]');

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

  -- 14. Anonymous users see nothing of reports or moderation.
  begin
    select count(*) into visible from public.reports;
    if visible <> 0 then
      raise exception 'FAIL: anonymous user can read reports.';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    select count(*) into visible from public.account_restrictions;
    if visible <> 0 then
      raise exception 'FAIL: anonymous user can read account restrictions.';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.moderate_listing(b_listing, 'suspend', 'anon');
    raise exception 'FAIL: anonymous user suspended a listing.';
  exception
    when insufficient_privilege then null;
  end;

  -- 16. Anonymous users see nothing of chat.
  begin
    select count(*) into visible from public.messages;
    if visible <> 0 then
      raise exception 'FAIL: anonymous user can read messages.';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    select count(*) into visible from public.conversations;
    if visible <> 0 then
      raise exception 'FAIL: anonymous user can read conversations.';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.start_conversation(b_listing);
    raise exception 'FAIL: anonymous user started a conversation.';
  exception
    when insufficient_privilege then null;
  end;

  -- 18. Anonymous users see no notifications and register no tokens.
  begin
    select count(*) into visible from public.notifications;
    if visible <> 0 then
      raise exception 'FAIL: anonymous user can read notifications.';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.register_push_token('ExponentPushToken[anon]', 'android');
    raise exception 'FAIL: anonymous user registered a push token.';
  exception
    when insufficient_privilege then null;
  end;

  raise notice 'All RLS checks passed.';
end;
$check$;

-- Nothing above should persist.
rollback;
