// Password hashing via PBKDF2-SHA256 (Web Crypto — available in both the
// Workers runtime and Node's `crypto.webcrypto`). Not bcrypt/argon2, but a
// real salted, iterated KDF rather than a bare hash — appropriate for a
// single-table demo customer store.
const ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;

const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function deriveBits(password, saltBytes) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    KEY_LENGTH_BITS
  );
  return toHex(bits);
}

export async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, saltBytes);
  return { hash, salt: toHex(saltBytes) };
}

export async function verifyPassword(password, hash, salt) {
  const candidate = await deriveBits(password, fromHex(salt));
  if (candidate.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
