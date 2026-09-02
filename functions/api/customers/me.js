import { json } from "../../lib/json.js";
import { currentCustomerId } from "../../lib/auth.js";

// GET /api/customers/me — lets the header/account pages check login state.
export async function onRequestGet({ request, env }) {
  const customerId = await currentCustomerId(request, env);
  if (!customerId) return json({ customer: null });

  const customer = await env.DB.prepare(`SELECT id, name, email FROM customers WHERE id = ?`)
    .bind(customerId)
    .first();
  return json({ customer: customer || null });
}
