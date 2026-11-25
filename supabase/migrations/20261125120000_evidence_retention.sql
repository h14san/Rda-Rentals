-- Identity and ownership documents are deleted on a fixed schedule after the
-- decision, as stated in the data-controller registration (NCSA, 2026-11-25):
--
--   * 30 days after a case is approved or rejected. Long enough for a landlord
--     to question a refusal, or for staff to look again at a fraud report soon
--     after approval. The badge, the decision and the audit log stay; only the
--     photos go.
--   * 90 days after staff asked for changes, if the landlord never answered.
--     An abandoned case would otherwise keep an ID photo forever. If they come
--     back later they upload a fresh photo, as they would anyway.
--
-- The files are in Storage, and deleting storage.objects rows in SQL leaves the
-- files behind, so the deleting is done by the purge-evidence Edge Function
-- through the Storage API. This file decides what is due and records what was
-- removed; the function does the removing, files first, rows second.

alter table public.verification_cases add column evidence_purged_at timestamptz;

create or replace function public.evidence_due_for_purge(p_limit integer default 500)
returns table (evidence_id uuid, case_id uuid, storage_path text)
language sql
stable
security definer
set search_path = public
as $fn$
  select e.id, e.case_id, e.storage_path
  from public.verification_evidence e
  join public.verification_cases c on c.id = e.case_id
  where c.decided_at is not null
    and (
      (c.status in ('approved', 'rejected') and c.decided_at < now() - interval '30 days')
      or (c.status = 'changes_requested' and c.decided_at < now() - interval '90 days')
    )
  order by c.decided_at
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$fn$;

-- Called by the function after the files are gone. Deletes the rows, stamps
-- the case so the review screen can say why it has no documents, and logs one
-- event per case.
create or replace function public.mark_evidence_purged(p_evidence_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with gone as (
    delete from public.verification_evidence
    where id = any (p_evidence_ids)
    returning case_id
  ), cases as (
    select distinct case_id from gone
  ), stamped as (
    update public.verification_cases c
    set evidence_purged_at = now()
    from cases
    where c.id = cases.case_id
    returning c.id
  ), logged as (
    insert into public.verification_events (case_id, actor, action)
    select id, null, 'evidence_purged' from stamped
    returning 1
  )
  select count(*) into v_count from logged;

  return v_count;
end;
$fn$;

-- Internal: only the service role (the Edge Function) may call either. Supabase
-- grants execute on every new function to anon and authenticated by default.
revoke execute on function public.evidence_due_for_purge(integer) from public, anon, authenticated;
revoke execute on function public.mark_evidence_purged(uuid[]) from public, anon, authenticated;
grant execute on function public.evidence_due_for_purge(integer) to service_role;
grant execute on function public.mark_evidence_purged(uuid[]) to service_role;

-- Where the cron job sends its request. A row, not a literal in the schedule,
-- for the same reason as push_config: another project needs one update.
create table public.purge_config (
  id       boolean primary key default true check (id),
  endpoint text
);
alter table public.purge_config enable row level security;  -- no policy

insert into public.purge_config (endpoint)
values ('https://urfmftxepopqmhhmzpqh.supabase.co/functions/v1/purge-evidence');

create or replace function public.queue_evidence_purge()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_endpoint text;
begin
  select endpoint into v_endpoint from public.purge_config;
  if v_endpoint is null then
    return;
  end if;
  -- Nothing is sent when nothing is due, so most nights make no request.
  if not exists (select 1 from public.evidence_due_for_purge(1)) then
    return;
  end if;
  perform net.http_post(url := v_endpoint, body := '{}'::jsonb);
end;
$fn$;

revoke execute on function public.queue_evidence_purge() from public, anon, authenticated;

do $cron$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-evidence', '30 2 * * *', 'select public.queue_evidence_purge()');
exception when others then
  raise notice 'pg_cron not scheduled (%); run select public.queue_evidence_purge() by hand.', sqlerrm;
end;
$cron$;
