-- Booking: Instant Book and Request to Book (Phase 4).
--
-- Blueprint §20-§23, §28 / Features #31-#36. Rules 3, 4, 6, 7, 10, 14.
--
--   request:  requested -> accepted -> confirmed -> completed
--             (declined, expired or cancelled along the way)
--   instant:  confirmed at once, when the listing allows it and the renter's
--             dates meet its terms
--
-- A confirmed booking is the "appropriate booking stage" of rules 3 and 4: it
-- is the one thing that releases the exact address to the renter and stops
-- contact masking between the two of them.
--
-- No payments (rule 14). payment_required and payment_confirmed are in the
-- status list so Phase 6 does not need to rewrite it, and the guard trigger
-- refuses every move into them.

-- ---------------------------------------------------------------------------
-- listings: booking settings and two more statuses
-- ---------------------------------------------------------------------------

alter table public.listings
  -- Rule 7: the landlord chooses. Request-only is the default because it is
  -- the one that cannot surprise them.
  add column instant_book_enabled    boolean not null default false,
  add column request_to_book_enabled boolean not null default true,
  add constraint listings_booking_mode_check
    check (instant_book_enabled or request_to_book_enabled);

alter table public.listings drop constraint listings_status_check;
alter table public.listings
  add constraint listings_status_check check (status in (
    'draft', 'pending_review', 'published', 'paused',
    'unavailable', 'rented', 'rejected', 'suspended',
    -- §28. booking_pending: a request was accepted and waits for the renter
    -- to confirm. reserved: a booking is confirmed. Neither is public, so
    -- neither can be booked twice. Both are set only by the booking functions.
    'booking_pending', 'reserved'
  ));

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------

create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  -- Set null with a title snapshot, like conversations: deleting a listing
  -- must not erase the record that someone booked it.
  listing_id        uuid references public.listings (id) on delete set null,
  listing_title     text not null,
  renter_id         uuid not null references public.profiles (id) on delete cascade,
  landlord_id       uuid not null references public.profiles (id) on delete cascade,
  mode              text not null check (mode in ('instant', 'request')),
  move_in_date      date not null,
  duration_months   smallint not null check (duration_months between 1 and 60),
  status            text not null check (status in (
                      'requested', 'accepted', 'declined', 'expired', 'cancelled',
                      'payment_required', 'payment_confirmed',
                      'confirmed', 'completed')),
  -- When a request lapses unanswered, or an acceptance lapses unconfirmed.
  expires_at        timestamptz,
  cancelled_by      text check (cancelled_by in ('renter', 'landlord', 'staff')),
  created_at        timestamptz not null default now(),
  responded_at      timestamptz,
  confirmed_at      timestamptz,
  closed_at         timestamptz,
  check (renter_id <> landlord_id)
);

-- There is deliberately no free-text column. Whatever the renter wants to say
-- goes into the conversation as an ordinary message, where it is masked like
-- any other; a "message" field here would be a way around masking.

-- One live booking per renter and listing.
create unique index bookings_one_active
  on public.bookings (listing_id, renter_id)
  where status in ('requested', 'accepted', 'confirmed');

create index bookings_renter_idx   on public.bookings (renter_id, created_at desc);
create index bookings_landlord_idx on public.bookings (landlord_id, created_at desc);
create index bookings_expiry_idx   on public.bookings (expires_at)
  where status in ('requested', 'accepted');

alter table public.bookings enable row level security;

-- The two parties, and staff (§40). No write policy of any kind: every change
-- goes through the functions below.
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    renter_id = auth.uid()
    or landlord_id = auth.uid()
    or (select public.has_role('verifier'))
  );

-- The state machine, enforced under the functions rather than only inside
-- them, so a bug in one cannot make an impossible move.
create or replace function public.bookings_guard()
returns trigger
language plpgsql
as $fn$
declare
  allowed text[];
begin
  if tg_op = 'INSERT' then
    if not (new.status = 'requested' or (new.status = 'confirmed' and new.mode = 'instant')) then
      raise exception 'A booking cannot start as %.', new.status;
    end if;
    return new;
  end if;

  if new.listing_id is distinct from old.listing_id and new.listing_id is not null
     or new.renter_id <> old.renter_id or new.landlord_id <> old.landlord_id
     or new.mode <> old.mode or new.move_in_date <> old.move_in_date
     or new.duration_months <> old.duration_months then
    raise exception 'A booking''s parties, listing and dates cannot be changed.';
  end if;

  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'requested' then array['accepted', 'declined', 'expired', 'cancelled']
    when 'accepted'  then array['confirmed', 'declined', 'expired', 'cancelled']
    when 'confirmed' then array['completed', 'cancelled']
    -- Everything else is final. The payment states have no way in until
    -- payments exist (rule 14).
    else array[]::text[]
  end;

  if not (new.status = any (allowed)) then
    raise exception 'A booking cannot move from % to %.', old.status, new.status;
  end if;

  if new.status in ('declined', 'expired', 'cancelled', 'completed') then
    new.closed_at := now();
  end if;
  return new;
