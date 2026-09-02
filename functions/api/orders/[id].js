import { json, errorJson } from "../../lib/json.js";
import { requireAdmin, currentCustomerId } from "../../lib/auth.js";

const VALID_STATUSES = ["pending", "paid", "fulfilled", "cancelled"];
const STATUS_LABEL_ZH = { pending: "已下單", paid: "已付款", fulfilled: "已出貨", cancelled: "已取消" };
const STATUS_NOTES = {
  paid: "已確認付款",
  fulfilled: "商品已出貨",
  cancelled: "訂單已取消",
};

function generateTrackingNumber() {
  return `HCT${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

// GET /api/orders/:id — order detail + line items + status timeline.
// Access rules:
//  - lookup by order_number (used by the post-checkout confirmation page): public,
//    since it reveals nothing beyond what the buyer already knows.
//  - lookup by numeric id: admin, OR the logged-in customer who owns the order.
export async function onRequestGet({ params, env, request }) {
  const idParam = params.id;
  const isNumeric = /^\d+$/.test(idParam);

  const order = await env.DB.prepare(
    isNumeric ? `SELECT * FROM orders WHERE id = ?` : `SELECT * FROM orders WHERE order_number = ?`
  )
    .bind(isNumeric ? Number(idParam) : idParam)
    .first();

  if (!order) return errorJson("找不到此訂單", 404);

  if (isNumeric) {
    const isAdmin = await requireAdmin(request, env);
    const customerId = await currentCustomerId(request, env);
    const isOwner = customerId && order.customer_id === customerId;
    if (!isAdmin && !isOwner) return errorJson("未授權，請重新登入", 401);
  }

  const { results: items } = await env.DB.prepare(`SELECT * FROM order_items WHERE order_id = ?`)
    .bind(order.id)
    .all();
  const { results: events } = await env.DB.prepare(
    `SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC`
  )
    .bind(order.id)
    .all();

  return json({ order: { ...order, items, events } });
}

// PATCH /api/orders/:id — admin only. Body: { status }
// Records the transition in order_events, and auto-assigns a tracking number
// the first time an order moves to "fulfilled".
export async function onRequestPatch({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("未授權，請重新登入後台", 401);

  const id = Number(params.id);
  const body = await request.json().catch(() => null);
  if (!body || !VALID_STATUSES.includes(body.status)) {
    return errorJson(`狀態必須是以下其中一種：${VALID_STATUSES.map((s) => STATUS_LABEL_ZH[s]).join("、")}`, 400);
  }

  const existing = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
  if (!existing) return errorJson("找不到此訂單", 404);

  const needsTracking = body.status === "fulfilled" && !existing.tracking_number;
  const trackingNumber = needsTracking ? generateTrackingNumber() : existing.tracking_number;

  await env.DB.batch([
    needsTracking
      ? env.DB.prepare(`UPDATE orders SET status = ?, tracking_number = ? WHERE id = ?`).bind(
          body.status,
          trackingNumber,
          id
        )
      : env.DB.prepare(`UPDATE orders SET status = ? WHERE id = ?`).bind(body.status, id),
    env.DB.prepare(`INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)`).bind(
      id,
      body.status,
      needsTracking ? `商品已出貨，物流追蹤碼 ${trackingNumber}` : STATUS_NOTES[body.status] || null
    ),
  ]);

  const updated = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
  return json({ order: updated });
}
