import { json, errorJson } from "../../lib/json.js";
import { currentCustomerId } from "../../lib/auth.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";

// GET /api/customers/me — lets the header/account pages check login state.
export async function onRequestGet({ request, env }) {
  const customerId = await currentCustomerId(request, env);
  if (!customerId) return json({ customer: null });

  const customer = await env.DB.prepare(`SELECT id, name, email FROM customers WHERE id = ?`)
    .bind(customerId)
    .first();
  return json({ customer: customer || null });
}

// PATCH /api/customers/me — update the logged-in customer's own name and/or
// password. Body: { name?, currentPassword?, newPassword? }
// Changing the password requires the current password; changing the name
// does not. Email is intentionally not editable here (it's the login
// identity — changing it would need its own re-verification flow).
export async function onRequestPatch({ request, env }) {
  const customerId = await currentCustomerId(request, env);
  if (!customerId) return errorJson("請先登入會員", 401);

  const body = await request.json().catch(() => null);
  if (!body) return errorJson("請求格式錯誤", 400);

  const customer = await env.DB.prepare(`SELECT * FROM customers WHERE id = ?`).bind(customerId).first();
  if (!customer) return errorJson("找不到此會員", 404);

  const fields = [];
  const binds = [];

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return errorJson("姓名不可為空白", 400);
    fields.push("name = ?");
    binds.push(name);
  }

  if (body.newPassword) {
    if (!body.currentPassword) return errorJson("請輸入目前密碼以變更密碼", 400);
    const ok = await verifyPassword(body.currentPassword, customer.password_hash, customer.password_salt);
    if (!ok) return errorJson("目前密碼不正確", 401);
    if (String(body.newPassword).length < 6) return errorJson("新密碼至少需要 6 個字元", 400);

    const { hash, salt } = await hashPassword(body.newPassword);
    fields.push("password_hash = ?", "password_salt = ?");
    binds.push(hash, salt);
  }

  if (fields.length === 0) return errorJson("沒有需要更新的欄位", 400);

  binds.push(customerId);
  await env.DB.prepare(`UPDATE customers SET ${fields.join(", ")} WHERE id = ?`).bind(...binds).run();

  const updated = await env.DB.prepare(`SELECT id, name, email FROM customers WHERE id = ?`)
    .bind(customerId)
    .first();
  return json({ customer: updated });
}