end;
$fn$;

create trigger bookings_guard
  before insert or update on public.bookings
  for each row execute function public.bookings_guard();

-- ---------------------------------------------------------------------------
-- visibility that follows a booking
-- ---------------------------------------------------------------------------

-- Rules 3 and 4, the release: the renter of a confirmed (or completed) booking
-- reads the exact address and pin. Nothing earlier in the flow does, and
-- cancelling takes it away again.
create policy listing_locations_confirmed_renter on public.listing_locations
  for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.listing_id = listing_locations.listing_id
      and b.renter_id = auth.uid()
      and b.status in ('confirmed', 'completed')
  ));

-- A renter keeps seeing a listing they have a live booking on, though it has
-- left the feed (booking_pending, reserved, rented).
create policy listings_select_booked on public.listings
  for select to authenticated
  using (
    status not in ('draft', 'rejected', 'suspended')
    and exists (
      select 1 from public.bookings b
      where b.listing_id = listings.id
        and b.renter_id = auth.uid()
        and b.status in ('requested', 'accepted', 'confirmed', 'completed')
    )
  );

-- Saved listings stay visible while they are being booked by someone.
drop policy listings_select_favorited on public.listings;
create policy listings_select_favorited on public.listings
  for select to authenticated
  using (
    status in ('published', 'paused', 'unavailable', 'rented', 'booking_pending', 'reserved')
    and not public.is_restricted(owner_id)
    and exists (
      select 1 from public.favorites f
      where f.listing_id = listings.id and f.user_id = auth.uid()
    )
  );

