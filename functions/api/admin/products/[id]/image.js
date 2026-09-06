import { json, errorJson } from "../../../../lib/json.js";
import { requireAdmin } from "../../../../lib/auth.js";
import { logAdminAction } from "../../../../lib/auditLog.js";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// R2 objects referenced by /api/images/:key all live in this bucket — pull
// the key back out of a stored image_url so we can delete the old object
// when a product's photo is replaced or removed.
function keyFromImageUrl(url) {
  const match = /^\/api\/images\/(.+)$/.exec(url || "");
  return match ? match[1] : null;
}

// POST /api/admin/products/:id/image — admin only. multipart/form-data
// with a single "file" field. Replaces the product's photo.
export async function onRequestPost({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("未授權，請重新登入後台", 401);

  const id = Number(params.id);
  if (!Number.isFinite(id)) return errorJson("商品編號無效", 400);

  const product = await env.DB.prepare(`SELECT id, title, image_url FROM products WHERE id = ?`).bind(id).first();
  if (!product) return errorJson("找不到此商品", 404);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return errorJson("請選擇一個圖片檔案", 400);

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return errorJson("僅支援 JPG、PNG 或 WebP 格式", 400);
  if (file.size > MAX_BYTES) return errorJson("圖片大小不能超過 5MB", 400);

  const key = `product-${id}-${Date.now()}.${ext}`;
  await env.PRODUCT_IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const imageUrl = `/api/images/${key}`;
  await env.DB.prepare(`UPDATE products SET image_url = ? WHERE id = ?`).bind(imageUrl, id).run();

  // Best-effort cleanup of the photo being replaced — never fail the
  // upload over it (the old key just becomes an orphaned R2 object).
  const oldKey = keyFromImageUrl(product.image_url);
  if (oldKey) await env.PRODUCT_IMAGES.delete(oldKey).catch(() => {});

  await logAdminAction(env, "product_image_uploaded", `「${product.title}」上傳了新的商品圖片`);

  return json({ image_url: imageUrl });
}

// DELETE /api/admin/products/:id/image — admin only. Removes the uploaded
// photo; the product falls back to its image_seed stock photo.
export async function onRequestDelete({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("未授權，請重新登入後台", 401);

  const id = Number(params.id);
  if (!Number.isFinite(id)) return errorJson("商品編號無效", 400);

  const product = await env.DB.prepare(`SELECT id, title, image_url FROM products WHERE id = ?`).bind(id).first();
  if (!product) return errorJson("找不到此商品", 404);
  if (!product.image_url) return errorJson("此商品沒有上傳過圖片", 400);

  const key = keyFromImageUrl(product.image_url);
  if (key) await env.PRODUCT_IMAGES.delete(key).catch(() => {});

  await env.DB.prepare(`UPDATE products SET image_url = NULL WHERE id = ?`).bind(id).run();
  await logAdminAction(env, "product_image_removed", `「${product.title}」移除了上傳的商品圖片`);

  return json({ ok: true });
}
