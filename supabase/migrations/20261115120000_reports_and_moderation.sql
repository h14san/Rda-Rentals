-- Reports, and what staff can do about them: suspend or restore a listing,
-- restrict or restore an account.
--
-- Blueprint §27, §40 / Features #23, #24, #58. The shape follows verification:
-- users write only the one thing they are entitled to (a report), every staff
-- action is a security-definer function that checks has_role itself, and an
-- audit row is written by the function, never by a client.

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  -- Null is the system reporter (automated flags on chat messages), and also
  -- what is left when a reporter deletes their account: the report still stands.
  reporter_id     uuid references public.profiles (id) on delete set null,
  -- Polymorphic on purpose, so there is one queue. No foreign key, which means
  -- a report outlives its target; the staff screen says "deleted" in that case.
  target_type     text not null check (target_type in ('listing', 'user', 'message')),
  target_id       uuid not null,
  reason          text not null check (reason in (
                    'fake_property', 'fake_landlord', 'incorrect_price',
                    'property_unavailable', 'misleading_photos',
                    'misleading_description', 'duplicate_listing', 'scam',
                    'harassment', 'inappropriate_content',
                    'suspicious_payment_request', 'other')),
  note            text check (length(note) <= 1000),
  status          text not null default 'open'
                    check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  severity        text check (severity in ('low', 'medium', 'high')),
  -- What the reporter is told. Kept apart from the note the reported party
  -- sees, because the two audiences should not read each other's.
  resolution_note text,
  -- Set when the report was closed by an action rather than by a written
  -- answer, so the reporter's screen can say what happened in fixed words.
  action_taken    text check (action_taken in ('listing_suspended', 'account_suspended')),
  resolved_by     uuid references public.profiles (id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- The rate limit: one live report per reporter and target. A second press of
-- "Report" is a unique violation, not a second row in the queue.
create unique index reports_one_open_per_target
  on public.reports (reporter_id, target_type, target_id)
  where status in ('open', 'in_review');

create index reports_queue_idx  on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_type, target_id);

-- Runs as the caller, so "does the target exist" is answered through RLS: a
-- listing the reporter cannot see cannot be reported, and so cannot be probed.
create or replace function public.reports_guard_insert()
returns trigger
language plpgsql
as $fn$
begin
  new.note := nullif(trim(coalesce(new.note, '')), '');

  if current_user = 'authenticated' then
    -- Everything staff decide starts empty, whatever the client sent.
    new.status := 'open';
    new.severity := null;
    new.resolution_note := null;
    new.action_taken := null;
    new.resolved_by := null;
    new.resolved_at := null;
    new.created_at := now();

    -- A second, coarser limit: the unique index stops repeats on one target,
    -- this stops one account walking the whole feed.
    if (select count(*) from public.reports
        where reporter_id = auth.uid()
          and created_at > now() - interval '24 hours') >= 10 then
      raise exception 'You have sent several reports today. Please try again tomorrow.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.reason = 'other' and new.note is null then
    raise exception 'Tell us what is wrong.' using errcode = 'invalid_parameter_value';
  end if;

  if new.target_type = 'listing' then
    if not exists (select 1 from public.listings where id = new.target_id) then
      raise exception 'That listing no longer exists.' using errcode = 'no_data_found';
    end if;
    if exists (select 1 from public.listings
               where id = new.target_id and owner_id = new.reporter_id) then
      raise exception 'You cannot report your own listing.'
        using errcode = 'insufficient_privilege';
    end if;
  elsif new.target_type = 'user' then
    if new.target_id = new.reporter_id then
      raise exception 'You cannot report yourself.' using errcode = 'insufficient_privilege';
    end if;
    if not exists (select 1 from public.profiles where id = new.target_id) then
      raise exception 'That account no longer exists.' using errcode = 'no_data_found';
    end if;
  else
    -- Messages do not exist yet; the chat migration replaces this branch.
    raise exception 'Messages cannot be reported yet.'
      using errcode = 'feature_not_supported';
  end if;

  return new;
