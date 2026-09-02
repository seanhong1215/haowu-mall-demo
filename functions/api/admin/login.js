import { json, errorJson } from "../../lib/json.js";
import { createSessionToken } from "../../lib/auth.js";

// POST /api/admin/login  Body: { password }
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  const expected = env.ADMIN_PASSWORD || "demo1234";

  if (!body || body.password !== expected) {
    return errorJson("Incorrect password", 401);
  }

  const token = await createSessionToken(env, "admin", 0);
  return json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `admin_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`,
      },
    }
  );
}
