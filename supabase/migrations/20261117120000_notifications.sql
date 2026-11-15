-- Notifications: an in-app list that fills from real events, and push on top.
--
-- Blueprint §37 / Features #47, #48. One row in `notifications` is one thing a
-- user should know. Rows are written only by triggers, through notify_user();
-- no client and no staff member inserts one. Push is the same row, delivered:
-- notify_user() asks the send-push Edge Function to send it.

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null,
  -- What a preference toggle switches. 'account' has no toggle (§37).
  category     text not null
                 check (category in ('messages', 'listings', 'saved', 'bookings', 'account')),
  -- The words are composed here, once, so the in-app list and the push
  -- banner cannot disagree.
  title        text not null,
  body         text,
  -- Ids for the screen a tap opens. Never anything private.
  payload      jsonb not null default '{}',
  -- Repeats of the same thing (ten messages in one conversation) update one
  -- unread row instead of stacking ten.
  collapse_key text,
  read_at      timestamptz,
  -- Set when push was sent, or decided against. send-push claims a row by
  -- setting it, so calling the function twice sends once.
  pushed_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_collapse_idx
  on public.notifications (user_id, kind, collapse_key) where read_at is null;

create table public.push_tokens (
  -- The token is the key: one device, one row, whoever is signed in on it.
  token      text primary key check (token ~ '^Expo(nent)?PushToken\[[^\]]+\]$'),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

-- A missing row means every toggle is on.
create table public.notification_preferences (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  messages   boolean not null default true,
  listings   boolean not null default true,
  saved      boolean not null default true,
  bookings   boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Where send-push lives. A row rather than a literal in notify_user(), so
-- pointing another project at its own function is an update, not a migration.
-- No endpoint means no push; the in-app list still fills.
create table public.push_config (
  id       boolean primary key default true check (id),
  endpoint text
);

insert into public.push_config (endpoint)
values ('https://urfmftxepopqmhhmzpqh.supabase.co/functions/v1/send-push');

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.notifications            enable row level security;
alter table public.push_tokens              enable row level security;
alter table public.notification_preferences enable row level security;
-- No policy: only notify_user() reads it.
alter table public.push_config              enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Marking read is the only thing a user may change.
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.notifications_stamp_read()
returns trigger
language plpgsql
as $fn$
begin
  if new.read_at is distinct from old.read_at and new.read_at is not null then
    new.read_at := now();
  end if;
  return new;
end;
$fn$;

create trigger notifications_stamp_read
  before update on public.notifications
  for each row execute function public.notifications_stamp_read();

-- Tokens are registered through register_push_token(), because a device that
-- changes hands must move its row, and that is an update of someone else's.
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = auth.uid());

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());

create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated with check (user_id = auth.uid());

create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- push tokens
-- ---------------------------------------------------------------------------

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$fn$;

-- On sign-out, so the next person to use the phone does not get this
-- account's notifications.
create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $fn$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$fn$;

-- ---------------------------------------------------------------------------
-- notify_user: the one writer
-- ---------------------------------------------------------------------------
-- Internal. Execute is revoked from every client role below; it is reached
-- only from the security-definer triggers in this file.

create or replace function public.notify_user(
  p_user         uuid,
  p_kind         text,
  p_title        text,
  p_body         text,
  p_payload      jsonb default '{}',
  p_collapse_key text default null,
  -- False when the recipient muted the thing this is about.
  p_push         boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id       uuid;
  v_category text;
  v_wanted   boolean;
  v_endpoint text;
begin
  if p_user is null then
    return;
  end if;

  v_category := case
    when p_kind = 'message_new'   then 'messages'
    when p_kind = 'listing_review' then 'listings'
    when p_kind like 'saved\_%'   then 'saved'
    when p_kind like 'booking\_%' then 'bookings'
    else 'account'
  end;

  if p_collapse_key is not null then
    update public.notifications
    set title = p_title, body = left(p_body, 300), payload = p_payload,
        created_at = now(), pushed_at = null
    where id = (
      select id from public.notifications
      where user_id = p_user and kind = p_kind
        and collapse_key = p_collapse_key and read_at is null
      order by created_at desc
      limit 1
    )
    returning id into v_id;
  end if;

  if v_id is null then
    insert into public.notifications (user_id, kind, category, title, body, payload, collapse_key)
    values (p_user, p_kind, v_category, p_title, left(p_body, 300), p_payload, p_collapse_key)
    returning id into v_id;
  end if;

  -- The list always records. Preferences decide only whether the phone buzzes,
  -- and nothing switches off 'account'.
  v_wanted := p_push
    and exists (select 1 from public.push_tokens where user_id = p_user)
    and (
      v_category = 'account'
      or coalesce((
        select case v_category
                 when 'messages' then messages
                 when 'listings' then listings
                 when 'saved'    then saved
                 else bookings
               end
        from public.notification_preferences where user_id = p_user
      ), true)
    );

  select endpoint into v_endpoint from public.push_config;

  if v_wanted and v_endpoint is not null then
    -- A failure to queue a push must never undo the message, decision or
    -- suspension that caused it.
    begin
      perform net.http_post(
        url := v_endpoint,
        body := jsonb_build_object('notification_id', v_id)
      );
    exception when others then
      raise warning 'push not queued for notification %: %', v_id, sqlerrm;
    end;
  else
    update public.notifications set pushed_at = now() where id = v_id;
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------

-- New message. Replaces the chat migration's function to add the last block.
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c       public.conversations%rowtype;
  v_other uuid;
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 140),
      last_message_sender_id = new.sender_id
  where id = new.conversation_id
  returning * into c;

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

  -- System messages are announced by whatever wrote them (booking), with
  -- better words than a copy of the message.
  if new.kind = 'text' and new.sender_id is not null then
    v_other := case when new.sender_id = c.renter_id then c.landlord_id else c.renter_id end;
    perform public.notify_user(
      v_other,
      'message_new',
      coalesce((select full_name from public.profiles where id = new.sender_id), 'New message'),
      -- The stored body, so a masked number stays masked on the lock screen.
      new.body,
      jsonb_build_object('conversation_id', c.id, 'listing_title', c.listing_title),
      c.id::text,
      not coalesce((
        select muted from public.conversation_participants
        where conversation_id = c.id and user_id = v_other
      ), false)
    );
  end if;

  return new;
