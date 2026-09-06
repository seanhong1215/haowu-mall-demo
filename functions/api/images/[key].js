import { errorJson } from "../../lib/json.js";

// GET /api/images/:key — public. Streams an admin-uploaded product photo
// back out of R2 (objects in the bucket aren't public on their own).
// Filenames embed a timestamp (see the upload handler), so the response is
// safe to cache forever — a re-upload always gets a new key.
export async function onRequestGet({ params, env }) {
  const object = await env.PRODUCT_IMAGES.get(params.key);
  if (!object) return errorJson("找不到此圖片", 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: object.httpEtag,
    },
  });
}
