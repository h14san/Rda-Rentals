-- In-app chat, contact masking, blocks, and the end of the WhatsApp number.
--
-- Blueprint §18, §19 / Features #26, #28, #29, #30. Rules 1, 2 and 5: contact
-- goes through Rwanda Rentals, and no phone number or email is public. Until
-- now a landlord's WhatsApp number sat on profiles, readable by every
-- signed-in user. Chat replaces it, so the column goes.

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------

create table public.conversations (
  id                     uuid primary key default gen_random_uuid(),
  -- Set null, not cascade: deleting a listing must not destroy the record of
  -- what was said about it. listing_title keeps the inbox readable after that.
  listing_id             uuid references public.listings (id) on delete set null,
  listing_title          text not null,
  renter_id              uuid not null references public.profiles (id) on delete cascade,
  landlord_id            uuid not null references public.profiles (id) on delete cascade,
  created_at             timestamptz not null default now(),
  -- Denormalised by trigger so the inbox is one query with no aggregate.
  last_message_at        timestamptz not null default now(),
  last_message_preview   text,
  last_message_sender_id uuid,
  unique (listing_id, renter_id),
  check (renter_id <> landlord_id)
);

create index conversations_renter_idx   on public.conversations (renter_id, last_message_at desc);
create index conversations_landlord_idx on public.conversations (landlord_id, last_message_at desc);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- Null for system messages.
  sender_id       uuid references public.profiles (id) on delete set null,
  -- Room for attachments later; only these two exist.
  kind            text not null default 'text' check (kind in ('text', 'system')),
  body            text not null check (length(body) between 1 and 2000),
  -- True when contact details were replaced before the message was stored.
  masked          boolean not null default false,
  -- True when the text has a link or payment wording. Staff signal only.
  flagged         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx       on public.messages (sender_id, created_at desc);

-- What the sender actually typed, for moderation. RLS is on with no policy at
-- all: not the recipient (that is the point of masking) and not the sender
-- (they know what they typed). Staff read it only through
-- staff_report_conversation(), which logs the look.
create table public.message_originals (
  -- Deferred, because the row is written by the before-insert trigger on
  -- messages, a moment before the message it points at exists.
  message_id uuid primary key references public.messages (id) on delete cascade
               deferrable initially deferred,
  body       text not null
);

-- Each participant's own view of a conversation: what they have read, and
-- whether they archived or muted it.
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  archived        boolean not null default false,
  muted           boolean not null default false,
  primary key (conversation_id, user_id)
);

create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- ---------------------------------------------------------------------------
-- masking and flagging
-- ---------------------------------------------------------------------------
-- Pure functions, so the fixtures in rls_check.sql can call them directly.

-- Order matters: a USSD code contains a phone number, so it goes first and
-- takes the number with it.
create or replace function public.mask_contact_details(p_body text)
returns text
language sql
immutable
as $fn$
  select regexp_replace(
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
    -- Rwandan mobiles in local forms: 0788123456, 078 812 3456, 07.88.12.34.56,
    -- 250788123456, 788123456. Exactly nine national digits starting 72/73/78/79,
    -- not touching another digit, so "250,000 RWF" and "2026-11-15" survive.
    '(?<!\d)(250[\s.-]*|0)?7[\s.-]*[2389]([\s.-]*\d){7}(?!\d)', '•••', 'g');
$fn$;

-- Links, other messaging apps, and pay-before-you-see wording in English,
-- French and Kinyarwanda. A match never blocks or changes the message; it only
-- puts the conversation in front of a person.
create or replace function public.message_is_suspicious(p_body text)
returns boolean
language sql
immutable
as $fn$
  select p_body ~* (
    '(https?://|www\.|\m[[:alnum:]-]+\.(com|net|org|rw|me|ly|io|co)\M'
    || '|whats\s?app|telegram|western union|money\s?gram'
    || '|send (me )?(the )?money|pay (me )?first|pay before|pay in advance|advance payment'
    || '|deposit first|momo (number|code|pay)|mobile money|bank account'
    || '|envoye[rz]? (moi )?l.argent|paye[rz]? d.abord|payer avant|paiement (à|a) l.avance'
    || '|acompte|num(é|e)ro momo|virement'
    || '|ohereza amafaranga|banza wishyure|banza kwishyura|ishyura mbere|wishyure mbere'
    || '|nimero ya momo|kuri momo|avansi)'
  );
