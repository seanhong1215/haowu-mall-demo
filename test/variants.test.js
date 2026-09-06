import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb, adminJsonRequest, jsonRequest } from "./helpers.js";
import { onRequestPatch } from "../functions/api/admin/variants/[id].js";

beforeEach(resetDb);

async function firstVariantOf(slug) {
  const product = await env.DB.prepare(`SELECT id FROM products WHERE slug = ?`).bind(slug).first();
  return env.DB.prepare(`SELECT * FROM product_variants WHERE product_id = ? LIMIT 1`).bind(product.id).first();
}

describe("PATCH /api/admin/variants/:id", () => {
  it("updates inventory for an admin", async () => {
    const variant = await firstVariantOf("canvas-shoes");
    const res = await onRequestPatch({
      request: await adminJsonRequest(`https://example.com/api/admin/variants/${variant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ inventory: 42 }),
      }),
      params: { id: String(variant.id) },
      env,
    });
    expect(res.status).toBe(200);
    const { variant: updated } = await res.json();
    expect(updated.inventory).toBe(42);
  });

  it("rejects negative inventory", async () => {
    const variant = await firstVariantOf("canvas-shoes");
    const res = await onRequestPatch({
      request: await adminJsonRequest(`https://example.com/api/admin/variants/${variant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ inventory: -1 }),
      }),
      params: { id: String(variant.id) },
      env,
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated request", async () => {
    const variant = await firstVariantOf("canvas-shoes");
    const res = await onRequestPatch({
      request: jsonRequest(`https://example.com/api/admin/variants/${variant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ inventory: 1 }),
      }),
      params: { id: String(variant.id) },
      env,
    });
    expect(res.status).toBe(401);
  });

  it("404s a non-existent variant", async () => {
    const res = await onRequestPatch({
      request: await adminJsonRequest("https://example.com/api/admin/variants/999999", {
        method: "PATCH",
        body: JSON.stringify({ inventory: 1 }),
      }),
      params: { id: "999999" },
      env,
    });
    expect(res.status).toBe(404);
  });
});
