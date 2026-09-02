import { json } from "../../lib/json.js";

// POST /api/customers/logout
export async function onRequestPost() {
  return json(
    { ok: true },
    { headers: { "Set-Cookie": "customer_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" } }
  );
}
