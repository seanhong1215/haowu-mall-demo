import { json, errorJson } from "../lib/json.js";

// GET /api/products?collection=Decor&sort=price_asc
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const collection = url.searchParams.get("collection");
  const sort = url.searchParams.get("sort") || "newest";

  const orderBy =
    {
      price_asc: "price_cents ASC",
      price_desc: "price_cents DESC",
      newest: "created_at DESC",
      title: "title ASC",
    }[sort] || "created_at DESC";

  let query = `SELECT * FROM products`;
  const binds = [];
  if (collection) {
    query += ` WHERE collection = ?`;
    binds.push(collection);
  }
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
