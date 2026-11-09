-- Staff roles, landlord and listing verification, and specific badges.
--
-- Blueprint §24-26 / Features #20-22: a landlord's identity is checked before
-- any of their listings can go public (rule 9), and every badge says exactly
-- what was checked (rule 8) — there is no bare "Verified".
--
-- Shape of the flow:
--   landlord: request_identity_verification() -> uploads ID photos -> staff
--             decide -> profile_badges 'identity_checked'
--   listing:  draft -> pending_review opens a case automatically -> staff
--             decide -> listing_badges + published, or rejected
--
-- Every staff action goes through a security-definer function that checks the
-- caller's role itself. Those functions run as their owner, so the
-- listings_guard_status trigger lets their status changes through — the same
-- "security definer is staff" rule that trigger already documents.

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
-- A table, not a column on profiles: every signed-in user can read profiles,
-- and the list of staff accounts is not public. Rows are additive so one
-- account can hold several roles (Blueprint §5). Renter and landlord are not
-- rows — every account can rent, and being a landlord is having listings.

create table public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('admin', 'verifier')),
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;

-- You may see your own roles (the app needs them to show the review queue).
-- There are no write policies: roles are granted from the SQL editor until the
-- admin console exists.
create policy user_roles_select_own on public.user_roles
  for select to authenticated using (user_id = auth.uid());

-- Security definer so policies can call it without recursing into the RLS on
-- user_roles. 'admin' satisfies every staff check.
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
  );
$fn$;

-- ---------------------------------------------------------------------------
-- cases, evidence, audit
-- ---------------------------------------------------------------------------

create table public.verification_cases (
  id            uuid primary key default gen_random_uuid(),
  subject_type  text not null check (subject_type in ('landlord', 'listing')),
  -- The landlord being checked, or the owner of the listing being checked.
  -- Either way it is whose case this is, which is what RLS keys on.
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  listing_id    uuid references public.listings (id) on delete cascade,
  status        text not null default 'submitted'
                  check (status in ('submitted', 'changes_requested', 'approved', 'rejected')),
  submitted_at  timestamptz not null default now(),
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  -- Shown to the landlord: what to fix, or why it was refused.
  decision_note text,
  check ((subject_type = 'listing') = (listing_id is not null))
);

-- One open case per subject, so the queue never shows the same thing twice.
create unique index verification_cases_open_landlord
  on public.verification_cases (profile_id)
  where subject_type = 'landlord' and status in ('submitted', 'changes_requested');

create unique index verification_cases_open_listing
  on public.verification_cases (listing_id)
  where subject_type = 'listing' and status in ('submitted', 'changes_requested');

create index verification_cases_queue_idx
  on public.verification_cases (status, submitted_at);

create table public.verification_evidence (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.verification_cases (id) on delete cascade,
  kind         text not null
                 check (kind in ('id_document', 'ownership_document', 'authorization_letter', 'other')),
  -- In the private verification-evidence bucket: {uid}/{case_id}/{uuid}.jpg.
  storage_path text not null unique,
  uploaded_at  timestamptz not null default now()
);

create index verification_evidence_case_idx on public.verification_evidence (case_id);

-- Who did what, when (Blueprint §40, §48). Written only by the functions and
-- triggers in this file; there are deliberately no write policies.
create table public.verification_events (
  id      bigint generated always as identity primary key,
  case_id uuid not null references public.verification_cases (id) on delete cascade,
  actor   uuid default auth.uid(),
  action  text not null,
  note    text,
  at      timestamptz not null default now()
);

create index verification_events_case_idx on public.verification_events (case_id, at);

-- ---------------------------------------------------------------------------
-- badges
-- ---------------------------------------------------------------------------
-- The public result of a decision, kept apart from the case so the evidence and
-- the reviewer's notes never ride along with a feed query. Written only by
-- decide_verification. Availability is not a badge row: it already lives on
-- listings.availability_confirmed_at.

create table public.profile_badges (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('identity_checked')),
  checked_at timestamptz not null default now(),
  -- Null only for rows created outside the review flow (seed data).
  case_id    uuid references public.verification_cases (id) on delete set null,
  primary key (profile_id, kind)
);

create table public.listing_badges (
  listing_id uuid not null references public.listings (id) on delete cascade,
  kind       text not null
               check (kind in ('authorization_checked', 'existence_checked', 'information_checked')),
  checked_at timestamptz not null default now(),
  case_id    uuid references public.verification_cases (id) on delete set null,
  primary key (listing_id, kind)
);

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.verification_cases    enable row level security;
alter table public.verification_evidence enable row level security;
alter table public.verification_events   enable row level security;
alter table public.profile_badges        enable row level security;
alter table public.listing_badges        enable row level security;

-- Cases: your own (to read the decision note), or any for staff. Created and
-- changed only through the functions below.
create policy verification_cases_select on public.verification_cases
  for select to authenticated
  using (profile_id = auth.uid() or (select public.has_role('verifier')));