end;
$fn$;

-- Verification decided: the landlord's ID, or one of their listings.
create or replace function public.verification_cases_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_title text;
begin
  if new.status is not distinct from old.status
     or new.status not in ('approved', 'rejected', 'changes_requested') then
    return new;
  end if;

  if new.subject_type = 'landlord' then
    perform public.notify_user(
      new.profile_id,
      'verification_decided',
      case new.status
        when 'approved' then 'Your ID was checked'
        when 'rejected' then 'Your ID was not accepted'
        else 'We need another photo of your ID'
      end,
      coalesce(new.decision_note,
               case when new.status = 'approved'
                    then 'Your listings can now be reviewed and go live.' end),
      jsonb_build_object('case_id', new.id, 'status', new.status)
    );
  else
    select title into v_title from public.listings where id = new.listing_id;
    perform public.notify_user(
      new.profile_id,
      'listing_review',
      case new.status
        when 'approved' then 'Your listing is live'
        when 'rejected' then 'Your listing was not approved'
        else 'Your listing needs changes'
      end,
      concat_ws(': ', v_title, new.decision_note),
      jsonb_build_object('case_id', new.id, 'listing_id', new.listing_id, 'status', new.status)
    );
  end if;

  return new;
end;
$fn$;

create trigger verification_cases_notify
  after update of status on public.verification_cases
  for each row execute function public.verification_cases_notify();

-- A report was closed. Automated reports have no reporter and notify nobody.
create or replace function public.reports_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.status in ('resolved', 'dismissed') and old.status not in ('resolved', 'dismissed') then
    perform public.notify_user(
      new.reporter_id,
      'report_resolved',
      'Your report was reviewed',
      coalesce(
        new.resolution_note,
        case new.action_taken
          when 'listing_suspended' then 'We suspended the listing.'
          when 'account_suspended' then 'We suspended the account.'
        end,
        'We looked at it and took no action.'
      ),
      jsonb_build_object('report_id', new.id)
    );
  end if;
  return new;
end;
$fn$;

create trigger reports_notify
  after update of status on public.reports
  for each row execute function public.reports_notify();

create or replace function public.listing_suspensions_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  l public.listings%rowtype;
begin
  select * into l from public.listings where id = new.listing_id;

  if tg_op = 'INSERT' then
    perform public.notify_user(
      l.owner_id, 'listing_suspended', 'A listing of yours was suspended',
      concat_ws(': ', l.title, new.note),
      jsonb_build_object('listing_id', l.id)
    );
  elsif new.lifted_at is not null and old.lifted_at is null then
    perform public.notify_user(
      l.owner_id, 'listing_restored', 'Your listing was restored',
      concat_ws(': ', l.title, new.lift_note),
      jsonb_build_object('listing_id', l.id)
    );
  end if;
  return new;
end;
$fn$;

create trigger listing_suspensions_notify
  after insert or update on public.listing_suspensions
  for each row execute function public.listing_suspensions_notify();

create or replace function public.account_restrictions_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    perform public.notify_user(
      new.user_id, 'account_suspended', 'Your account was suspended', new.note, '{}'
    );
  elsif new.lifted_at is not null and old.lifted_at is null then
    perform public.notify_user(
      new.user_id, 'account_restored', 'Your account was restored', new.lift_note, '{}'
    );
  end if;
  return new;
end;
$fn$;

create trigger account_restrictions_notify
  after insert or update on public.account_restrictions
  for each row execute function public.account_restrictions_notify();

-- A saved listing got cheaper, or stopped being available. Suspension is not
-- announced: the listing simply leaves the saved list, as moderation intends.
create or replace function public.listings_notify_favoriters()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_kind  text;
  v_title text;
  v_body  text;
  f       record;
begin
  if new.status = 'published' and old.status = 'published'
     and new.price_rwf < old.price_rwf then
    v_kind := 'saved_price_drop';
    v_title := 'Price dropped on a saved rental';
    v_body := new.title || ': now ' || to_char(new.price_rwf, 'FM999,999,999') || ' RWF';
  elsif old.status = 'published' and new.status in ('rented', 'unavailable') then
    v_kind := 'saved_unavailable';
    v_title := 'A saved rental is no longer available';
    v_body := new.title;
  else
    return new;
  end if;

  for f in
    select user_id from public.favorites
    where listing_id = new.id and user_id <> new.owner_id
  loop
    perform public.notify_user(
      f.user_id, v_kind, v_title, v_body,
      jsonb_build_object('listing_id', new.id), new.id::text
    );
  end loop;

  return new;
end;
$fn$;

create trigger listings_notify_favoriters
  after update of status, price_rwf on public.listings
  for each row execute function public.listings_notify_favoriters();

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------

-- Supabase grants execute on new functions to anon and authenticated by
-- default, so "internal" has to be said out loud.
revoke execute on function public.notify_user(uuid, text, text, text, jsonb, text, boolean)
  from public, anon, authenticated;

revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
