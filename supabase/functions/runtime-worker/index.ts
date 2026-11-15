import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Pool } from "jsr:@db/postgres@0.19.5";

type Task = {
  id: string;
  task_type: string;
  payload: Record<string, unknown>;
  lease_token: string;
  attempts: number;
};

type ClaimResult = { rows: Task[] };
type BooleanResult = { rows: Array<{ ok: boolean }> };
type StatusResult = { rows: Array<{ status: string }> };

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

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return json({ service: "daily1000-runtime-worker", status: "ready", mode: "service-role invocation only" });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Gateway verifies the JWT; the role claim narrows queue execution to service_role.
  if (jwtRole(req) !== "service_role") return json({ error: "service_role_required" }, 403);
  if (!pool) return json({ error: "database_environment_incomplete" }, 503);

  const workerId = `edge-worker-${crypto.randomUUID()}`;
  const connection = await pool.connect();
  let task: Task | null = null;
  try {
    const claimed = await connection.queryObject<Task>`select * from revenue_runtime.claim_task(${workerId}, 60)`;
    task = claimed.rows[0] ?? null;
    if (!task) return json({ worker_id: workerId, worked: false, status: "idle" });

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
    return json({ worker_id: workerId, worked: true, task_id: task.id, status: "succeeded", result });
  } catch (error) {
    if (task) {
      const message = String(error instanceof Error ? error.message : error).slice(0, 1000);
      const failed = await connection.queryObject<StatusResult["rows"][number]>`
        select revenue_runtime.fail_task(
          ${task.id}::uuid, ${workerId}, ${task.lease_token}::uuid, ${message}, 30
        ) as status
      `;
      if (!failed.rows[0]?.status) return json({ error: "handler_and_failure_recording_failed", task_id: task.id }, 500);
      return json({ worker_id: workerId, worked: true, task_id: task.id, status: failed.rows[0].status }, 500);
    }
    return json({ error: "claim_failed", detail: String(error instanceof Error ? error.message : error).slice(0, 1000) }, 500);
  } finally {
    connection.release();
  }
});