-- Evidence: added by the case's owner while the case is still open, and only
-- under their own storage folder, so a row cannot point at someone else's file.
create policy verification_evidence_select on public.verification_evidence
  for select to authenticated
  using (
    (select public.has_role('verifier'))
    or exists (
      select 1 from public.verification_cases c
      where c.id = case_id and c.profile_id = auth.uid()
    )
  );

create policy verification_evidence_insert_own on public.verification_evidence
  for insert to authenticated
  with check (
    split_part(storage_path, '/', 1) = auth.uid()::text
    and split_part(storage_path, '/', 2) = case_id::text
    and exists (
      select 1 from public.verification_cases c
      where c.id = case_id
        and c.profile_id = auth.uid()
        and c.status in ('submitted', 'changes_requested')
    )
  );

-- Events can carry reviewer notes, so they are staff-only.
create policy verification_events_select_staff on public.verification_events
  for select to authenticated using ((select public.has_role('verifier')));

-- Badges are the public face of verification.
create policy profile_badges_select on public.profile_badges
  for select to anon, authenticated using (true);

create policy listing_badges_select on public.listing_badges
  for select to anon, authenticated using (true);

-- (select ...) makes Postgres evaluate has_role once per query instead of once
-- per row, which matters on the listings policy every feed query passes through.

-- Staff must see listings that are not public yet in order to review them.
create policy listings_select_staff on public.listings
  for select to authenticated using ((select public.has_role('verifier')));

create policy listing_images_select_staff on public.listing_images
  for select to authenticated using ((select public.has_role('verifier')));

-- listing_locations deliberately gets no staff policy. The address reaches
-- staff only through staff_listing_location(), which requires an open case and
-- logs every look.

-- ---------------------------------------------------------------------------
-- the publish gate
-- ---------------------------------------------------------------------------
-- The one-line switch the status migration promised: a draft now goes to
-- pending_review, never straight to published. Everything else is unchanged —
-- republishing a paused, unavailable or rented listing stays direct, because it
-- was already approved (or was live before verification existed).

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

  -- Going live is itself a confirmation that the place is available.
  if new.status = 'published' then
    new.availability_confirmed_at := now();
  end if;

  return new;
end;
$fn$;

-- Entering review opens the case, so the app's existing "move to
-- PUBLISH_TARGET" call needs no second request that could fail halfway.
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
      insert into public.verification_cases (subject_type, profile_id, listing_id)
      values ('listing', new.owner_id, new.id)
      returning id into v_case;

      insert into public.verification_events (case_id, action)
      values (v_case, 'submitted');
    end if;
  end if;
  return new;
end;
$fn$;

create trigger listings_open_review_case
  after update of status on public.listings
  for each row execute function public.listings_open_review_case();

-- ---------------------------------------------------------------------------
-- landlord functions
-- ---------------------------------------------------------------------------

-- Opens the caller's identity case, or reopens one that was sent back. Returns
-- its id so the app can upload evidence under it.
create or replace function public.request_identity_verification()
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_case uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from public.profile_badges
    where profile_id = v_uid and kind = 'identity_checked'
  ) then
    raise exception 'Your identity has already been checked.';
  end if;

  select id, status into v_case, v_status
  from public.verification_cases
  where subject_type = 'landlord' and profile_id = v_uid
    and status in ('submitted', 'changes_requested');

  if v_case is null then
    insert into public.verification_cases (subject_type, profile_id)
    values ('landlord', v_uid)
    returning id into v_case;

    insert into public.verification_events (case_id, action) values (v_case, 'submitted');
  elsif v_status = 'changes_requested' then
    update public.verification_cases
    set status = 'submitted', submitted_at = now(), decided_by = null, decided_at = null
    where id = v_case;

    insert into public.verification_events (case_id, action) values (v_case, 'resubmitted');
  end if;

  return v_case;
end;
$fn$;

