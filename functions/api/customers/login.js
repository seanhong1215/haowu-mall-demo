import { json, errorJson } from "../../lib/json.js";
import { createSessionToken } from "../../lib/auth.js";
import { verifyPassword } from "../../lib/password.js";

// POST /api/customers/login  Body: { email, password }
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body) return errorJson("請求格式錯誤", 400);

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  const customer = await env.DB.prepare(`SELECT * FROM customers WHERE email = ?`).bind(email).first();
  if (!customer) return errorJson("電子郵件或密碼錯誤", 401);

  const ok = await verifyPassword(password, customer.password_hash, customer.password_salt);
  if (!ok) return errorJson("電子郵件或密碼錯誤", 401);

  const token = await createSessionToken(env, "customer", customer.id);
  return json(
    { customer: { id: customer.id, name: customer.name, email: customer.email } },
    { headers: { "Set-Cookie": `customer_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200` } }
  );
}
