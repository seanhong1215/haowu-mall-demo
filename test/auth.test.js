import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { createSessionToken, verifySessionToken, readCookie } from "../functions/lib/auth.js";

describe("session tokens", () => {
  it("round-trips a valid admin token", async () => {
    const token = await createSessionToken(env, "admin");
    const session = await verifySessionToken(env, token);
    expect(session).toEqual({ role: "admin", id: 0 });
  });

  it("carries the customer id through", async () => {
    const token = await createSessionToken(env, "customer", 42);
    const session = await verifySessionToken(env, token);
    expect(session).toEqual({ role: "customer", id: 42 });
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken(env, "admin", 0, -1); // 已過期 1 秒
    expect(await verifySessionToken(env, token)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken(env, "admin");
    const [role, id, expires] = token.split(".");
    const tampered = `${role}.${id}.${expires}.${"0".repeat(64)}`;
    expect(await verifySessionToken(env, tampered)).toBeNull();
  });

  it("rejects a token with a forged role but the original signature", async () => {
    // 換掉 payload 卻沿用舊簽章——驗證簽章真的綁死了整個 payload，不能只換
    // 中間的欄位就冒充別的身分。
    const token = await createSessionToken(env, "customer", 1);
    const [, id, expires, signature] = token.split(".");
    const forged = `admin.${id}.${expires}.${signature}`;
    expect(await verifySessionToken(env, forged)).toBeNull();
  });

  it("rejects malformed or missing tokens", async () => {
    expect(await verifySessionToken(env, null)).toBeNull();
    expect(await verifySessionToken(env, "not-a-token")).toBeNull();
    expect(await verifySessionToken(env, "admin.0.123")).toBeNull(); // 少一段
  });

  it("reads a cookie out of a Cookie header", () => {
    const request = new Request("https://example.com", {
      headers: { Cookie: "foo=bar; admin_session=abc%2Edef; other=1" },
    });
    expect(readCookie(request, "admin_session")).toBe("abc.def");
    expect(readCookie(request, "missing")).toBeNull();
  });
});
