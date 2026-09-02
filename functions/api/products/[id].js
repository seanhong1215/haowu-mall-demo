import { json, errorJson } from "../../lib/json.js";
import { requireAdmin } from "../../lib/auth.js";
import { logAdminAction } from "../../lib/auditLog.js";

// GET /api/products/:id  — accepts numeric id or slug
export async function onRequestGet({ params, env }) {
  const idOrSlug = params.id;
  const isNumeric = /^\d+$/.test(idOrSlug);

  const product = await env.DB.prepare(
    isNumeric ? `SELECT * FROM products WHERE id = ?` : `SELECT * FROM products WHERE slug = ?`
  )
    .bind(isNumeric ? Number(idOrSlug) : idOrSlug)
    .first();

  if (!product) return errorJson("找不到此商品", 404);

  const { results: variants } = await env.DB.prepare(
    `SELECT * FROM product_variants WHERE product_id = ?`
  )
    .bind(product.id)
    .all();

  const { results: related } = await env.DB.prepare(
    `SELECT id, slug, title, price_cents, compare_at_price_cents, image_seed
     FROM products WHERE collection = ? AND id != ? LIMIT 4`
  )
    .bind(product.collection, product.id)
    .all();

  const rating = await env.DB.prepare(
    `SELECT AVG(rating) AS avg_rating, COUNT(*) AS rating_count FROM reviews WHERE product_id = ?`
  )
    .bind(product.id)
    .first();

  return json({
    product: {
      ...product,
      variants,
      rating_avg: rating?.avg_rating ?? null,
      rating_count: rating?.rating_count ?? 0,
    },
    related,
  });
}

// PATCH /api/products/:id  — admin only. Body: { price_cents?, compare_at_price_cents? }
export async function onRequestPatch({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("未授權，請重新登入後台", 401);

  const id = Number(params.id);
  if (!Number.isFinite(id)) return errorJson("商品編號無效", 400);

  const body = await request.json().catch(() => null);
  if (!body) return errorJson("請求格式錯誤", 400);

  const fields = [];
  const binds = [];
  if (Number.isFinite(body.price_cents)) {
    fields.push("price_cents = ?");
    binds.push(body.price_cents);
  }
  if (body.compare_at_price_cents === null || Number.isFinite(body.compare_at_price_cents)) {
    fields.push("compare_at_price_cents = ?");
    binds.push(body.compare_at_price_cents);
  }
  if (fields.length === 0) return errorJson("沒有需要更新的欄位", 400);

  const existing = await env.DB.prepare(`SELECT title FROM products WHERE id = ?`).bind(id).first();
  if (!existing) return errorJson("找不到此商品", 404);

  binds.push(id);
  await env.DB.prepare(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`).bind(...binds).run();

  if (Number.isFinite(body.price_cents)) {
    await logAdminAction(env, "price_updated", `「${existing.title}」價格改為 NT$${(body.price_cents / 100).toFixed(0)}`);
  }

  const updated = await env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).first();
  return json({ product: updated });
}
