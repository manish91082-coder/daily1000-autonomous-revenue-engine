import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Task = {
  id: string;
  task_type: string;
  payload: Record<string, unknown>;
  lease_token: string;
  attempts: number;
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return json({ service: "daily1000-runtime-worker", status: "ready", mode: "service-role invocation only" });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Supabase gateway verifies the JWT. Restrict execution to service_role tokens;
  // ordinary signed-in users must never be able to consume internal queue work.
  if (jwtRole(req) !== "service_role") return json({ error: "service_role_required" }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "runtime_environment_incomplete" }, 503);

  const db = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: "revenue_runtime" },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const workerId = `edge-worker-${crypto.randomUUID()}`;

  const { data: claimed, error: claimError } = await db.rpc("claim_task", {
    p_worker_id: workerId,
    p_lease_seconds: 60
  });
  if (claimError) return json({ error: "claim_failed", detail: claimError.message }, 500);

  const task = (Array.isArray(claimed) ? claimed[0] : claimed) as Task | null;
  if (!task) return json({ worker_id: workerId, worked: false, status: "idle" });

  try {
    let result: Record<string, unknown>;
    if (task.task_type === "runtime.health_check") {
      result = {
        ok: true,
        task_id: task.id,
        checked_at: new Date().toISOString(),
        runtime: "supabase-edge"
      };
    } else {
      const { data: failedStatus, error: failError } = await db.rpc("fail_task", {
        p_task_id: task.id,
        p_worker_id: workerId,
        p_lease_token: task.lease_token,
        p_error: `No Edge handler registered for task type: ${task.task_type}`,
        p_retry_delay_seconds: 30
      });
      if (failError) return json({ error: "unhandled_task_failure_recording_failed", task_id: task.id }, 500);
      return json({ worker_id: workerId, worked: true, task_id: task.id, status: failedStatus, reason: "handler_missing" });
    }

    const { data: completed, error: completeError } = await db.rpc("complete_task", {
      p_task_id: task.id,
      p_worker_id: workerId,
      p_lease_token: task.lease_token,
      p_result: result
    });
    if (completeError || completed !== true) {
      return json({ error: "completion_rejected", task_id: task.id }, 409);
    }
    return json({ worker_id: workerId, worked: true, task_id: task.id, status: "succeeded", result });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 1000);
    const { error: failError } = await db.rpc("fail_task", {
      p_task_id: task.id,
      p_worker_id: workerId,
      p_lease_token: task.lease_token,
      p_error: message,
      p_retry_delay_seconds: 30
    });
    if (failError) return json({ error: "handler_and_failure_recording_failed", task_id: task.id }, 500);
    return json({ worker_id: workerId, worked: true, task_id: task.id, status: "retry_scheduled" }, 500);
  }
});
