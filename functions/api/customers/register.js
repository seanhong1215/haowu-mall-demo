import { json, errorJson } from "../../lib/json.js";
import { createSessionToken } from "../../lib/auth.js";
import { hashPassword } from "../../lib/password.js";

// POST /api/customers/register  Body: { name, email, password }
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body) return errorJson("Invalid JSON body", 400);

  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!name) return errorJson("請輸入姓名", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorJson("請輸入有效的電子郵件", 400);
  if (password.length < 6) return errorJson("密碼至少需要 6 個字元", 400);

  const existing = await env.DB.prepare(`SELECT id FROM customers WHERE email = ?`).bind(email).first();
  if (existing) return errorJson("此電子郵件已被註冊過", 409);

  const { hash, salt } = await hashPassword(password);
  const { meta } = await env.DB.prepare(
    `INSERT INTO customers (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)`
  )
    .bind(name, email, hash, salt)
    .run();

  const token = await createSessionToken(env, "customer", meta.last_row_id);
  return json(
    { customer: { id: meta.last_row_id, name, email } },
    {
      status: 201,
      headers: { "Set-Cookie": `customer_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200` },
    }
  );
}
