import { json, errorJson } from "../../../lib/json.js";
import { requireAdmin } from "../../../lib/auth.js";

// PATCH /api/admin/variants/:id — admin only. Body: { inventory }
export async function onRequestPatch({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("未授權，請重新登入後台", 401);

  const id = Number(params.id);
  const body = await request.json().catch(() => null);
  if (!body || !Number.isFinite(body.inventory) || body.inventory < 0) {
    return errorJson("庫存數量必須為 0 或正整數", 400);
  }

  await env.DB.prepare(`UPDATE product_variants SET inventory = ? WHERE id = ?`)
    .bind(body.inventory, id)
    .run();

  const updated = await env.DB.prepare(`SELECT * FROM product_variants WHERE id = ?`).bind(id).first();
  if (!updated) return errorJson("找不到此規格", 404);
  return json({ variant: updated });
}
