-- Follow-ups to gaps recorded in CLAUDE.md: the staff second factor becomes
-- unconditional, a case no longer names its reviewer to the landlord, masking
-- stops eating one kind of price, and reviews gain replies, removal, and the
-- landlord's review of the renter.

-- ---------------------------------------------------------------------------
-- staff: the second factor, always
-- ---------------------------------------------------------------------------
-- The previous version let a staff member with no authenticator through, on
-- the reasoning that they could otherwise never enrol. That was wrong:
-- enrolling needs no role. The unlock screen is offered to anyone who can see
-- their own row in user_roles, and that select policy does not go through
-- has_role(). So the exception protected nobody and left every staff account
-- that had not yet opened the console on a single emailed code. A role now
-- counts only in a session that has passed the second factor.
create or replace function public.has_role(r text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and (role = r or role = 'admin')
    );
$fn$;

-- ---------------------------------------------------------------------------
-- a case does not name its reviewer
-- ---------------------------------------------------------------------------
-- The landlord reads their own case, and anyone signed in reads profiles, so
-- decided_by was the reviewer's name. Who decided is in verification_events,
-- which only staff read. Kept as a trigger rather than by editing
-- decide_verification, so no future writer of this table can reintroduce it.
create or replace function public.verification_cases_hide_reviewer()
returns trigger
language plpgsql
as $fn$
begin
  new.decided_by := null;
  return new;
end;
$fn$;

create trigger verification_cases_hide_reviewer
  before insert or update on public.verification_cases
  for each row execute function public.verification_cases_hide_reviewer();

update public.verification_cases set decided_by = null where decided_by is not null;

-- ---------------------------------------------------------------------------
-- masking: a bare nine-digit number must look like a phone number
-- ---------------------------------------------------------------------------
-- "780000 800" (a rent and a fee) was masked: nine digits starting 78, with a
-- space somewhere. A number written without its leading 0 or 250 is now
-- masked only when it is unbroken (788123456) or grouped the way phone numbers
-- are (788 123 456). With a prefix, any spacing is still caught.
create or replace function public.mask_contact_details(p_body text)
returns text
language sql
immutable
as $fn$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            p_body,
            -- MoMo / USSD codes: *182#, *182*1*1*0788123456*5000#
            '\*\d{2,4}[*#][\d*#]*', '•••', 'g'),
          -- Email addresses.
          '[[:alnum:]._%+-]+@[[:alnum:]-]+(\.[[:alnum:]-]+)+', '•••', 'g'),
        -- Any number written internationally: +250 788 123 456, +254...
        '\+\d([\s.-]*\d){8,14}', '•••', 'g'),
      -- Rwandan mobiles with a leading 0 or 250, however they are spaced.
      '(?<!\d)(250[\s.-]*|0)7[\s.-]*[2389]([\s.-]*\d){7}(?!\d)', '•••', 'g'),
    -- The same without a prefix: unbroken, or in threes.
    '(?<!\d)7[2389](\d{7}|\d[\s.-]\d{3}[\s.-]\d{3})(?!\d)', '•••', 'g');
$fn$;

-- ---------------------------------------------------------------------------
-- reviews: a reply, and removal
-- ---------------------------------------------------------------------------

alter table public.reviews
  -- The landlord's one public answer.
  add column reply      text check (length(reply) <= 1000),
  add column replied_at timestamptz,
  -- Set by staff. A removed review is hidden, not deleted, so the audit log
  -- still points at something.
  add column removed_at timestamptz;

drop policy reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select to anon, authenticated
  using (removed_at is null or (select public.has_role('verifier')));

create or replace function public.reply_to_review(p_review_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r      public.reviews%rowtype;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
begin
  select * into r from public.reviews where id = p_review_id for update;
  if not found or r.landlord_id is distinct from auth.uid() or r.removed_at is not null then
    raise exception 'Only the landlord can reply to this review.'
      using errcode = 'insufficient_privilege';
  end if;
  if r.reply is not null then
    raise exception 'You have already replied to this review.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_body is null then
    raise exception 'Write a reply first.' using errcode = 'invalid_parameter_value';
  end if;

  update public.reviews
  set reply = public.mask_contact_details(left(v_body, 1000)), replied_at = now()
  where id = r.id;

  perform public.notify_user(
    r.author_id, 'review_reply', 'The landlord replied to your review', null,
    jsonb_build_object('listing_id', r.listing_id)
  );
end;
$fn$;

create or replace function public.remove_review(p_review_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r      public.reviews%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.has_role('verifier') then
    raise exception 'Only staff can remove a review.' using errcode = 'insufficient_privilege';
  end if;
  if v_note is null then
    raise exception 'Add a note saying why.' using errcode = 'invalid_parameter_value';
  end if;

  select * into r from public.reviews where id = p_review_id for update;
  if not found or r.removed_at is not null then
    raise exception 'That review is not there to remove.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update public.reviews set removed_at = now() where id = r.id;

  insert into public.moderation_events (action, subject_type, subject_id, note)
  values ('review_removed', 'user', r.landlord_id, v_note);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- the landlord's review of the renter (Blueprint §32)
-- ---------------------------------------------------------------------------
-- Not public. A renter's standing is shown to them, to the landlord who wrote
-- it, to staff, and to a landlord currently deciding on a booking from that
-- renter, which is the one moment it is needed.

create table public.tenant_reviews (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  renter_id  uuid not null references public.profiles (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  rating     smallint not null check (rating between 1 and 5),
  body       text check (length(body) <= 1000),
  created_at timestamptz not null default now()
);

create index tenant_reviews_renter_idx on public.tenant_reviews (renter_id, created_at desc);

alter table public.tenant_reviews enable row level security;

create policy tenant_reviews_select on public.tenant_reviews
  for select to authenticated
  using (
    renter_id = auth.uid()
    or author_id = auth.uid()
    or (select public.has_role('verifier'))
    or exists (
      select 1 from public.bookings b
      where b.landlord_id = auth.uid()
        and b.renter_id = tenant_reviews.renter_id
        and b.status in ('requested', 'accepted', 'confirmed')
    )
  );

create or replace function public.submit_tenant_review(
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
  if not found or b.landlord_id is distinct from auth.uid() then
    raise exception 'Only the landlord of this booking can review the renter.'
      using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'completed' then
    raise exception 'You can review a renter once they have moved in.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose 1 to 5 stars.' using errcode = 'invalid_parameter_value';
  end if;

  begin
    insert into public.tenant_reviews (booking_id, renter_id, author_id, rating, body)
    values (b.id, b.renter_id, auth.uid(), p_rating,
            public.mask_contact_details(left(v_body, 1000)))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You have already reviewed this renter for this rental.'
      using errcode = 'object_not_in_prerequisite_state';
  end;

  return v_id;
end;
$fn$;

revoke execute on function public.reply_to_review(uuid, text) from public, anon;
revoke execute on function public.remove_review(uuid, text) from public, anon;
revoke execute on function public.submit_tenant_review(uuid, integer, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;
grant execute on function public.remove_review(uuid, text) to authenticated;
grant execute on function public.submit_tenant_review(uuid, integer, text) to authenticated;
