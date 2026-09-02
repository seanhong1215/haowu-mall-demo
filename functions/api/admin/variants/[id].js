import { json, errorJson } from "../../../lib/json.js";
import { requireAdmin } from "../../../lib/auth.js";

// PATCH /api/admin/variants/:id — admin only. Body: { inventory }
export async function onRequestPatch({ request, params, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("Unauthorized", 401);

  const id = Number(params.id);
  const body = await request.json().catch(() => null);
  if (!body || !Number.isFinite(body.inventory) || body.inventory < 0) {
    return errorJson("inventory must be a non-negative number", 400);
  }

  await env.DB.prepare(`UPDATE product_variants SET inventory = ? WHERE id = ?`)
    .bind(body.inventory, id)
    .run();

  const updated = await env.DB.prepare(`SELECT * FROM product_variants WHERE id = ?`).bind(id).first();
  if (!updated) return errorJson("Variant not found", 404);
  return json({ variant: updated });
}