end;
$fn$;

create trigger reports_guard_insert
  before insert on public.reports
  for each row execute function public.reports_guard_insert();

-- ---------------------------------------------------------------------------
-- restrictions and suspensions
-- ---------------------------------------------------------------------------
-- Their own tables, never a column on profiles or listings: both of those are
-- readable by people who should not learn that an account was restricted, or
-- read the reason. One row per restriction, kept after it is lifted, so the
-- history is the table itself.

create table public.account_restrictions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  -- Shown to the restricted user.
  note          text not null,
  restricted_at timestamptz not null default now(),
  lifted_at     timestamptz,
  lift_note     text
);

create unique index account_restrictions_one_active
  on public.account_restrictions (user_id) where lifted_at is null;

create table public.listing_suspensions (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  -- Shown to the landlord.
  note         text not null,
  suspended_at timestamptz not null default now(),
  lifted_at    timestamptz,
  lift_note    text
);

create unique index listing_suspensions_one_active
  on public.listing_suspensions (listing_id) where lifted_at is null;

-- Who did it is deliberately not on either table: the affected user reads these
-- rows, and the actor belongs in the staff-only log below.

-- The moderation log. A sibling of verification_events rather than a widening
-- of it, because that table hangs off a case and none of this has one.
create table public.moderation_events (
  id           bigint generated always as identity primary key,
  actor        uuid default auth.uid(),
  action       text not null,
  subject_type text not null check (subject_type in ('listing', 'user', 'report', 'conversation')),
  subject_id   uuid not null,
  report_id    uuid references public.reports (id) on delete set null,
  note         text,
  at           timestamptz not null default now()
);

create index moderation_events_subject_idx
  on public.moderation_events (subject_type, subject_id, at desc);
create index moderation_events_actor_idx on public.moderation_events (actor, at desc);

-- Security definer so the listings policies can ask without the caller being
-- able to read account_restrictions. It answers for any id, which tells a
-- curious caller no more than the missing listings already do.
create or replace function public.is_restricted(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.account_restrictions
    where user_id = p_user_id and lifted_at is null
  );
$fn$;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.reports              enable row level security;
alter table public.account_restrictions enable row level security;
alter table public.listing_suspensions  enable row level security;
alter table public.moderation_events    enable row level security;

-- A reporter follows their own reports. The reported party gets no policy at
-- all, so they never learn who reported them, or that anyone did.
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or (select public.has_role('verifier')));

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

-- No update or delete policy: a report changes only through the functions below.

create policy account_restrictions_select on public.account_restrictions
  for select to authenticated
  using (user_id = auth.uid() or (select public.has_role('verifier')));

create policy listing_suspensions_select on public.listing_suspensions
  for select to authenticated
  using (
    (select public.has_role('verifier'))
    or exists (
      select 1 from public.listings l
      where l.id = listing_id and l.owner_id = auth.uid()
    )
  );

create policy moderation_events_select_staff on public.moderation_events
  for select to authenticated using ((select public.has_role('verifier')));

-- A restricted account's listings leave every public read without changing
-- status, so lifting the restriction puts each one back exactly as it was.
drop policy listings_select_published_or_own on public.listings;
create policy listings_select_published_or_own on public.listings
  for select to anon, authenticated
  using (
    (status = 'published' and not public.is_restricted(owner_id))
    or owner_id = auth.uid()
  );

drop policy listings_select_favorited on public.listings;
create policy listings_select_favorited on public.listings
  for select to authenticated
  using (
    status in ('published', 'paused', 'unavailable', 'rented')
    and not public.is_restricted(owner_id)
    and exists (
      select 1 from public.favorites f
      where f.listing_id = listings.id and f.user_id = auth.uid()
    )
  );

-- listing_images and favorites decide visibility by querying listings, which
-- applies the policies above, so they need no change of their own.

