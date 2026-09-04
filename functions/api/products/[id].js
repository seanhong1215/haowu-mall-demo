import { json, errorJson } from "../../lib/json.js";
import { requireAdmin } from "../../lib/auth.js";
import { logAdminAction } from "../../lib/auditLog.js";
import { normalizeProductInput } from "../products.js";

// GET /api/products/:id  — accepts numeric id or slug
export async function onRequestGet({ request, params, env }) {
  const idOrSlug = params.id;
  const isNumeric = /^\d+$/.test(idOrSlug);

  const product = await env.DB.prepare(
    isNumeric ? `SELECT * FROM products WHERE id = ?` : `SELECT * FROM products WHERE slug = ?`
  )
    .bind(isNumeric ? Number(idOrSlug) : idOrSlug)
    .first();

  if (!product) return errorJson("找不到此商品", 404);
  // 草稿商品只有後台看得到，前台直接當作不存在
  if (product.status === "draft" && !(await requireAdmin(request, env))) {
    return errorJson("找不到此商品", 404);
  }

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

// PATCH /api/products/:id — admin only。兩種用法：
//   1. 庫存表的行內編輯：{ price_cents?, compare_at_price_cents? } 只改這幾欄
//   2. 商品編輯表單：帶 title 時視為完整更新，連同規格一起覆寫
export async function onRequestPatch({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("未授權，請重新登入後台", 401);

  const id = Number(params.id);
  if (!Number.isFinite(id)) return errorJson("商品編號無效", 400);

  const body = await request.json().catch(() => null);
  if (!body) return errorJson("請求格式錯誤", 400);

  if (body.title !== undefined) return updateWholeProduct(env, id, body);

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

// 商品編輯表單的完整更新：商品欄位 + 規格清單（送什麼就是什麼，
// 沒出現在清單裡的既有規格視為刪除）。
async function updateWholeProduct(env, id, body) {
  const fields = normalizeProductInput(body);
  if (fields.error) return errorJson(fields.error, 400);

  const existing = await env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).first();
  if (!existing) return errorJson("找不到此商品", 404);

  const slugOwner = await env.DB.prepare(`SELECT id FROM products WHERE slug = ? AND id != ?`)
    .bind(fields.slug, id)
    .first();
  if (slugOwner) return errorJson(`網址代稱「${fields.slug}」已被其他商品使用`, 409);

  const { results: currentVariants } = await env.DB.prepare(
    `SELECT id FROM product_variants WHERE product_id = ?`
  )
    .bind(id)
    .all();

  const keptIds = new Set(fields.variants.map((v) => v.id).filter(Boolean));
  const statements = [
    env.DB.prepare(
      `UPDATE products
       SET slug = ?, title = ?, description = ?, collection = ?,
           price_cents = ?, compare_at_price_cents = ?, image_seed = ?, status = ?
       WHERE id = ?`
    ).bind(
      fields.slug,
      fields.title,
      fields.description,
      fields.collection,
      fields.price_cents,
      fields.compare_at_price_cents,
      fields.image_seed,
      fields.status,
      id
    ),
  ];

  for (const v of currentVariants) {
    if (!keptIds.has(v.id)) {
      statements.push(env.DB.prepare(`DELETE FROM product_variants WHERE id = ?`).bind(v.id));
    }
  }
  for (const v of fields.variants) {
    statements.push(
      v.id
        ? env.DB.prepare(
            `UPDATE product_variants SET option_name = ?, value = ?, inventory = ? WHERE id = ? AND product_id = ?`
          ).bind(v.option_name, v.value, v.inventory, v.id, id)
        : env.DB.prepare(
            `INSERT INTO product_variants (product_id, option_name, value, inventory) VALUES (?, ?, ?, ?)`
          ).bind(id, v.option_name, v.value, v.inventory)
    );
  }

  await env.DB.batch(statements);

  const changes = [];
  if (existing.title !== fields.title) changes.push(`名稱改為「${fields.title}」`);
  if (existing.price_cents !== fields.price_cents) changes.push(`價格改為 NT$${(fields.price_cents / 100).toFixed(0)}`);
  if (existing.status !== fields.status) changes.push(fields.status === "draft" ? "改為草稿" : "改為上架中");
  await logAdminAction(
    env,
    "product_updated",
    `編輯商品「${existing.title}」${changes.length ? `（${changes.join("、")}）` : ""}`
  );

  const product = await env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).first();
  const { results: variants } = await env.DB.prepare(
    `SELECT * FROM product_variants WHERE product_id = ?`
  )
    .bind(id)
    .all();

  return json({ product: { ...product, variants } });
}