$fn$;

-- Whether contact details are still hidden in this conversation. Always, for
-- now. Booking replaces this function: once a booking between the two for
-- this listing is confirmed, new messages go through as typed.
create or replace function public.contact_masking_active(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select true;
$fn$;

-- ---------------------------------------------------------------------------
-- message triggers
-- ---------------------------------------------------------------------------

-- Security definer because it must see blocks the sender cannot read and write
-- the original text where the sender cannot. It keys on kind, not on who is
-- calling: everything a person types is 'text' (the insert policy allows them
-- nothing else), and system messages come only from functions.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c        public.conversations%rowtype;
  v_other  uuid;
  v_masked text;
begin
  if new.kind <> 'text' then
    return new;
  end if;

  new.created_at := now();
  new.masked := false;
  new.body := trim(new.body);

  select * into c from public.conversations where id = new.conversation_id;
  if not found or new.sender_id is null
     or new.sender_id not in (c.renter_id, c.landlord_id) then
    raise exception 'You are not part of this conversation.'
      using errcode = 'insufficient_privilege';
  end if;
  v_other := case when new.sender_id = c.renter_id then c.landlord_id else c.renter_id end;

  if public.is_restricted(new.sender_id) then
    raise exception 'Your account is suspended, so you cannot send messages.'
      using errcode = 'insufficient_privilege';
  end if;

  -- One wording for both directions, so the reply does not reveal who blocked whom.
  if exists (
    select 1 from public.user_blocks
    where (blocker_id = new.sender_id and blocked_id = v_other)
       or (blocker_id = v_other and blocked_id = new.sender_id)
  ) then
    raise exception 'You cannot send messages in this conversation.'
      using errcode = 'insufficient_privilege';
  end if;

  if (select count(*) from public.messages
      where sender_id = new.sender_id
        and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'You are sending messages too quickly. Wait a moment.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Judged on what was typed, before masking hides part of it.
  new.flagged := public.message_is_suspicious(new.body);

  if public.contact_masking_active(c.id) then
    v_masked := public.mask_contact_details(new.body);
    if v_masked is distinct from new.body then
      insert into public.message_originals (message_id, body) values (new.id, new.body);
      new.body := v_masked;
      new.masked := true;
    end if;
  end if;

  return new;
end;
$fn$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 140),
      last_message_sender_id = new.sender_id
  where id = new.conversation_id;

  -- A reply brings an archived conversation back for the person receiving it.
  update public.conversation_participants
  set archived = false
  where conversation_id = new.conversation_id
    and archived
    and user_id is distinct from new.sender_id;

  -- One automated report per conversation at a time: a scammer's tenth message
  -- should not be the tenth row in the queue.
  if new.flagged and not exists (
    select 1 from public.reports r
    join public.messages m on m.id = r.target_id
    where r.target_type = 'message' and r.reporter_id is null
      and r.status in ('open', 'in_review')
      and m.conversation_id = new.conversation_id
  ) then
    insert into public.reports (reporter_id, target_type, target_id, reason, note)
    values (null, 'message', new.id, 'suspicious_payment_request',
            'Flagged automatically: a link, another app, or payment wording.');
  end if;

  return new;
end;
$fn$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- "Read" is stamped by the server, like availability: a phone with a wrong
-- clock must not mark tomorrow's messages as read.
create or replace function public.conversation_participants_stamp_read()
returns trigger
language plpgsql
as $fn$
begin
  if new.last_read_at is distinct from old.last_read_at then
    new.last_read_at := now();
  end if;
  return new;
end;
$fn$;

create trigger conversation_participants_stamp_read
  before update on public.conversation_participants
  for each row execute function public.conversation_participants_stamp_read();

-- ---------------------------------------------------------------------------
-- starting a conversation
-- ---------------------------------------------------------------------------
-- A function rather than an insert policy: the rules need the listing's owner
-- and the other side's blocks, neither of which the renter's own policies show.

create or replace function public.start_conversation(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  l     public.listings%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;

  -- An existing conversation is returned whatever has happened to the listing
  -- since: it survives the listing being paused or rented.
  select id into v_id from public.conversations
  where listing_id = p_listing_id and renter_id = v_uid;
  if v_id is not null then
    return v_id;
  end if;

  select * into l from public.listings where id = p_listing_id;
  if not found or l.status <> 'published' or public.is_restricted(l.owner_id) then
    raise exception 'This listing is not open for messages.'
      using errcode = 'insufficient_privilege';
  end if;

  if l.owner_id = v_uid then
    raise exception 'This is your own listing.' using errcode = 'insufficient_privilege';
  end if;

  if public.is_restricted(v_uid) then
    raise exception 'Your account is suspended, so you cannot start a conversation.'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from public.user_blocks
    where (blocker_id = v_uid and blocked_id = l.owner_id)
       or (blocker_id = l.owner_id and blocked_id = v_uid)
  ) then
    raise exception 'You cannot message this landlord.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.conversations (listing_id, listing_title, renter_id, landlord_id)
  values (l.id, l.title, v_uid, l.owner_id)
  on conflict (listing_id, renter_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Lost a race with a second tap.
    select id into v_id from public.conversations
    where listing_id = p_listing_id and renter_id = v_uid;
    return v_id;
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_id, v_uid), (v_id, l.owner_id);

  return v_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.conversations             enable row level security;
alter table public.messages                  enable row level security;
alter table public.message_originals         enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.user_blocks               enable row level security;

-- Staff get no policy on any of these. Their only way in is
-- staff_report_conversation(), and only while a report is open.

create policy conversations_select_participant on public.conversations
  for select to authenticated
  using (auth.uid() in (renter_id, landlord_id));

create policy messages_select_participant on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and auth.uid() in (c.renter_id, c.landlord_id)
  ));

