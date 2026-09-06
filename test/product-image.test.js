import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb, adminRequest } from "./helpers.js";
import { onRequestPost, onRequestDelete } from "../functions/api/admin/products/[id]/image.js";
import { onRequestGet as imageGet } from "../functions/api/images/[key].js";

beforeEach(resetDb);

async function getProduct(slug) {
  return env.DB.prepare(`SELECT * FROM products WHERE slug = ?`).bind(slug).first();
}

function fakeImage(bytes = 32, type = "image/jpeg") {
  return new File([new Uint8Array(bytes).fill(1)], "photo.jpg", { type });
}

async function upload(productId, file) {
  const form = new FormData();
  form.append("file", file);
  const request = await adminRequest(`https://example.com/api/admin/products/${productId}/image`, {
    method: "POST",
    body: form,
  });
  return onRequestPost({ request, params: { id: String(productId) }, env });
}

describe("POST /api/admin/products/:id/image", () => {
  it("rejects an unauthenticated request", async () => {
    const product = await getProduct("ceramic-vase");
    const form = new FormData();
    form.append("file", fakeImage());
    const res = await onRequestPost({
      request: new Request(`https://example.com/api/admin/products/${product.id}/image`, {
        method: "POST",
        body: form,
      }),
      params: { id: String(product.id) },
      env,
    });
    expect(res.status).toBe(401);
  });

  it("rejects a disallowed file type", async () => {
    const product = await getProduct("ceramic-vase");
    const res = await upload(product.id, fakeImage(32, "application/pdf"));
    expect(res.status).toBe(400);
  });

  it("rejects a file over 5MB", async () => {
    const product = await getProduct("ceramic-vase");
    const res = await upload(product.id, fakeImage(5 * 1024 * 1024 + 1));
    expect(res.status).toBe(400);
  });

  it("uploads, updates the product's image_url, and serves the bytes back out", async () => {
    const product = await getProduct("ceramic-vase");
    const res = await upload(product.id, fakeImage(32, "image/jpeg"));
    expect(res.status).toBe(200);
    const { image_url } = await res.json();
    expect(image_url).toMatch(/^\/api\/images\/product-\d+-\d+\.jpg$/);

    const updated = await getProduct("ceramic-vase");
    expect(updated.image_url).toBe(image_url);

    const key = image_url.replace("/api/images/", "");
    const servedRes = await imageGet({ params: { key }, env });
    expect(servedRes.status).toBe(200);
    expect(servedRes.headers.get("Content-Type")).toBe("image/jpeg");
    expect(new Uint8Array(await servedRes.arrayBuffer())).toHaveLength(32);
  });

  it("deletes the previous photo from R2 when replaced", async () => {
    const product = await getProduct("ceramic-vase");
    const first = await (await upload(product.id, fakeImage())).json();
    const firstKey = first.image_url.replace("/api/images/", "");

    await upload(product.id, fakeImage());

    expect(await env.PRODUCT_IMAGES.get(firstKey)).toBeNull();
  });
});

describe("DELETE /api/admin/products/:id/image", () => {
  it("removes the uploaded photo and clears image_url", async () => {
    const product = await getProduct("ceramic-vase");
    const { image_url } = await (await upload(product.id, fakeImage())).json();
    const key = image_url.replace("/api/images/", "");

    const res = await onRequestDelete({
      request: await adminRequest(`https://example.com/api/admin/products/${product.id}/image`, { method: "DELETE" }),
      params: { id: String(product.id) },
      env,
    });
    expect(res.status).toBe(200);

    const updated = await getProduct("ceramic-vase");
    expect(updated.image_url).toBeNull();
    expect(await env.PRODUCT_IMAGES.get(key)).toBeNull();
  });

  it("rejects a product with no uploaded photo", async () => {
    const product = await getProduct("ceramic-vase");
    const res = await onRequestDelete({
      request: await adminRequest(`https://example.com/api/admin/products/${product.id}/image`, { method: "DELETE" }),
      params: { id: String(product.id) },
      env,
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated request", async () => {
    const product = await getProduct("ceramic-vase");
    const res = await onRequestDelete({
      request: new Request(`https://example.com/api/admin/products/${product.id}/image`, { method: "DELETE" }),
      params: { id: String(product.id) },
      env,
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/images/:key", () => {
  it("404s an unknown key", async () => {
    const res = await imageGet({ params: { key: "does-not-exist.jpg" }, env });
    expect(res.status).toBe(404);
  });
});
