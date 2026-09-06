import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

// 用真正的 Workers 執行環境跑測試（Miniflare），不是拿 Node 模擬 —— D1、R2
// 這些 binding 的行為才會跟正式環境一致。設定沿用 wrangler.toml 裡的
// DB／PRODUCT_IMAGES binding，測試檔直接 import functions/ 底下的 handler
// 來呼叫，不需要真的發 HTTP request。
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } })],
  test: {
    include: ["test/**/*.test.js"],
  },
});
