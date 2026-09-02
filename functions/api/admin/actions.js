import { json, errorJson } from "../../lib/json.js";
import { requireAdmin } from "../../lib/auth.js";

// GET /api/admin/actions — admin only. Recent back-office activity (order
// status changes, inventory/price edits), newest first.
export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("未授權，請重新登入後台", 401);

  const { results: actions } = await env.DB.prepare(
    `SELECT * FROM admin_actions ORDER BY created_at DESC LIMIT 100`
  ).all();

  return json({ actions });
}
