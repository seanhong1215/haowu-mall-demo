import { json } from "../../lib/json.js";

// POST /api/admin/logout
export async function onRequestPost() {
  return json(
    { ok: true },
    { headers: { "Set-Cookie": "admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" } }
  );
}
