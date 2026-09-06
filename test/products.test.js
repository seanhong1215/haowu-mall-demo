import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb, jsonRequest, adminJsonRequest } from "./helpers.js";
import { onRequestGet, onRequestPost, normalizeProductInput } from "../functions/api/products.js";

beforeEach(resetDb);

const validInput = () => ({
  title: "測試商品",
  slug: "test-item",
  description: "一段測試用的商品描述。",
  collection: "生活居家",
  price_cents: 50000,
});

describe("normalizeProductInput", () => {
  it("accepts a minimal valid product", () => {
    const result = normalizeProductInput(validInput());
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      title: "測試商品",
      slug: "test-item",
      collection: "生活居家",
      price_cents: 50000,
      compare_at_price_cents: null,
      status: "active",
      variants: [],
    });
  });

  it("rejects a missing title", () => {
    expect(normalizeProductInput({ ...validInput(), title: "  " }).error).toMatch(/名稱/);
  });

  it("rejects a slug with uppercase or spaces", () => {
    expect(normalizeProductInput({ ...validInput(), slug: "Test Item" }).error).toMatch(/網址代稱/);
  });

  it("rejects an unknown collection", () => {
    expect(normalizeProductInput({ ...validInput(), collection: "戶外用品" }).error).toMatch(/分類/);
  });

  it("rejects a non-positive price", () => {
    expect(normalizeProductInput({ ...validInput(), price_cents: 0 }).error).toMatch(/售價/);
  });

  it("rejects a compare-at price that isn't above the sale price", () => {
    expect(
      normalizeProductInput({ ...validInput(), price_cents: 1000, compare_at_price_cents: 1000 }).error
    ).toMatch(/原價/);
  });

  it("accepts a compare-at price above the sale price", () => {
    const result = normalizeProductInput({ ...validInput(), price_cents: 1000, compare_at_price_cents: 1200 });
    expect(result.error).toBeUndefined();
    expect(result.compare_at_price_cents).toBe(1200);
  });

  it("falls back the image seed to the slug when left blank", () => {
    expect(normalizeProductInput(validInput()).image_seed).toBe("test-item");
  });

  it("marks status as draft only when explicitly requested", () => {
    expect(normalizeProductInput(validInput()).status).toBe("active");
    expect(normalizeProductInput({ ...validInput(), status: "draft" }).status).toBe("draft");
  });

  it("rejects a variant missing its value", () => {
    const result = normalizeProductInput({
      ...validInput(),
      variants: [{ option_name: "顏色", value: "", inventory: 1 }],
    });
    expect(result.error).toMatch(/規格/);
  });

  it("rejects a variant with negative inventory", () => {
    const result = normalizeProductInput({
      ...validInput(),
      variants: [{ option_name: "顏色", value: "黑", inventory: -1 }],
    });
    expect(result.error).toMatch(/庫存/);
  });
});

describe("GET /api/products", () => {
  it("hides a draft product from anonymous requests but shows it to an authenticated admin with include_drafts=1", async () => {
    await env.DB.prepare(
      `UPDATE products SET status = 'draft' WHERE slug = 'ceramic-vase'`
    ).run();

    const publicRes = await onRequestGet({
      request: new Request("https://example.com/api/products"),
      env,
    });
    const { products: publicProducts } = await publicRes.json();
    expect(publicProducts.find((p) => p.slug === "ceramic-vase")).toBeUndefined();

    const adminReq = await adminJsonRequest("https://example.com/api/products?include_drafts=1");
    const { products: adminProducts } = await onRequestGet({ request: adminReq, env }).then((r) => r.json());
    expect(adminProducts.find((p) => p.slug === "ceramic-vase")?.status).toBe("draft");
  });
});

describe("POST /api/products", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await onRequestPost({
      request: jsonRequest("https://example.com/api/products", {
        method: "POST",
        body: JSON.stringify(validInput()),
      }),
      env,
    });
    expect(res.status).toBe(401);
  });

  it("creates a product with variants for an admin", async () => {
    const body = {
      ...validInput(),
      variants: [
        { option_name: "尺寸", value: "S", inventory: 3 },
        { option_name: "尺寸", value: "M", inventory: 5 },
      ],
    };
    const res = await onRequestPost({
      request: await adminJsonRequest("https://example.com/api/products", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      env,
    });
    expect(res.status).toBe(201);
    const { product } = await res.json();
    expect(product.slug).toBe("test-item");
    expect(product.variants).toHaveLength(2);

    const row = await env.DB.prepare(`SELECT * FROM products WHERE slug = ?`).bind("test-item").first();
    expect(row).toBeTruthy();
  });

  it("rejects a duplicate slug", async () => {
    const res = await onRequestPost({
      request: await adminJsonRequest("https://example.com/api/products", {
        method: "POST",
        body: JSON.stringify({ ...validInput(), slug: "ceramic-vase" }),
      }),
      env,
    });
    expect(res.status).toBe(409);
  });
});
