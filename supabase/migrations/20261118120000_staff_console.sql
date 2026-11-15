-- What the in-app staff console needs beyond the queues: granting roles, one
-- audit timeline, and counts.
--
-- Blueprint §40, §62 / Features #56, #57, #58. Searching users and listings
-- needs nothing new: profiles are readable by any signed-in user, and staff
-- already have a select policy on listings.

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------

-- An admin sees who the staff are. A verifier still sees only their own row.
create policy user_roles_select_admin on public.user_roles
  for select to authenticated using ((select public.has_role('admin')));

-- Replaces "grant roles from the SQL editor". Admin only, logged, and two
-- things it will not do: remove the caller's own admin role (another admin
-- must), or leave the project with no admin at all.
create or replace function public.set_staff_role(
  p_user_id uuid,
  p_role    text,
  p_grant   boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.has_role('admin') then
    raise exception 'Only an admin can change staff roles.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role not in ('admin', 'verifier') then
    raise exception 'Unknown role: %.', p_role using errcode = 'invalid_parameter_value';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Account not found.' using errcode = 'no_data_found';
  end if;

  if p_grant then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user_id, p_role, auth.uid())
    on conflict (user_id, role) do nothing;
    if not found then
      return;  -- already held; nothing changed, so nothing to log
    end if;
  else
    if p_role = 'admin' then
      if p_user_id = auth.uid() then
        raise exception 'You cannot remove your own admin role. Ask another admin.'
          using errcode = 'insufficient_privilege';
      end if;
      if (select count(*) from public.user_roles where role = 'admin') <= 1 then
        raise exception 'This is the last admin.' using errcode = 'insufficient_privilege';
      end if;
    end if;

    delete from public.user_roles where user_id = p_user_id and role = p_role;
    if not found then
      return;
    end if;
  end if;

  insert into public.moderation_events (action, subject_type, subject_id, note)
  values (case when p_grant then 'role_granted' else 'role_revoked' end,
          'user', p_user_id, p_role);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- audit timeline
-- ---------------------------------------------------------------------------
-- verification_events and moderation_events as one list, newest first. A
-- function rather than a view so the role check is explicit, and so the names
-- beside each id come back in the same round trip.

create or replace function public.staff_audit_log(
  p_actor      uuid default null,
  p_subject_id uuid default null,
  p_limit      integer default 100
)
returns table (
  source        text,
  event_id      bigint,
  at            timestamptz,
  actor         uuid,
  actor_name    text,
  action        text,
  subject_type  text,
  subject_id    uuid,
  subject_label text,
  note          text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.has_role('verifier') then
    raise exception 'Only staff can read the audit log.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select * from (
    select
      'verification'::text,
      e.id,
      e.at,
      e.actor,
      ap.full_name,
      e.action,
      case c.subject_type when 'landlord' then 'user' else 'listing' end,
      coalesce(c.listing_id, c.profile_id),
      case c.subject_type when 'landlord' then sp.full_name else l.title end,
      e.note
    from public.verification_events e
    join public.verification_cases c on c.id = e.case_id
    left join public.profiles ap on ap.id = e.actor
    left join public.profiles sp on sp.id = c.profile_id
    left join public.listings l on l.id = c.listing_id
    where (p_actor is null or e.actor = p_actor)
      -- A listing's review belongs on its owner's timeline too.
      and (p_subject_id is null or c.listing_id = p_subject_id or c.profile_id = p_subject_id)

    union all

    select
      'moderation'::text,
      m.id,
      m.at,
      m.actor,
      ap.full_name,
      m.action,
      m.subject_type,
      m.subject_id,
      case m.subject_type
        when 'user' then sp.full_name
        when 'listing' then l.title
        when 'conversation' then cv.listing_title
        else null
      end,
      m.note
    from public.moderation_events m
    left join public.profiles ap on ap.id = m.actor
    left join public.profiles sp on m.subject_type = 'user' and sp.id = m.subject_id
    left join public.listings l on m.subject_type = 'listing' and l.id = m.subject_id
    left join public.conversations cv on m.subject_type = 'conversation' and cv.id = m.subject_id
    where (p_actor is null or m.actor = p_actor)
      and (p_subject_id is null or m.subject_id = p_subject_id)
  ) events (source, event_id, at, actor, actor_name, action, subject_type, subject_id,
            subject_label, note)
  order by at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- counts
-- ---------------------------------------------------------------------------
-- Counts only, from one function (§62). No names, no rows: this is the whole
-- of analytics until a third-party tool has had its data location checked.

create or replace function public.staff_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.has_role('verifier') then
    raise exception 'Only staff can read the statistics.'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'listings_by_status', (
      select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
      from (select status, count(*) as n from public.listings group by status) s
    ),
    'open_cases', (
      select count(*) from public.verification_cases
      where status in ('submitted', 'changes_requested')
    ),
    'open_reports', (
      select count(*) from public.reports
      where status in ('open', 'in_review') and reporter_id is not null
    ),
    'open_flags', (
      select count(*) from public.reports
      where status in ('open', 'in_review') and reporter_id is null
    ),
    'suspended_accounts', (
      select count(*) from public.account_restrictions where lifted_at is null
    ),
    'users', (select count(*) from public.profiles),
    'weekly', (
      select jsonb_agg(jsonb_build_object(
        'week', w::date,
        'new_users', (
          select count(*) from public.profiles
          where created_at >= w and created_at < w + interval '7 days'
        ),
        'new_conversations', (
          select count(*) from public.conversations
          where created_at >= w and created_at < w + interval '7 days'
        )
      ) order by w desc)
      from generate_series(
        date_trunc('week', now()) - interval '7 weeks',
        date_trunc('week', now()),
        interval '1 week'
      ) w
    )
  );
end;
$fn$;

revoke execute on function public.set_staff_role(uuid, text, boolean) from public, anon;
revoke execute on function public.staff_audit_log(uuid, uuid, integer) from public, anon;
revoke execute on function public.staff_stats() from public, anon;
grant execute on function public.set_staff_role(uuid, text, boolean) to authenticated;
grant execute on function public.staff_audit_log(uuid, uuid, integer) to authenticated;
grant execute on function public.staff_stats() to authenticated;
