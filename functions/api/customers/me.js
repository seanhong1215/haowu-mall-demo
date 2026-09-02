import { json, errorJson } from "../../lib/json.js";
import { currentCustomerId } from "../../lib/auth.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/customers/me — lets the header/account pages check login state.
export async function onRequestGet({ request, env }) {
  const customerId = await currentCustomerId(request, env);
  if (!customerId) return json({ customer: null });

  const customer = await env.DB.prepare(`SELECT id, name, email FROM customers WHERE id = ?`)
    .bind(customerId)
    .first();
  return json({ customer: customer || null });
}

// PATCH /api/customers/me — update the logged-in customer's own name,
// email, and/or password. Body: { name?, email?, currentPassword?, newPassword? }
// Changing the password or the email (the login identity) both require the
// current password; changing just the name does not.
export async function onRequestPatch({ request, env }) {
  const customerId = await currentCustomerId(request, env);
  if (!customerId) return errorJson("請先登入會員", 401);

  const body = await request.json().catch(() => null);
  if (!body) return errorJson("請求格式錯誤", 400);

  const customer = await env.DB.prepare(`SELECT * FROM customers WHERE id = ?`).bind(customerId).first();
  if (!customer) return errorJson("找不到此會員", 404);

  const nextEmail = body.email !== undefined ? String(body.email).trim().toLowerCase() : null;
  const emailChanged = nextEmail !== null && nextEmail !== customer.email;
  const wantsPasswordChange = Boolean(body.newPassword);

  // Both the login email and the password are sensitive — either change
  // requires proving you know the current password first.
  if (emailChanged || wantsPasswordChange) {
    if (!body.currentPassword) return errorJson("請輸入目前密碼以完成此項變更", 400);
    const ok = await verifyPassword(body.currentPassword, customer.password_hash, customer.password_salt);
    if (!ok) return errorJson("目前密碼不正確", 401);
  }

  const fields = [];
  const binds = [];

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return errorJson("姓名不可為空白", 400);
    fields.push("name = ?");
    binds.push(name);
  }

  if (emailChanged) {
    if (!EMAIL_RE.test(nextEmail)) return errorJson("請輸入有效的電子郵件", 400);
    const existing = await env.DB.prepare(`SELECT id FROM customers WHERE email = ? AND id != ?`)
      .bind(nextEmail, customerId)
      .first();
    if (existing) return errorJson("此電子郵件已被其他帳號使用", 409);
    fields.push("email = ?");
    binds.push(nextEmail);
  }

  if (wantsPasswordChange) {
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