-- After staff ask for changes, the landlord edits the listing and sends it back.
create or replace function public.resubmit_listing_case(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_case uuid;
begin
  update public.verification_cases
  set status = 'submitted', submitted_at = now(), decided_by = null, decided_at = null
  where subject_type = 'listing' and listing_id = p_listing_id
    and profile_id = auth.uid() and status = 'changes_requested'
  returning id into v_case;

  if v_case is null then
    raise exception 'There is nothing to resubmit for this listing.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.verification_events (case_id, action) values (v_case, 'resubmitted');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- staff functions
-- ---------------------------------------------------------------------------

-- p_checks names the listing badges the reviewer actually checked; a landlord
-- approval always means identity_checked. A refusal or a request for changes
-- needs a note, because the landlord has to know what to fix.
create or replace function public.decide_verification(
  p_case_id  uuid,
  p_decision text,
  p_note     text default null,
  p_checks   text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c      public.verification_cases%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  k      text;
begin
  if not public.has_role('verifier') then
    raise exception 'Only verification staff can decide cases.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_decision not in ('approved', 'rejected', 'changes_requested') then
    raise exception 'Unknown decision: %.', p_decision using errcode = 'invalid_parameter_value';
  end if;

  select * into c from public.verification_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found.' using errcode = 'no_data_found';
  end if;

  if c.status not in ('submitted', 'changes_requested') then
    raise exception 'This case has already been decided.';
  end if;

  if c.profile_id = auth.uid() then
    raise exception 'You cannot review your own case.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_decision <> 'approved' and v_note is null then
    raise exception 'Add a note so the landlord knows what to fix.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_decision = 'approved' then
    if c.subject_type = 'landlord' then
      insert into public.profile_badges (profile_id, kind, checked_at, case_id)
      values (c.profile_id, 'identity_checked', now(), c.id)
      on conflict (profile_id, kind)
        do update set checked_at = excluded.checked_at, case_id = excluded.case_id;
    else
      -- Rule 9: no listing goes public before its landlord is checked.
      if not exists (
        select 1 from public.profile_badges
        where profile_id = c.profile_id and kind = 'identity_checked'
      ) then
        raise exception 'Check the landlord''s identity before approving their listing.';
      end if;

      if coalesce(cardinality(p_checks), 0) = 0 then
        raise exception 'Record at least one check before approving.'
          using errcode = 'invalid_parameter_value';
      end if;

      foreach k in array p_checks loop
        if k not in ('authorization_checked', 'existence_checked', 'information_checked') then
          raise exception 'Unknown check: %.', k using errcode = 'invalid_parameter_value';
        end if;
        insert into public.listing_badges (listing_id, kind, checked_at, case_id)
        values (c.listing_id, k, now(), c.id)
        on conflict (listing_id, kind)
          do update set checked_at = excluded.checked_at, case_id = excluded.case_id;
      end loop;

      update public.listings set status = 'published'
      where id = c.listing_id and status = 'pending_review';
      if not found then
        raise exception 'This listing is no longer waiting for review.';
      end if;
    end if;
  elsif p_decision = 'rejected' and c.subject_type = 'listing' then
    update public.listings set status = 'rejected'
    where id = c.listing_id and status = 'pending_review';
  end if;

  update public.verification_cases
  set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = v_note
  where id = c.id;

  insert into public.verification_events (case_id, action, note)
  values (
    c.id,
    p_decision,
    concat_ws(' · ', v_note, case when cardinality(p_checks) > 0
                               then 'checks: ' || array_to_string(p_checks, ', ') end)
  );
end;
$fn$;

-- The exact address, for a reviewer checking that the property exists. Only
-- while a case is open, and every call is logged — the listing_locations policy
-- itself stays owner-only.
create or replace function public.staff_listing_location(p_listing_id uuid)
returns table (address text, latitude double precision, longitude double precision)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_case uuid;
begin
  if not public.has_role('verifier') then
    raise exception 'Only verification staff can see an exact location.'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_case
  from public.verification_cases
  where subject_type = 'listing' and listing_id = p_listing_id
    and status in ('submitted', 'changes_requested');

  if v_case is null then
    raise exception 'This listing has no open review.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.verification_events (case_id, action) values (v_case, 'viewed_location');

  return query
    select l.address, l.latitude, l.longitude
    from public.listing_locations l
    where l.listing_id = p_listing_id;
end;
$fn$;

-- Functions are executable by PUBLIC by default. None of these is meant for
-- anonymous callers; each still checks its caller, this just narrows the door.
revoke execute on function public.has_role(text) from public, anon;
revoke execute on function public.request_identity_verification() from public, anon;
revoke execute on function public.resubmit_listing_case(uuid) from public, anon;
revoke execute on function public.decide_verification(uuid, text, text, text[]) from public, anon;
revoke execute on function public.staff_listing_location(uuid) from public, anon;

grant execute on function public.has_role(text) to authenticated;
grant execute on function public.request_identity_verification() to authenticated;
grant execute on function public.resubmit_listing_case(uuid) to authenticated;
grant execute on function public.decide_verification(uuid, text, text, text[]) to authenticated;
grant execute on function public.staff_listing_location(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- storage: identity and ownership documents
-- ---------------------------------------------------------------------------
-- Private bucket (Blueprint §49): never a public URL. Staff read through
-- short-lived signed URLs, which Storage only issues to a caller the select
-- policy admits. No update or delete policy, so a submitted document cannot be
-- swapped after a reviewer has seen it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-evidence', 'verification-evidence', false,
  10485760, array['image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- {uid}/{case_id}/{file}: the first segment is the uploader, the second must be
-- one of their own open cases.
create policy verification_evidence_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.verification_cases c
      where c.id::text = (storage.foldername(name))[2]
        and c.profile_id = auth.uid()
        and c.status in ('submitted', 'changes_requested')
    )
  );

create policy verification_evidence_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-evidence'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (select public.has_role('verifier'))
    )
  );