-- A person may add only their own text to a conversation they are in. Blocks,
-- suspension and masking are the before-insert trigger's job.
create policy messages_insert_own_text on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and kind = 'text'
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and auth.uid() in (c.renter_id, c.landlord_id)
    )
  );

-- No update or delete policy on messages: what was said stays said.

create policy conversation_participants_select_own on public.conversation_participants
  for select to authenticated using (user_id = auth.uid());

create policy conversation_participants_update_own on public.conversation_participants
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Only the three state columns, so a row cannot be re-pointed at a
-- conversation its owner is not in.
revoke update on public.conversation_participants from anon, authenticated;
grant update (last_read_at, archived, muted)
  on public.conversation_participants to authenticated;

-- You see who you blocked, never who blocked you.
create policy user_blocks_select_own on public.user_blocks
  for select to authenticated using (blocker_id = auth.uid());

create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check (blocker_id = auth.uid());

create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- Realtime delivers a row only to subscribers the select policy admits.
alter publication supabase_realtime add table public.messages;

-- ---------------------------------------------------------------------------
-- reports: messages and conversations become reportable
-- ---------------------------------------------------------------------------

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
    check (target_type in ('listing', 'user', 'message', 'conversation')),
  -- Who the report is about, resolved once when it is made: the listing's
  -- owner, the account, the message's sender, or the other participant. Staff
  -- cannot read conversations, so without this a message report would name
  -- nobody they could act on.
  add column subject_user_id uuid references public.profiles (id) on delete set null;

update public.reports r
set subject_user_id = case
  when r.target_type = 'user' then (select p.id from public.profiles p where p.id = r.target_id)
  when r.target_type = 'listing' then (select l.owner_id from public.listings l where l.id = r.target_id)
end;