drop policy listings_insert_own on public.listings;
create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (owner_id = auth.uid() and not public.is_restricted(auth.uid()));

-- ---------------------------------------------------------------------------
-- status history no longer names staff
-- ---------------------------------------------------------------------------
-- The owner can read this table and any signed-in user can read profiles, so a
-- staff id here was a name. Staff actions are attributed in the staff-only
-- logs instead; here they read as "not the owner".

create or replace function public.listings_record_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.listing_status_history (listing_id, from_status, to_status, changed_by)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      case when auth.uid() = new.owner_id then auth.uid() end
    );
  end if;
  return new;
end;
$fn$;

update public.listing_status_history h
set changed_by = null
from public.listings l
where l.id = h.listing_id and h.changed_by is distinct from l.owner_id;

-- ---------------------------------------------------------------------------
-- staff functions
-- ---------------------------------------------------------------------------

-- Sets how urgent a report is and marks it as being looked at.
create or replace function public.triage_report(p_report_id uuid, p_severity text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r public.reports%rowtype;
begin
  if not public.has_role('verifier') then
    raise exception 'Only staff can triage reports.' using errcode = 'insufficient_privilege';
  end if;

  if p_severity not in ('low', 'medium', 'high') then
    raise exception 'Unknown severity: %.', p_severity using errcode = 'invalid_parameter_value';
  end if;

  select * into r from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'Report not found.' using errcode = 'no_data_found';
  end if;
  if r.status not in ('open', 'in_review') then
    raise exception 'This report is already closed.';
  end if;

  update public.reports set severity = p_severity, status = 'in_review' where id = r.id;

  insert into public.moderation_events (action, subject_type, subject_id, report_id, note)
  values ('report_triaged', 'report', r.id, r.id, p_severity);
end;
$fn$;

-- Closes a report with a written answer. p_note goes to the reporter.
create or replace function public.resolve_report(
  p_report_id uuid,
  p_outcome   text,
  p_note      text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r      public.reports%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.has_role('verifier') then
    raise exception 'Only staff can close reports.' using errcode = 'insufficient_privilege';
  end if;

  if p_outcome not in ('resolved', 'dismissed') then
    raise exception 'Unknown outcome: %.', p_outcome using errcode = 'invalid_parameter_value';
  end if;

  if v_note is null then
    raise exception 'Add a note. The person who reported this will see it.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into r from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'Report not found.' using errcode = 'no_data_found';
  end if;
  if r.status not in ('open', 'in_review') then
    raise exception 'This report is already closed.';
  end if;
  if r.reporter_id = auth.uid() then
    raise exception 'You cannot close your own report.' using errcode = 'insufficient_privilege';
  end if;

  update public.reports
  set status = p_outcome, resolution_note = v_note,
      resolved_by = auth.uid(), resolved_at = now()
  where id = r.id;

  insert into public.moderation_events (action, subject_type, subject_id, report_id, note)
  values ('report_' || p_outcome, 'report', r.id, r.id, v_note);
end;
$fn$;

-- p_note goes to the landlord. Restore puts the listing back in the status it
-- had before it was suspended, never straight to published: a listing that was
-- paused, rented or still in review must not come back live.
create or replace function public.moderate_listing(
  p_listing_id uuid,
  p_action     text,
  p_note       text,
  p_report_id  uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  l      public.listings%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_prev text;
begin
  if not public.has_role('verifier') then
    raise exception 'Only staff can moderate listings.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_action not in ('suspend', 'restore') then
    raise exception 'Unknown action: %.', p_action using errcode = 'invalid_parameter_value';
  end if;

  if v_note is null then
    raise exception 'Add a note. The landlord will see it.'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into l from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'Listing not found.' using errcode = 'no_data_found';
  end if;

  if l.owner_id = auth.uid() then
    raise exception 'You cannot moderate your own listing.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_action = 'suspend' then
    if l.status = 'suspended' then
      raise exception 'This listing is already suspended.';
    end if;

    update public.listings set status = 'suspended' where id = l.id;
    insert into public.listing_suspensions (listing_id, note) values (l.id, v_note);
  else
    if l.status <> 'suspended' then
      raise exception 'This listing is not suspended.';
    end if;

    select from_status into v_prev
    from public.listing_status_history
    where listing_id = l.id and to_status = 'suspended'
    order by changed_at desc, id desc
    limit 1;

    -- This runs as the function's owner, so the guard trigger lets the move
    -- through and does not re-stamp availability: coming back from a
    -- suspension is not the landlord confirming anything.
    update public.listings set status = coalesce(v_prev, 'paused') where id = l.id;

    update public.listing_suspensions
    set lifted_at = now(), lift_note = v_note
    where listing_id = l.id and lifted_at is null;
  end if;

  insert into public.moderation_events (action, subject_type, subject_id, report_id, note)
  values ('listing_' || p_action, 'listing', l.id, p_report_id, v_note);

  if p_report_id is not null and p_action = 'suspend' then
    update public.reports
    set status = 'resolved', action_taken = 'listing_suspended',
        resolved_by = auth.uid(), resolved_at = now()
    where id = p_report_id and status in ('open', 'in_review');
    if not found then
      raise exception 'That report is already closed.';
    end if;
  end if;
end;
$fn$;

-- p_note goes to the account's owner. A restricted account can still sign in
-- and read why; what it loses is enforced by the policies, not here.
create or replace function public.restrict_account(
  p_user_id   uuid,
  p_action    text,
  p_note      text,
  p_report_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.has_role('verifier') then
    raise exception 'Only staff can restrict accounts.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_action not in ('suspend', 'restore') then
    raise exception 'Unknown action: %.', p_action using errcode = 'invalid_parameter_value';
  end if;

  if v_note is null then
    raise exception 'Add a note. The account''s owner will see it.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot restrict your own account.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Account not found.' using errcode = 'no_data_found';
  end if;

  -- Staff accounts are an admin's call, so a verifier cannot lock out a
  -- colleague, or the admin who could undo it.
  if exists (select 1 from public.user_roles where user_id = p_user_id)
     and not public.has_role('admin') then
    raise exception 'Only an admin can restrict a staff account.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_action = 'suspend' then
    if public.is_restricted(p_user_id) then
      raise exception 'This account is already suspended.';
    end if;
    insert into public.account_restrictions (user_id, note) values (p_user_id, v_note);
  else
    update public.account_restrictions
    set lifted_at = now(), lift_note = v_note
    where user_id = p_user_id and lifted_at is null;
    if not found then
      raise exception 'This account is not suspended.';
    end if;
  end if;

  insert into public.moderation_events (action, subject_type, subject_id, report_id, note)
  values ('account_' || p_action, 'user', p_user_id, p_report_id, v_note);

  if p_report_id is not null and p_action = 'suspend' then
    update public.reports
    set status = 'resolved', action_taken = 'account_suspended',
        resolved_by = auth.uid(), resolved_at = now()
    where id = p_report_id and status in ('open', 'in_review');
    if not found then
      raise exception 'That report is already closed.';
    end if;
  end if;
end;
$fn$;

revoke execute on function public.triage_report(uuid, text) from public, anon;
revoke execute on function public.resolve_report(uuid, text, text) from public, anon;
revoke execute on function public.moderate_listing(uuid, text, text, uuid) from public, anon;
revoke execute on function public.restrict_account(uuid, text, text, uuid) from public, anon;

grant execute on function public.triage_report(uuid, text) to authenticated;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;
grant execute on function public.moderate_listing(uuid, text, text, uuid) to authenticated;
grant execute on function public.restrict_account(uuid, text, text, uuid) to authenticated;

-- Anonymous reads of listings evaluate this through the select policy.
grant execute on function public.is_restricted(uuid) to anon, authenticated;
