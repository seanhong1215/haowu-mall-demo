// HMAC-signed session tokens shared by the /admin area and customer accounts.
// This is intentionally lightweight (no server-side session table, no
// refresh tokens) because it exists to demonstrate a real authenticated
// front-end <-> back-end flow for a portfolio demo, not to be
// production-grade auth. See README.md "已知限制".

const encoder = new TextEncoder();

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// role: "admin" | "customer"; id: subject id (customer id, or 0 for the single admin)
export async function createSessionToken(env, role, id = 0, ttlSeconds = 60 * 60 * 2) {
  const expires = Date.now() + ttlSeconds * 1000;
  const payload = `${role}.${id}.${expires}`;
  const key = await hmacKey(env.ADMIN_SECRET || "dev-secret-change-me");
  const signature = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return `${payload}.${signature}`;
}

// Returns { role, id } on success, or null if missing/invalid/expired.
export async function verifySessionToken(env, token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [role, idStr, expiresStr, signature] = parts;
  const expires = Number(expiresStr);
  const id = Number(idStr);
  if (!["admin", "customer"].includes(role) || !Number.isFinite(expires) || !Number.isFinite(id)) return null;
  if (Date.now() > expires) return null;

  const key = await hmacKey(env.ADMIN_SECRET || "dev-secret-change-me");
  const expected = toHex(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${role}.${idStr}.${expiresStr}`))
  );
  return timingSafeEqual(expected, signature) ? { role, id } : null;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function requireAdmin(request, env) {
  const session = await verifySessionToken(env, readCookie(request, "admin_session"));
  return session?.role === "admin";
}

// Returns the logged-in customer's id, or null if not logged in.
export async function currentCustomerId(request, env) {
  const session = await verifySessionToken(env, readCookie(request, "customer_session"));
  return session?.role === "customer" ? session.id : null;
}
