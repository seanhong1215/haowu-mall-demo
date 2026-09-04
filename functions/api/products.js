import { json, errorJson } from "../lib/json.js";
import { requireAdmin } from "../lib/auth.js";
import { logAdminAction } from "../lib/auditLog.js";

// GET /api/products?collection=Decor&sort=price_asc
// 草稿商品預設不回傳；後台帶 ?include_drafts=1 並通過管理員驗證才看得到。
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const collection = url.searchParams.get("collection");
  const sort = url.searchParams.get("sort") || "newest";
  const includeDrafts =
    url.searchParams.get("include_drafts") === "1" && (await requireAdmin(request, env));

  const orderBy =
    {
      price_asc: "price_cents ASC",
      price_desc: "price_cents DESC",
      newest: "created_at DESC",
      title: "title ASC",
    }[sort] || "created_at DESC";

  let query = `SELECT * FROM products`;
  const binds = [];
  const where = [];
  if (collection) {
    where.push(`collection = ?`);
    binds.push(collection);
  }
  if (!includeDrafts) where.push(`status = 'active'`);
  if (where.length) query += ` WHERE ${where.join(" AND ")}`;
  query += ` ORDER BY ${orderBy}`;

  const { results: products } = await env.DB.prepare(query).bind(...binds).all();
  if (products.length === 0) return json({ products: [] });

  const ids = products.map((p) => p.id);
  const placeholders = ids.map(() => "?").join(",");
  const { results: variants } = await env.DB.prepare(
    `SELECT * FROM product_variants WHERE product_id IN (${placeholders})`
  )
    .bind(...ids)
    .all();

  const variantsByProduct = new Map();
  for (const v of variants) {
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
    variantsByProduct.get(v.product_id).push(v);
  }

  const { results: ratings } = await env.DB.prepare(
    `SELECT product_id, AVG(rating) AS avg_rating, COUNT(*) AS rating_count
     FROM reviews WHERE product_id IN (${placeholders}) GROUP BY product_id`
  )
    .bind(...ids)
    .all();
  const ratingsByProduct = new Map(ratings.map((r) => [r.product_id, r]));

  const withVariants = products.map((p) => ({
    ...p,
    variants: variantsByProduct.get(p.id) || [],
    rating_avg: ratingsByProduct.get(p.id)?.avg_rating ?? null,
    rating_count: ratingsByProduct.get(p.id)?.rating_count ?? 0,
  }));

  return json({ products: withVariants });
}

// POST /api/products — admin only。建立商品（可同時帶多組規格）。
// Body: { title, slug, description, collection, price_cents,
//         compare_at_price_cents?, image_seed?, status?, variants?: [{ option_name, value, inventory }] }
export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("未授權，請重新登入後台", 401);

  const body = await request.json().catch(() => null);
  if (!body) return errorJson("請求格式錯誤", 400);

  const fields = normalizeProductInput(body);
  if (fields.error) return errorJson(fields.error, 400);

  const duplicate = await env.DB.prepare(`SELECT id FROM products WHERE slug = ?`).bind(fields.slug).first();
  if (duplicate) return errorJson(`網址代稱「${fields.slug}」已被其他商品使用`, 409);

  const inserted = await env.DB.prepare(
    `INSERT INTO products (slug, title, description, collection, price_cents, compare_at_price_cents, image_seed, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  )
    .bind(
      fields.slug,
      fields.title,
      fields.description,
      fields.collection,
      fields.price_cents,
      fields.compare_at_price_cents,
      fields.image_seed,
      fields.status
    )
    .first();

  if (fields.variants.length) {
    await env.DB.batch(
      fields.variants.map((v) =>
        env.DB.prepare(
          `INSERT INTO product_variants (product_id, option_name, value, inventory) VALUES (?, ?, ?, ?)`
        ).bind(inserted.id, v.option_name, v.value, v.inventory)
      )
    );
  }

  await logAdminAction(
    env,
    "product_created",
    `新增商品「${fields.title}」（${fields.status === "draft" ? "草稿" : "上架中"}、${fields.variants.length} 組規格）`
  );

  const product = await env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(inserted.id).first();
  const { results: variants } = await env.DB.prepare(
    `SELECT * FROM product_variants WHERE product_id = ?`
  )
    .bind(inserted.id)
    .all();

  return json({ product: { ...product, variants } }, { status: 201 });
}

const COLLECTIONS = ["3C家電", "美妝保養", "時尚服飾", "生活居家", "食品雜貨"];

// 新增與編輯共用的欄位檢查。回傳 { error } 代表不通過。
export function normalizeProductInput(body) {
  const title = String(body.title || "").trim();
  const slug = String(body.slug || "").trim().toLowerCase();
  const description = String(body.description || "").trim();
  const collection = String(body.collection || "").trim();

  if (!title) return { error: "請填寫商品名稱" };
  if (!/^[a-z0-9-]+$/.test(slug)) return { error: "網址代稱只能使用英文小寫、數字與連字號" };
  if (!description) return { error: "請填寫商品描述" };
  if (!COLLECTIONS.includes(collection)) return { error: "請選擇商品分類" };
  if (!Number.isFinite(body.price_cents) || body.price_cents <= 0) return { error: "售價必須大於 0" };

  const compareAt = body.compare_at_price_cents;
  if (compareAt != null && (!Number.isFinite(compareAt) || compareAt <= body.price_cents)) {
    return { error: "原價必須高於售價，或留空不填" };
  }

  const variants = Array.isArray(body.variants) ? body.variants : [];
  for (const v of variants) {
    if (!String(v.option_name || "").trim() || !String(v.value || "").trim()) {
      return { error: "每組規格都要填寫規格名稱與選項值" };
    }
    if (!Number.isFinite(v.inventory) || v.inventory < 0) {
      return { error: "規格庫存必須為 0 或正整數" };
    }
  }

  return {
    title,
    slug,
    description,
    collection,
    price_cents: Math.round(body.price_cents),
    compare_at_price_cents: compareAt == null ? null : Math.round(compareAt),
    image_seed: String(body.image_seed || "").trim() || slug,
    status: body.status === "draft" ? "draft" : "active",
    variants: variants.map((v) => ({
      id: Number.isFinite(v.id) ? v.id : null,
      option_name: String(v.option_name).trim(),
      value: String(v.value).trim(),
      inventory: Math.round(v.inventory),
    })),
  };
}
