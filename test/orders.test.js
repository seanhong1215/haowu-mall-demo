import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb, resetOrders, jsonRequest, adminJsonRequest } from "./helpers.js";
import { onRequestGet as ordersGet } from "../functions/api/orders.js";
import { onRequestGet as summaryGet } from "../functions/api/orders/summary.js";

beforeEach(async () => {
  await resetDb();
  await resetOrders();
});

// 種子資料裡的訂單量會隨 schema.sql 演進而變，統計／分頁的測試改用這裡自己
// 灌的一組已知資料，時間點都刻意抓在不會跨到月份或 30 天邊界的位置，
// 這樣斷言不會因為測試哪一天跑而變得不穩定。
async function seedOrder({ number, name, email, status, cents, daysAgo = 0 }) {
  await env.DB.prepare(
    `INSERT INTO orders (order_number, customer_name, customer_email, shipping_address, status, subtotal_cents, total_cents, created_at)
     VALUES (?, ?, ?, '測試地址', ?, ?, ?, datetime('now', ?))`
  )
    .bind(number, name, email, status, cents, cents, `-${daysAgo} days`)
    .run();
}

describe("GET /api/orders", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await ordersGet({ request: new Request("https://example.com/api/orders"), env });
    expect(res.status).toBe(401);
  });

  it("paginates and reports the total independent of the page size", async () => {
    for (let i = 1; i <= 5; i++) {
      await seedOrder({ number: `PGN${i}`, name: "分頁測試", email: "pg@example.com", status: "paid", cents: 1000 });
    }
    const res = await ordersGet({
      request: await adminJsonRequest("https://example.com/api/orders?page=2&pageSize=2"),
      env,
    });
    const { orders, total, page, pageSize } = await res.json();
    expect(total).toBe(5);
    expect(page).toBe(2);
    expect(pageSize).toBe(2);
    expect(orders).toHaveLength(2);
  });

  it("filters by status", async () => {
    await seedOrder({ number: "ST1", name: "王一", email: "a@example.com", status: "pending", cents: 1000 });
    await seedOrder({ number: "ST2", name: "王二", email: "b@example.com", status: "paid", cents: 1000 });

    const res = await ordersGet({
      request: await adminJsonRequest("https://example.com/api/orders?status=pending"),
      env,
    });
    const { orders, total } = await res.json();
    expect(total).toBe(1);
    expect(orders[0].order_number).toBe("ST1");
  });

  it("searches by customer name, email, or order number", async () => {
    await seedOrder({ number: "SEARCHABLE1", name: "陳大文", email: "chen@example.com", status: "paid", cents: 1000 });
    await seedOrder({ number: "OTHER1", name: "林小華", email: "lin@example.com", status: "paid", cents: 1000 });

    const res = await ordersGet({
      request: await adminJsonRequest(`https://example.com/api/orders?${new URLSearchParams({ q: "陳大文" })}`),
      env,
    });
    const { orders, total } = await res.json();
    expect(total).toBe(1);
    expect(orders[0].order_number).toBe("SEARCHABLE1");
  });
});

describe("GET /api/orders/summary", () => {
  it("aggregates pending/cancelled counts and month/30-day revenue correctly", async () => {
    await seedOrder({ number: "SUM-NOW", name: "A", email: "a@example.com", status: "pending", cents: 10000, daysAgo: 0 });
    await seedOrder({ number: "SUM-CANCEL-RECENT", name: "B", email: "b@example.com", status: "cancelled", cents: 5000, daysAgo: 1 });
    await seedOrder({ number: "SUM-OLD", name: "C", email: "c@example.com", status: "fulfilled", cents: 15000, daysAgo: 45 });
    await seedOrder({ number: "SUM-CANCEL-OLD", name: "D", email: "d@example.com", status: "cancelled", cents: 8000, daysAgo: 50 });

    const res = await summaryGet({ request: await adminJsonRequest("https://example.com/api/orders/summary"), env });
    const summary = await res.json();

    expect(summary.totalCount).toBe(4);
    expect(summary.pendingCount).toBe(1);
    expect(summary.cancelledCount).toBe(2);
    expect(summary.cancelledRecentCount).toBe(1); // 只有 -1 天那筆在近 30 天內
    expect(summary.monthRevenueCents).toBe(10000); // 只有今天那筆非取消訂單保證落在本月
    expect(summary.dailyRevenue).toHaveLength(30);
    const thirtyDayTotal = summary.dailyRevenue.reduce((sum, d) => sum + d.cents, 0);
    expect(thirtyDayTotal).toBe(10000); // 45/50 天前的都在窗口外，取消的那筆也不計入
  });

  it("rejects an unauthenticated request", async () => {
    const res = await summaryGet({ request: new Request("https://example.com/api/orders/summary"), env });
    expect(res.status).toBe(401);
  });
});
