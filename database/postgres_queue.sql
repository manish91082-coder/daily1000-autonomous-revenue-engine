-- DESIGN DRAFT: transactional PostgreSQL queue for the autonomous revenue runtime.
-- Not applied to any live database. Review and deploy only to a dedicated project.
-- Keep this schema outside Supabase's exposed public schema.

create schema if not exists revenue_runtime;

create table if not exists revenue_runtime.tasks (
  id uuid primary key default gen_random_uuid(),
  task_type text not null check (length(task_type) between 1 and 160),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  priority integer not null default 0,
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  result jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    (status = 'running' and lease_owner is not null and lease_token is not null and lease_expires_at is not null)
    or
    (status <> 'running' and lease_owner is null and lease_token is null and lease_expires_at is null)
  )
);

create index if not exists tasks_claim_idx
  on revenue_runtime.tasks (priority desc, available_at asc, created_at asc)
  where status = 'queued';

create index if not exists tasks_expired_lease_idx
  on revenue_runtime.tasks (lease_expires_at)
  where status = 'running';

create table if not exists revenue_runtime.task_events (
  event_id bigint generated always as identity primary key,
  task_id uuid not null references revenue_runtime.tasks(id) on delete restrict,
  event_type text not null,
  worker_id text,
  attempt integer,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists task_events_task_time_idx
  on revenue_runtime.task_events (task_id, occurred_at desc);

alter table revenue_runtime.tasks enable row level security;
alter table revenue_runtime.task_events enable row level security;

-- Atomic claim: concurrent workers skip rows already locked by another claimant.
-- Expired leases are re-queued or terminally failed before the next claim.
create or replace function revenue_runtime.claim_task(
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns setof revenue_runtime.tasks
language plpgsql
set search_path = pg_catalog, revenue_runtime
as $$
declare
  v_task revenue_runtime.tasks%rowtype;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'worker_id_required';
  end if;
  if p_lease_seconds < 5 or p_lease_seconds > 3600 then
    raise exception 'lease_seconds_out_of_range';
  end if;

  with expired as (
    update revenue_runtime.tasks t
       set status = case when t.attempts >= t.max_attempts then 'failed' else 'queued' end,
           lease_owner = null,
           lease_token = null,
           lease_expires_at = null,
           last_error = coalesce(t.last_error, 'Worker lease expired'),
           updated_at = now(),
           completed_at = case when t.attempts >= t.max_attempts then now() else null end
     where t.status = 'running' and t.lease_expires_at <= now()
     returning t.id, t.status, t.attempts
  )
  insert into revenue_runtime.task_events(task_id,event_type,attempt,detail)
  select id, case when status = 'failed' then 'task.dead_lettered' else 'task.lease_expired' end,
         attempts, jsonb_build_object('reason','lease_expired')
    from expired;

  select * into v_task
    from revenue_runtime.tasks t
   where t.status = 'queued' and t.available_at <= now()
   order by t.priority desc, t.available_at asc, t.created_at asc
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update revenue_runtime.tasks
     set status = 'running',
         attempts = attempts + 1,
         lease_owner = p_worker_id,
         lease_token = gen_random_uuid(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where id = v_task.id
   returning * into v_task;

  insert into revenue_runtime.task_events(task_id,event_type,worker_id,attempt)
  values (v_task.id,'task.claimed',p_worker_id,v_task.attempts);

  return next v_task;
end;
$$;

create or replace function revenue_runtime.heartbeat_task(
  p_task_id uuid, p_worker_id text, p_lease_token uuid, p_lease_seconds integer default 60
)
returns boolean
language plpgsql
set search_path = pg_catalog, revenue_runtime
as $$
declare v_updated integer;
begin
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 3600 then
    raise exception 'lease_seconds_out_of_range';
  end if;
  if p_worker_id is null or length(trim(p_worker_id)) = 0 or p_lease_token is null then
    raise exception 'lease_identity_required';
  end if;
  update revenue_runtime.tasks
     set lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where id = p_task_id and status = 'running' and lease_owner = p_worker_id and lease_token = p_lease_token;
  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    insert into revenue_runtime.task_events(task_id,event_type,worker_id,attempt)
    select id,'task.heartbeat',p_worker_id,attempt
      from revenue_runtime.tasks where id = p_task_id;
  end if;
  return v_updated = 1;
end;
$$;

create or replace function revenue_runtime.complete_task(
  p_task_id uuid, p_worker_id text, p_lease_token uuid, p_result jsonb default null
)
returns boolean
language plpgsql
set search_path = pg_catalog, revenue_runtime
as $$
declare v_attempt integer;
begin
  update revenue_runtime.tasks
     set status = 'succeeded', result = p_result,
         lease_owner = null, lease_token = null, lease_expires_at = null,
         completed_at = now(), updated_at = now()
   where id = p_task_id and status = 'running' and lease_owner = p_worker_id and lease_token = p_lease_token
   returning attempts into v_attempt;
  if not found then return false; end if;
  insert into revenue_runtime.task_events(task_id,event_type,worker_id,attempt)
  values (p_task_id,'task.succeeded',p_worker_id,v_attempt);
  return true;
end;
$$;

create or replace function revenue_runtime.fail_task(
  p_task_id uuid, p_worker_id text, p_lease_token uuid, p_error text,
  p_retry_delay_seconds integer default 15
)
returns text
language plpgsql
set search_path = pg_catalog, revenue_runtime
as $$
declare v_task revenue_runtime.tasks%rowtype;
begin
  update revenue_runtime.tasks
     set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
         available_at = case when attempts >= max_attempts then available_at
                             else now() + make_interval(secs => greatest(1, least(p_retry_delay_seconds, 86400))) end,
         lease_owner = null, lease_token = null, lease_expires_at = null,
         last_error = left(coalesce(p_error,'unknown_error'),4000),
         completed_at = case when attempts >= max_attempts then now() else null end,
         updated_at = now()
   where id = p_task_id and status = 'running' and lease_owner = p_worker_id and lease_token = p_lease_token
   returning * into v_task;
  if not found then return 'lease_not_owned'; end if;
  insert into revenue_runtime.task_events(task_id,event_type,worker_id,attempt,detail)
  values (v_task.id,
          case when v_task.status = 'failed' then 'task.dead_lettered' else 'task.retry_scheduled' end,
          p_worker_id,v_task.attempts,jsonb_build_object('error',v_task.last_error,'available_at',v_task.available_at));
  return v_task.status;
end;
$$;

comment on schema revenue_runtime is
  'Private internal queue schema. Do not expose through the Supabase Data API.';

-- Supabase-oriented least-privilege baseline: only the server-side service role
-- may access this private queue schema. Never expose it through the Data API.
revoke all on schema revenue_runtime from public, anon, authenticated;
revoke all on all tables in schema revenue_runtime from public, anon, authenticated;
revoke execute on all functions in schema revenue_runtime from public, anon, authenticated;
grant usage on schema revenue_runtime to service_role;
grant select, insert, update on all tables in schema revenue_runtime to service_role;
grant usage, select on all sequences in schema revenue_runtime to service_role;
grant execute on all functions in schema revenue_runtime to service_role;
