import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Pool } from "jsr:@db/postgres@0.19.5";

type Task = {
  id: string;
  task_type: string;
  payload: Record<string, unknown>;
  lease_token: string;
  attempts: number;
  max_attempts: number;
  status: string;
  available_at: Date | string;
  lease_expires_at: Date | string | null;
  result: Record<string, unknown> | null;
};

type ClaimResult = { rows: Task[] };
type BooleanResult = { rows: Array<{ ok: boolean }> };
type StatusResult = { rows: Array<{ status: string }> };
type AuditCounts = { queued: number; claimed: number; succeeded: number };
type AuditResult = { rows: AuditCounts[] };

function jwtRole(req: Request): string | null {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

// Edge Functions use a one-connection pool and talk directly to Postgres.
// This keeps revenue_runtime outside the Supabase Data API exposed schemas.
const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
const pool = databaseUrl ? new Pool(databaseUrl, 1) : null;

async function readAudit(connection: any, taskId: string): Promise<AuditCounts> {
  const audit = await connection.queryObject<AuditCounts>`
    select
      count(*) filter (where event_type = 'task.queued')::int as queued,
      count(*) filter (where event_type = 'task.claimed')::int as claimed,
      count(*) filter (where event_type = 'task.succeeded')::int as succeeded
    from revenue_runtime.task_events
    where task_id = ${taskId}::uuid
  `;
  return audit.rows[0] ?? { queued: 0, claimed: 0, succeeded: 0 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return json({ service: "daily1000-runtime-worker", status: "ready", mode: "service-role invocation only" });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Gateway verifies the JWT; the role claim narrows queue execution to service_role.
  if (jwtRole(req) !== "service_role") return json({ error: "service_role_required" }, 403);
  if (!pool) return json({ error: "database_environment_incomplete" }, 503);

  let requestBody: { mode?: string; idempotency_key?: string };
  try {
    requestBody = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return json({ error: "invalid_request_body" }, 400);
  }
  if (requestBody.mode !== "smoke_test") {
    return json({ error: "unsupported_mode", allowed_modes: ["smoke_test"] }, 400);
  }
  const idempotencyKey = requestBody.idempotency_key;
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,180}$/.test(idempotencyKey)) {
    return json({ error: "invalid_idempotency_key" }, 400);
  }

  const workerId = `edge-worker-${crypto.randomUUID()}`;
  const connection = await pool.connect();
  let task: Task | null = null;
  try {
    await connection.queryArray`begin`;
    const queued = await connection.queryObject<{ id: string }>`
      insert into revenue_runtime.tasks
        (task_type, payload, idempotency_key, priority, max_attempts)
      values ('runtime.health_check', '{}'::jsonb, ${idempotencyKey}, 100, 3)
      on conflict (idempotency_key) do nothing
      returning id
    `;
    if (queued.rows[0]) {
      await connection.queryArray`
        insert into revenue_runtime.task_events(task_id, event_type, detail)
        values (${queued.rows[0].id}::uuid, 'task.queued', '{"source":"authenticated_smoke_test"}'::jsonb)
      `;
    }

    // Lock the exact idempotency record. Never claim an unrelated queue item.
    const existing = await connection.queryObject<Task>`
      select * from revenue_runtime.tasks
       where idempotency_key = ${idempotencyKey}
       for update
    `;
    task = existing.rows[0] ?? null;
    if (!task) throw new Error("idempotency_record_missing");

    if (task.status === "succeeded") {
      await connection.queryArray`commit`;
      const audit = await readAudit(connection, task.id);
      return json({ worker_id: workerId, worked: true, task_id: task.id, status: "succeeded", result: task.result, audit, idempotent_replay: true });
    }
    if (task.status === "failed" || task.status === "cancelled") {
      await connection.queryArray`commit`;
      return json({ worker_id: workerId, worked: false, task_id: task.id, status: task.status, idempotent_replay: true }, 409);
    }
    if (task.status === "running") {
      const expiry = task.lease_expires_at ? new Date(task.lease_expires_at).getTime() : 0;
      if (expiry > Date.now()) {
        await connection.queryArray`commit`;
        return json({ worker_id: workerId, worked: false, task_id: task.id, status: "in_progress", idempotent_replay: true }, 202);
      }
      if (task.attempts >= task.max_attempts) {
        await connection.queryArray`
          update revenue_runtime.tasks
             set status = 'failed', lease_owner = null, lease_token = null,
                 lease_expires_at = null, last_error = 'Worker lease expired',
                 completed_at = now(), updated_at = now()
           where id = ${task.id}::uuid
        `;
        await connection.queryArray`
          insert into revenue_runtime.task_events(task_id,event_type,attempt,detail)
          values (${task.id}::uuid,'task.dead_lettered',${task.attempts},'{"reason":"lease_expired"}'::jsonb)
        `;
        await connection.queryArray`commit`;
        return json({ worker_id: workerId, worked: false, task_id: task.id, status: "failed" }, 409);
      }
      await connection.queryArray`
        update revenue_runtime.tasks
           set status = 'queued', lease_owner = null, lease_token = null,
               lease_expires_at = null, available_at = now(), updated_at = now()
         where id = ${task.id}::uuid
      `;
      await connection.queryArray`
        insert into revenue_runtime.task_events(task_id,event_type,attempt,detail)
        values (${task.id}::uuid,'task.lease_expired',${task.attempts},'{"source":"idempotent_recovery"}'::jsonb)
      `;
      task.status = "queued";
    }
    if (task.status !== "queued") throw new Error("unexpected_task_state");
    if (new Date(task.available_at).getTime() > Date.now()) {
      await connection.queryArray`commit`;
      return json({ worker_id: workerId, worked: false, task_id: task.id, status: "retry_wait", idempotent_replay: true }, 202);
    }
    const claimed = await connection.queryObject<Task>`
      update revenue_runtime.tasks
         set status = 'running', attempts = attempts + 1,
             lease_owner = ${workerId}, lease_token = gen_random_uuid(),
             lease_expires_at = now() + interval '60 seconds', updated_at = now()
       where id = ${task.id}::uuid and status = 'queued'
       returning *
    `;
    task = claimed.rows[0] ?? null;
    if (!task) throw new Error("targeted_claim_failed");
    await connection.queryArray`
      insert into revenue_runtime.task_events(task_id,event_type,worker_id,attempt)
      values (${task.id}::uuid,'task.claimed',${workerId},${task.attempts})
    `;
    await connection.queryArray`commit`;

    let result: Record<string, unknown>;
    if (task.task_type === "runtime.health_check") {
      result = {
        ok: true,
        task_id: task.id,
        checked_at: new Date().toISOString(),
        runtime: "supabase-edge"
      };
    } else {
      const failed = await connection.queryObject<StatusResult["rows"][number]>`
        select revenue_runtime.fail_task(
          ${task.id}::uuid, ${workerId}, ${task.lease_token}::uuid,
          ${`No Edge handler registered for task type: ${task.task_type}`}, 30
        ) as status
      `;
      return json({ worker_id: workerId, worked: true, task_id: task.id, status: failed.rows[0]?.status, reason: "handler_missing" });
    }

    const completed = await connection.queryObject<BooleanResult["rows"][number]>`
      select revenue_runtime.complete_task(
        ${task.id}::uuid, ${workerId}, ${task.lease_token}::uuid,
        ${JSON.stringify(result)}::jsonb
      ) as ok
    `;
    if (completed.rows[0]?.ok !== true) return json({ error: "completion_rejected", task_id: task.id }, 409);
    const audit = await readAudit(connection, task.id);
    return json({ worker_id: workerId, worked: true, task_id: task.id, status: "succeeded", result, audit });
  } catch (error) {
    try { await connection.queryArray`rollback`; } catch { /* transaction may already be closed */ }
    if (task) {
      const message = String(error instanceof Error ? error.message : error).slice(0, 1000);
      try {
        const failed = await connection.queryObject<StatusResult["rows"][number]>`
          select revenue_runtime.fail_task(
            ${task.id}::uuid, ${workerId}, ${task.lease_token}::uuid, ${message}, 30
          ) as status
        `;
        if (!failed.rows[0]?.status) {
          return json({ error: "failure_recording_rejected", task_id: task.id }, 500);
        }
        return json({ worker_id: workerId, worked: true, task_id: task.id, status: failed.rows[0].status }, 500);
      } catch {
        // Preserve the original failure boundary; lease expiry recovery remains the final safety net.
        return json({ error: "failure_recording_unavailable", task_id: task.id }, 500);
      }
    }
    // Do not return raw database/driver errors to an authenticated caller.
    return json({ error: "claim_failed" }, 500);
  } finally {
    connection.release();
  }
});
