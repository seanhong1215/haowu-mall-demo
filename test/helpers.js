// 測試在真正的 Workers 執行環境（Miniflare）裡跑，沒有檔案系統可讀，所以
// schema.sql 用 Vite 的 ?raw 匯入在建置時就內嵌成字串，而不是在測試裡用
// node:fs 讀檔。
import { env } from "cloudflare:test";
import schemaSql from "../schema.sql?raw";
import { createSessionToken } from "../functions/lib/auth.js";

// D1 的 env.DB.exec() 只接受一行一條陳述式、不認得註解或跨行語法，
// schema.sql 這種正常寫法的 SQL 檔案丟進去會直接報錯，所以自己切成
// 一條條陳述式再用 batch 執行。切割時要跳過單引號字串裡的分號與
// -- 註解，不能直接對整個檔案 split(";")。
function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      current += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          current += sql[++i]; // 字串裡的 '' 是跳脫單引號，不是結尾
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (ch === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

// 每個測試都從乾淨的 schema + 種子資料開始 —— schema.sql 本身就是
// DROP TABLE IF EXISTS 開頭，所以可以直接重跑。
export async function resetDb() {
  const statements = splitSqlStatements(schemaSql).map((s) => env.DB.prepare(s));
  await env.DB.batch(statements);
}

// schema.sql 的種子資料本身就帶了幾筆示範訂單 —— 測分頁／篩選／統計數字
// 這種對「總共幾筆」很敏感的邏輯時，先把訂單清空再灌自己知道筆數的資料，
// 斷言才不會混進種子資料的訂單數。
export async function resetOrders() {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM order_items`),
    env.DB.prepare(`DELETE FROM order_events`),
    env.DB.prepare(`DELETE FROM orders`),
  ]);
}

// 組一個帶有效管理員 session cookie 的 Request，讓測試可以直接呼叫
// requireAdmin() 會檢查的那些 handler，不用真的先打 /api/admin/login。
export async function adminRequest(url, init = {}) {
  const token = await createSessionToken(env, "admin");
  const headers = new Headers(init.headers);
  headers.set("Cookie", `admin_session=${token}`);
  return new Request(url, { ...init, headers });
}

export function jsonRequest(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Request(url, { ...init, headers });
}

export async function adminJsonRequest(url, init = {}) {
  const token = await createSessionToken(env, "admin");
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cookie", `admin_session=${token}`);
  return new Request(url, { ...init, headers });
}
