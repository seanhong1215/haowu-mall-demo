import { json, errorJson } from "../../lib/json.js";
import { requireAdmin } from "../../lib/auth.js";

// GET /api/admin/customers — admin only. 會員名單加上每位會員的下單概況。
// 訂單數與累計消費都排除已取消的訂單，跟後台「本月營收」的算法一致；
// 密碼欄位（password_hash / password_salt）刻意不選出來，後台永遠看不到。
export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("未授權，請重新登入後台", 401);

  const { results: customers } = await env.DB.prepare(
    `SELECT c.id, c.name, c.email, c.created_at,
            COUNT(CASE WHEN o.status != 'cancelled' THEN 1 END) AS order_count,
            COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total_cents END), 0) AS total_spent_cents,
            MAX(o.created_at) AS last_order_at
     FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id
     GROUP BY c.id, c.name, c.email, c.created_at
     ORDER BY total_spent_cents DESC, c.created_at DESC`
  ).all();

  return json({ customers });
}