create index reports_subject_idx on public.reports (subject_user_id);

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

  -- Each lookup runs as the caller, so RLS decides whether the target exists
  -- for them: a listing or a conversation they cannot see cannot be reported.
  new.subject_user_id := null;

  if new.target_type = 'listing' then
    select owner_id into new.subject_user_id from public.listings where id = new.target_id;
    if not found then
      raise exception 'That listing no longer exists.' using errcode = 'no_data_found';
    end if;
  elsif new.target_type = 'user' then
    select id into new.subject_user_id from public.profiles where id = new.target_id;
    if not found then
      raise exception 'That account no longer exists.' using errcode = 'no_data_found';
    end if;
  elsif new.target_type = 'message' then
    select sender_id into new.subject_user_id from public.messages where id = new.target_id;
    if not found then
      raise exception 'That message no longer exists.' using errcode = 'no_data_found';
    end if;
    if new.subject_user_id is null then
      raise exception 'System messages cannot be reported.'
        using errcode = 'insufficient_privilege';
    end if;
  else
    select case when renter_id = new.reporter_id then landlord_id else renter_id end
    into new.subject_user_id
    from public.conversations where id = new.target_id;
    if not found then
      raise exception 'That conversation no longer exists.' using errcode = 'no_data_found';
    end if;
  end if;

  if new.subject_user_id = new.reporter_id then
    raise exception 'You cannot report yourself or something of your own.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- staff: reading a reported conversation
-- ---------------------------------------------------------------------------
-- The only staff path into chat. It needs an open report on a message in the
-- conversation or on the conversation itself, returns the text as typed, and
-- logs every call. A closed report opens nothing.

create or replace function public.staff_report_conversation(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r      public.reports%rowtype;
  v_conv uuid;
  v_out  jsonb;
begin
  if not public.has_role('verifier') then
    raise exception 'Only staff can read a reported conversation.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into r from public.reports where id = p_report_id;
  if not found then
    raise exception 'Report not found.' using errcode = 'no_data_found';
  end if;

  if r.status not in ('open', 'in_review') then
    raise exception 'This report is closed, so its conversation is no longer open to staff.'
      using errcode = 'insufficient_privilege';
  end if;

  if r.target_type = 'conversation' then
    v_conv := r.target_id;
  elsif r.target_type = 'message' then
    select conversation_id into v_conv from public.messages where id = r.target_id;
  end if;

  if v_conv is null or not exists (select 1 from public.conversations where id = v_conv) then
    raise exception 'This report is not about a conversation.'
      using errcode = 'insufficient_privilege';
  end if;

  if auth.uid() in (select renter_id from public.conversations where id = v_conv
                    union all
                    select landlord_id from public.conversations where id = v_conv) then
    raise exception 'You cannot review a conversation you are part of.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.moderation_events (action, subject_type, subject_id, report_id)
  values ('conversation_viewed', 'conversation', v_conv, r.id);

  select jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', c.id,
      'listing_id', c.listing_id,
      'listing_title', c.listing_title,
      'renter', jsonb_build_object('id', c.renter_id, 'full_name', rp.full_name),
      'landlord', jsonb_build_object('id', c.landlord_id, 'full_name', lp.full_name)
    ),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'sender_id', m.sender_id,
        'kind', m.kind,
        'body', m.body,
        'original_body', o.body,
        'flagged', m.flagged,
        'reported', m.id = r.target_id,
        'created_at', m.created_at
      ) order by m.created_at)
      from (
        select * from public.messages
        where conversation_id = c.id
        order by created_at desc
        limit 200
      ) m
      left join public.message_originals o on o.message_id = m.id
    ), '[]'::jsonb)
  )
  into v_out
  from public.conversations c
  join public.profiles rp on rp.id = c.renter_id
  join public.profiles lp on lp.id = c.landlord_id
  where c.id = v_conv;

  return v_out;
end;
$fn$;

revoke execute on function public.start_conversation(uuid) from public, anon;
revoke execute on function public.staff_report_conversation(uuid) from public, anon;
revoke execute on function public.contact_masking_active(uuid) from public, anon;
grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.staff_report_conversation(uuid) to authenticated;
grant execute on function public.contact_masking_active(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- the WhatsApp number goes
-- ---------------------------------------------------------------------------
-- Rule 1, with its temporary exception lifted. profiles is readable by every
-- signed-in user, so this column was every landlord's number one REST call
-- away. Nothing reads it any more.

alter table public.profiles drop column whatsapp_phone;
