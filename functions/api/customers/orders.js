import { json, errorJson } from "../../lib/json.js";
import { currentCustomerId } from "../../lib/auth.js";

// GET /api/customers/orders — the logged-in customer's own order history.
export async function onRequestGet({ request, env }) {
  const customerId = await currentCustomerId(request, env);
  if (!customerId) return errorJson("請先登入會員", 401);

  const { results: orders } = await env.DB.prepare(
    `SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC`
  )
    .bind(customerId)
    .all();

  return json({ orders });
}
