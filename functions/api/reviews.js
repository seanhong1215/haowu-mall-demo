import { json, errorJson } from "../lib/json.js";

// GET /api/reviews?productId=1
export async function onRequestGet({ request, env }) {
  const productId = Number(new URL(request.url).searchParams.get("productId"));
  if (!Number.isFinite(productId)) return errorJson("productId is required", 400);

  const { results: reviews } = await env.DB.prepare(
    `SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC`
  )
    .bind(productId)
    .all();

  return json({ reviews });
}

// POST /api/reviews  Body: { productId, authorName, rating, comment }
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body) return errorJson("Invalid JSON body", 400);

  const productId = Number(body.productId);
  const rating = Number(body.rating);
  const authorName = (body.authorName || "").trim();
  const comment = (body.comment || "").trim();

  if (!Number.isFinite(productId)) return errorJson("缺少商品編號", 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return errorJson("評分需為 1 到 5 之間", 400);
  if (!authorName) return errorJson("請輸入姓名", 400);
  if (!comment || comment.length > 2000) return errorJson("請輸入評價內容（最多 2000 字）", 400);

  const product = await env.DB.prepare(`SELECT id FROM products WHERE id = ?`).bind(productId).first();
  if (!product) return errorJson("找不到此商品", 404);

  const { meta } = await env.DB.prepare(
    `INSERT INTO reviews (product_id, author_name, rating, comment) VALUES (?, ?, ?, ?)`
  )
    .bind(productId, authorName, rating, comment)
    .run();

  const review = await env.DB.prepare(`SELECT * FROM reviews WHERE id = ?`).bind(meta.last_row_id).first();
  return json({ review }, { status: 201 });
}
