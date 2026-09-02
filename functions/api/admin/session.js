import { json } from "../../lib/json.js";
import { requireAdmin } from "../../lib/auth.js";

// GET /api/admin/session — lets the admin dashboard check whether it's logged in
export async function onRequestGet({ request, env }) {
  const ok = await requireAdmin(request, env);
  return json({ authenticated: ok });
}
