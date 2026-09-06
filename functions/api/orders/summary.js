import { json, errorJson } from "../../lib/json.js";
import { requireAdmin } from "../../lib/auth.js";

// GET /api/orders/summary — admin only. Powers the dashboard's stat cards
// and 30-day revenue chart with two small aggregate queries instead of the
// admin UI fetching every order and computing this in the browser.
//
// created_at is stored as UTC (`datetime('now')`, see schema.sql). This
// storefront is Taiwan-only (NT$, zh-TW dates), so "this month" and daily
// buckets are computed in UTC+8 — shifting by 8 hours before truncating to
// a date keeps calendar-day boundaries matching what a Taiwan admin expects,
// rather than rolling over 8 hours early at UTC midnight.
export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("未授權，請重新登入後台", 401);

  const totals = await env.DB.prepare(
    `SELECT
       COUNT(*) AS total_count,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
       SUM(CASE WHEN status = 'cancelled' AND created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS cancelled_recent_count,
       SUM(CASE WHEN status != 'cancelled' AND strftime('%Y-%m', created_at, '+8 hours') = strftime('%Y-%m', 'now', '+8 hours') THEN total_cents ELSE 0 END) AS month_revenue_cents
     FROM orders`
  ).first();

  const { results: dailyRows } = await env.DB.prepare(
    `SELECT date(created_at, '+8 hours') AS day, SUM(total_cents) AS cents
     FROM orders
     WHERE status != 'cancelled' AND created_at >= datetime('now', '-30 days')
     GROUP BY day`
  ).all();
  const revenueByDay = new Map(dailyRows.map((r) => [r.day, r.cents]));

  const DAYS = 30;
  const todayTaipei = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const dailyRevenue = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(todayTaipei);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyRevenue.push({ date: key, cents: revenueByDay.get(key) || 0 });
  }

  return json({
    pendingCount: totals.pending_count || 0,
    monthRevenueCents: totals.month_revenue_cents || 0,
    totalCount: totals.total_count || 0,
    cancelledCount: totals.cancelled_count || 0,
    cancelledRecentCount: totals.cancelled_recent_count || 0,
    dailyRevenue,
  });
}
