import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb, adminJsonRequest, jsonRequest } from "./helpers.js";
import { onRequestGet, onRequestPatch, onRequestDelete } from "../functions/api/products/[id].js";

beforeEach(resetDb);

async function getProductBySlug(slug) {
  return env.DB.prepare(`SELECT * FROM products WHERE slug = ?`).bind(slug).first();
}
async function getVariants(productId) {
  const { results } = await env.DB.prepare(`SELECT * FROM product_variants WHERE product_id = ?`)
    .bind(productId)
    .all();
  return results;
}

describe("GET /api/products/:id", () => {
  it("404s a draft product for an anonymous request but serves it to an admin", async () => {
    const product = await getProductBySlug("ceramic-vase");
    await env.DB.prepare(`UPDATE products SET status = 'draft' WHERE id = ?`).bind(product.id).run();

    const publicRes = await onRequestGet({
      request: new Request(`https://example.com/api/products/${product.id}`),
      params: { id: String(product.id) },
      env,
    });
    expect(publicRes.status).toBe(404);

    const adminRes = await onRequestGet({
      request: await adminJsonRequest(`https://example.com/api/products/${product.id}`),
      params: { id: String(product.id) },
      env,
    });
    expect(adminRes.status).toBe(200);
  });
});

describe("PATCH /api/products/:id — inline price edit", () => {
  it("updates only price_cents without touching other fields", async () => {
    const product = await getProductBySlug("ceramic-vase");
    const res = await onRequestPatch({
      request: await adminJsonRequest(`https://example.com/api/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ price_cents: 99900 }),
      }),
      params: { id: String(product.id) },
      env,
    });
    expect(res.status).toBe(200);
    const { product: updated } = await res.json();
    expect(updated.price_cents).toBe(99900);
    expect(updated.title).toBe(product.title);
  });

  it("rejects an unauthenticated request", async () => {
    const product = await getProductBySlug("ceramic-vase");
    const res = await onRequestPatch({
      request: jsonRequest(`https://example.com/api/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ price_cents: 1 }),
      }),
      params: { id: String(product.id) },
      env,
    });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/products/:id — full edit", () => {
  it("replaces variants: keeps one, edits one, drops one, adds one", async () => {
    const product = await getProductBySlug("canvas-shoes");
    const before = await getVariants(product.id);
    expect(before.length).toBeGreaterThanOrEqual(2);
    const [keep, drop] = before;

    const res = await onRequestPatch({
      request: await adminJsonRequest(`https://example.com/api/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: product.title,
          slug: product.slug,
          description: product.description,
          collection: product.collection,
          price_cents: product.price_cents,
          compare_at_price_cents: null,
          status: "active",
          variants: [
            { id: keep.id, option_name: keep.option_name, value: keep.value, inventory: 999 },
            { option_name: "尺寸", value: "全新選項", inventory: 7 },
          ],
        }),
      }),
      params: { id: String(product.id) },
      env,
    });
    expect(res.status).toBe(200);

    const after = await getVariants(product.id);
    expect(after.find((v) => v.id === keep.id)?.inventory).toBe(999);
    expect(after.find((v) => v.id === drop.id)).toBeUndefined();
    expect(after.find((v) => v.value === "全新選項")).toBeTruthy();
  });

  it("rejects renaming to a slug already used by another product", async () => {
    const a = await getProductBySlug("ceramic-vase");
    const b = await getProductBySlug("canvas-shoes");
    const res = await onRequestPatch({
      request: await adminJsonRequest(`https://example.com/api/products/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: a.title,
          slug: b.slug,
          description: a.description,
          collection: a.collection,
          price_cents: a.price_cents,
          status: "active",
          variants: [],
        }),
      }),
      params: { id: String(a.id) },
      env,
    });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/products/:id", () => {
  it("removes the product along with its variants and reviews", async () => {
    const product = await getProductBySlug("ceramic-vase");
    const res = await onRequestDelete({
      request: await adminJsonRequest(`https://example.com/api/products/${product.id}`, { method: "DELETE" }),
      params: { id: String(product.id) },
      env,
    });
    expect(res.status).toBe(200);

    expect(await getProductBySlug("ceramic-vase")).toBeNull();
    expect(await getVariants(product.id)).toHaveLength(0);
    const reviews = await env.DB.prepare(`SELECT * FROM reviews WHERE product_id = ?`).bind(product.id).all();
    expect(reviews.results).toHaveLength(0);
  });

  it("also deletes the product's uploaded photo from R2", async () => {
    const product = await getProductBySlug("ceramic-vase");
    const key = "product-photo-cleanup-test.jpg";
    await env.PRODUCT_IMAGES.put(key, new Uint8Array([1, 2, 3]));
    await env.DB.prepare(`UPDATE products SET image_url = ? WHERE id = ?`)
      .bind(`/api/images/${key}`, product.id)
      .run();

    const res = await onRequestDelete({
      request: await adminJsonRequest(`https://example.com/api/products/${product.id}`, { method: "DELETE" }),
      params: { id: String(product.id) },
      env,
    });
    expect(res.status).toBe(200);
    expect(await env.PRODUCT_IMAGES.get(key)).toBeNull();
  });

  it("rejects an unauthenticated request", async () => {
    const product = await getProductBySlug("ceramic-vase");
    const res = await onRequestDelete({
      request: new Request(`https://example.com/api/products/${product.id}`, { method: "DELETE" }),
      params: { id: String(product.id) },
      env,
    });
    expect(res.status).toBe(401);
    expect(await getProductBySlug("ceramic-vase")).toBeTruthy();
  });

  it("404s a non-existent product", async () => {
    const res = await onRequestDelete({
      request: await adminJsonRequest("https://example.com/api/products/999999", { method: "DELETE" }),
      params: { id: "999999" },
      env,
    });
    expect(res.status).toBe(404);
  });
});