-- Masking ends at a confirmed booking between these two for this listing, for
-- new messages only. It resumes if the booking is cancelled.
create or replace function public.contact_masking_active(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select not exists (
    select 1
    from public.conversations c
    join public.bookings b
      on b.listing_id = c.listing_id and b.renter_id = c.renter_id
    where c.id = p_conversation_id
      and b.status in ('confirmed', 'completed')
  );
$fn$;

-- ---------------------------------------------------------------------------
-- internal helpers (execute revoked from every client role at the end)
-- ---------------------------------------------------------------------------

-- Every booking event is a system message in the pair's conversation, creating
-- it if they have never spoken. Fixed wording only: nothing a user typed is
-- ever put in a system message, because system messages are not masked.
create or replace function public.booking_announce(p_booking_id uuid, p_text text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b      public.bookings%rowtype;
  v_conv uuid;
begin
  select * into b from public.bookings where id = p_booking_id;

  select id into v_conv from public.conversations
  where listing_id = b.listing_id and renter_id = b.renter_id;

  if v_conv is null then
    insert into public.conversations (listing_id, listing_title, renter_id, landlord_id)
    values (b.listing_id, b.listing_title, b.renter_id, b.landlord_id)
    returning id into v_conv;
    insert into public.conversation_participants (conversation_id, user_id)
    values (v_conv, b.renter_id), (v_conv, b.landlord_id);
  end if;

  insert into public.messages (conversation_id, sender_id, kind, body)
  values (v_conv, null, 'system', p_text);

  return v_conv;
end;
$fn$;

create or replace function public.booking_notify(
  p_booking_id uuid,
  p_user       uuid,
  p_kind       text,
  p_title      text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id;
  perform public.notify_user(
    p_user, p_kind, p_title,
    b.listing_title || ' · move in ' || to_char(b.move_in_date, 'FMDD Mon YYYY')
      || ', ' || b.duration_months || ' month' || case when b.duration_months = 1 then '' else 's' end,
    jsonb_build_object(
      'booking_id', b.id,
      'listing_id', b.listing_id,
      'conversation_id', (select id from public.conversations
                          where listing_id = b.listing_id and renter_id = b.renter_id)
    )
  );
end;
$fn$;

-- Puts a listing back on the feed when the booking holding it ends. If its
-- location or photos changed in the meantime it goes to review instead: this
-- runs as the function owner, so the guard trigger would not catch that.
create or replace function public.booking_release_listing(p_listing_id uuid)
returns void
language sql
security definer
set search_path = public
as $fn$
  update public.listings
  set status = case when review_reason is not null then 'pending_review' else 'published' end
  where id = p_listing_id and status in ('booking_pending', 'reserved');
$fn$;

-- What a confirmation does besides the booking row: the listing is reserved,
-- and everyone else who was waiting on it is told it has gone.
create or replace function public.booking_on_confirmed(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b     public.bookings%rowtype;
  other record;
begin
  select * into b from public.bookings where id = p_booking_id;

  update public.listings set status = 'reserved'
  where id = b.listing_id and status in ('published', 'booking_pending');

  for other in
    select id, renter_id from public.bookings
    where listing_id = b.listing_id and id <> b.id and status in ('requested', 'accepted')
    for update
  loop
    update public.bookings set status = 'declined', responded_at = now() where id = other.id;
    perform public.booking_announce(other.id, 'This request was declined: the place has been booked by someone else.');
    perform public.booking_notify(other.id, other.renter_id, 'booking_declined', 'The place was booked by someone else');
  end loop;
end;
$fn$;

-- Lapses requests nobody answered and acceptances nobody confirmed. Run by
-- pg_cron and, so a late cron cannot matter, at the start of every booking
-- function. The other functions also refuse an expired row on their own.
create or replace function public.expire_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b public.bookings%rowtype;
  n integer := 0;
begin
  for b in
    select * from public.bookings
    where status in ('requested', 'accepted') and expires_at < now()
    for update skip locked
  loop
    update public.bookings set status = 'expired' where id = b.id;
    if b.status = 'accepted' then
      perform public.booking_release_listing(b.listing_id);
      perform public.booking_announce(b.id, 'The accepted request expired: it was not confirmed in time.');
    else
      perform public.booking_announce(b.id, 'The booking request expired: it was not answered in time.');
    end if;
    perform public.booking_notify(b.id, b.renter_id, 'booking_expired', 'Your booking request expired');
    perform public.booking_notify(b.id, b.landlord_id, 'booking_expired', 'A booking request expired');
    n := n + 1;
  end loop;
  return n;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- what the two parties can do
-- ---------------------------------------------------------------------------
-- Wrong-state refusals use object_not_in_prerequisite_state; "not yours to do"
-- uses insufficient_privilege, like everywhere else.

-- p_message, if any, is sent as the renter's own chat message, so it is masked
-- like one. Returns the booking id.
create or replace function public.request_booking(
  p_listing_id uuid,
  p_move_in    date,
  p_months     integer,
  p_message    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid      uuid := auth.uid();
  v_name     text;
  l          public.listings%rowtype;
  v_eligible boolean;
  v_instant  boolean;
  v_id       uuid;
  v_conv     uuid;
  v_message  text := nullif(trim(coalesce(p_message, '')), '');
  v_terms    text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;

  perform public.expire_bookings();

  select * into l from public.listings where id = p_listing_id for update;
  if not found or l.status <> 'published' or public.is_restricted(l.owner_id) then
    raise exception 'This listing cannot be booked right now.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if l.owner_id = v_uid then
    raise exception 'This is your own listing.' using errcode = 'insufficient_privilege';
  end if;

  if public.is_restricted(v_uid) then
    raise exception 'Your account is suspended, so you cannot book.'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from public.user_blocks
    where (blocker_id = v_uid and blocked_id = l.owner_id)
       or (blocker_id = l.owner_id and blocked_id = v_uid)
  ) then
    raise exception 'You cannot book with this landlord.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_move_in is null or p_move_in < current_date then
    raise exception 'Choose a move-in date that is not in the past.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_months is null or p_months not between 1 and 60 then
    raise exception 'Choose a stay of 1 to 60 months.' using errcode = 'invalid_parameter_value';
  end if;

  select full_name into v_name from public.profiles where id = v_uid;

  -- The Instant Book rules, deliberately few (rule 10): a named account, and
  -- dates that meet the terms the landlord already published. A request may
  -- ask for anything; the landlord decides.
  v_eligible := v_name is not null
    and p_move_in >= coalesce(l.available_from, current_date)
    and p_months >= coalesce(l.min_rental_months, 1);

  if l.instant_book_enabled and v_eligible then
    v_instant := true;
  elsif l.request_to_book_enabled then
    v_instant := false;
  else
    raise exception 'This listing only takes instant bookings, and these dates do not meet its terms. Check the move-in date and minimum stay.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  begin
    insert into public.bookings (
      listing_id, listing_title, renter_id, landlord_id, mode,
      move_in_date, duration_months, status, expires_at, confirmed_at
    )
    values (
      l.id, l.title, v_uid, l.owner_id,
      case when v_instant then 'instant' else 'request' end,
      p_move_in, p_months,
      case when v_instant then 'confirmed' else 'requested' end,
      case when v_instant then null else now() + interval '72 hours' end,
      case when v_instant then now() end
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have a booking in progress for this listing.'
      using errcode = 'object_not_in_prerequisite_state';
  end;

  v_terms := 'move in ' || to_char(p_move_in, 'FMDD Mon YYYY') || ', '
    || p_months || ' month' || case when p_months = 1 then '' else 's' end || '.';

  if v_instant then
    v_conv := public.booking_announce(v_id,
      'Booked instantly: ' || v_terms
      || ' The exact address is now visible to the renter, and contact details in new messages are no longer hidden.');
    perform public.booking_on_confirmed(v_id);
    perform public.booking_notify(v_id, l.owner_id, 'booking_confirmed',
      coalesce(v_name, 'Someone') || ' booked your place');
  else
    v_conv := public.booking_announce(v_id,
      'Booking requested: ' || v_terms || ' The landlord has 72 hours to answer.');
    perform public.booking_notify(v_id, l.owner_id, 'booking_requested',
      coalesce(v_name, 'Someone') || ' asked to book your place');
  end if;

  if v_message is not null then
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conv, v_uid, left(v_message, 2000));
  end if;

  return v_id;
end;
$fn$;

-- The landlord answers a request. No note: anything they want to say goes in
-- the chat, where it is masked.
create or replace function public.respond_booking(p_booking_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b public.bookings%rowtype;
  l public.listings%rowtype;
begin
  perform public.expire_bookings();

  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.landlord_id is distinct from auth.uid() then
    raise exception 'Only the landlord can answer this request.'
      using errcode = 'insufficient_privilege';
  end if;

  if b.status <> 'requested' or b.expires_at < now() then
    raise exception 'This request is no longer waiting for an answer.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not p_accept then
    update public.bookings set status = 'declined', responded_at = now() where id = b.id;
    perform public.booking_announce(b.id, 'The landlord declined the booking request.');
    perform public.booking_notify(b.id, b.renter_id, 'booking_declined', 'Your booking request was declined');
    return;
  end if;

  select * into l from public.listings where id = b.listing_id for update;
  if not found or l.status <> 'published' then
    raise exception 'The listing has to be live to accept a request. You may already have accepted another one.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update public.bookings
  set status = 'accepted', responded_at = now(), expires_at = now() + interval '72 hours'
  where id = b.id;
  update public.listings set status = 'booking_pending' where id = l.id;

  perform public.booking_announce(b.id,
    'The landlord accepted the request. The renter has 72 hours to confirm the booking.');
  perform public.booking_notify(b.id, b.renter_id, 'booking_accepted',
    'Your booking request was accepted. Confirm it to book.');
end;
$fn$;

-- The renter confirms an accepted request. This is where a payment step will
-- sit in Phase 6.
create or replace function public.confirm_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b public.bookings%rowtype;
begin
  perform public.expire_bookings();

  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.renter_id is distinct from auth.uid() then
    raise exception 'Only the renter can confirm this booking.'
      using errcode = 'insufficient_privilege';
  end if;

  if b.status <> 'accepted' or b.expires_at < now() then
    raise exception 'This booking is not waiting to be confirmed.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if public.is_restricted(b.renter_id) then
    raise exception 'Your account is suspended, so you cannot confirm a booking.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.bookings
  set status = 'confirmed', confirmed_at = now(), expires_at = null
  where id = b.id;

  perform public.booking_on_confirmed(b.id);
  perform public.booking_announce(b.id,
    'Booking confirmed. The exact address is now visible to the renter, and contact details in new messages are no longer hidden.');
  perform public.booking_notify(b.id, b.landlord_id, 'booking_confirmed', 'A booking was confirmed');
end;
$fn$;

-- Either party, or staff. A renter may withdraw at any live stage; a landlord
-- declines a request rather than cancelling it. Staff must say why, and both
-- parties are told.
create or replace function public.cancel_booking(p_booking_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b      public.bookings%rowtype;
  v_uid  uuid := auth.uid();
  v_role text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'insufficient_privilege';
  end if;

  v_role := case
    when v_uid = b.renter_id then 'renter'
    when v_uid = b.landlord_id then 'landlord'
    when public.has_role('verifier') then 'staff'
  end;
  if v_role is null then
    raise exception 'This is not your booking.' using errcode = 'insufficient_privilege';
  end if;

  if b.status not in ('requested', 'accepted', 'confirmed')
     or (v_role = 'landlord' and b.status = 'requested') then
    raise exception 'This booking cannot be cancelled now.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_role = 'staff' and v_note is null then
    raise exception 'Add a note. Both people will see it.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.bookings set status = 'cancelled', cancelled_by = v_role where id = b.id;

  if b.status in ('accepted', 'confirmed') then
    perform public.booking_release_listing(b.listing_id);
  end if;

  perform public.booking_announce(b.id, case v_role
    when 'renter' then 'The renter cancelled the booking.'
    when 'landlord' then 'The landlord cancelled the booking.'
    -- A staff note is written by staff for both readers, so it may be shown.
    else 'Rwanda Rentals cancelled this booking: ' || v_note
  end || case when b.status = 'confirmed'
              then ' The exact address is hidden again, and contact details in new messages are hidden.'
              else '' end);

  if v_role <> 'renter' then
    perform public.booking_notify(b.id, b.renter_id, 'booking_cancelled', 'Your booking was cancelled');
  end if;
  if v_role <> 'landlord' then
    perform public.booking_notify(b.id, b.landlord_id, 'booking_cancelled', 'A booking was cancelled');
  end if;

  if v_role = 'staff' then
    insert into public.moderation_events (action, subject_type, subject_id, note)
    values ('booking_cancelled', 'listing', coalesce(b.listing_id, b.id), v_note);
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- listings: the landlord's side of the new statuses
-- ---------------------------------------------------------------------------

-- Only one line changes: a reserved listing may be marked rented at move-in.
-- booking_pending has no landlord move; cancelling the booking is how it ends.
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
    -- The renter has moved in.
    when 'reserved'       then array['rented']
    -- pending_review, suspended and booking_pending are not the landlord's to
    -- leave: staff decide the first two, and the booking decides the third.
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

-- Marking a reserved listing rented completes its booking (rule 13 will hang
-- reviews off this).
create or replace function public.listings_complete_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_booking uuid;
begin
  if new.status = 'rented' and old.status = 'reserved' then
    update public.bookings set status = 'completed'
    where listing_id = new.id and status = 'confirmed'
    returning id into v_booking;
    if v_booking is not null then
      perform public.booking_announce(v_booking, 'The landlord marked the place as rented. The rental has started.');
    end if;
  end if;
  return new;
end;
$fn$;

create trigger listings_complete_booking
  after update of status on public.listings
  for each row execute function public.listings_complete_booking();

-- A listing that is being booked has been through review too, so a location
-- or photo change marks it. It cannot leave booking_pending or reserved for
-- review mid-booking; booking_release_listing sends it there when it ends.
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

  if not found or l.owner_id is distinct from auth.uid() then
    return;
  end if;

  if l.status not in ('published', 'paused', 'unavailable', 'rented',
                      'booking_pending', 'reserved') then
    return;
  end if;

  delete from public.listing_badges
  where listing_id = l.id
    and (p_kind = 'location' or kind = 'information_checked');

  if l.status = 'published' then
    update public.listings
    set status = 'pending_review',
        review_reason = case when l.review_reason = 'location' then 'location' else p_kind end
    where id = l.id;
  else
    update public.listings
    set review_reason = case when l.review_reason = 'location' then 'location' else p_kind end
    where id = l.id;
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- grants and schedule
-- ---------------------------------------------------------------------------

revoke execute on function public.booking_announce(uuid, text) from public, anon, authenticated;
revoke execute on function public.booking_notify(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.booking_release_listing(uuid) from public, anon, authenticated;
revoke execute on function public.booking_on_confirmed(uuid) from public, anon, authenticated;
revoke execute on function public.expire_bookings() from public, anon, authenticated;
revoke execute on function public.listing_material_edit(uuid, text) from public, anon, authenticated;

revoke execute on function public.request_booking(uuid, date, integer, text) from public, anon;
revoke execute on function public.respond_booking(uuid, boolean) from public, anon;
revoke execute on function public.confirm_booking(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.request_booking(uuid, date, integer, text) to authenticated;
grant execute on function public.respond_booking(uuid, boolean) to authenticated;
grant execute on function public.confirm_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;

-- Expiry on a clock. If pg_cron cannot be enabled the booking functions still
-- expire lazily, so this is allowed to fail without failing the migration.
do $cron$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('expire-bookings', '*/15 * * * *', 'select public.expire_bookings()');
exception when others then
  raise notice 'pg_cron not scheduled (%); bookings expire lazily instead.', sqlerrm;
end;
$cron$;
