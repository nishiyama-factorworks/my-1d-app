import { defineConfig, devices } from "@playwright/test";

// 仕様 0013、ADR 0006。E2E は任意実行（bash scripts/verify.sh には含めない）。
const APP_PORT = 3100;
const MOCK_PORT = 4010;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  // 再試行で不安定さを隠さない。
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // 偽の GitHub API。専用のヘルスチェックの経路は作らず（仕様 6.2 の 2 つだけ）、検索の経路で待ち合わせる。
      command: "node --experimental-strip-types e2e/mock-api/server.ts",
      url: `http://127.0.0.1:${MOCK_PORT}/search/repositories?q=react`,
      reuseExistingServer: false,
    },
    {
      // LAN から偽の API につながったアプリに届かないよう、127.0.0.1 だけで待ち受ける。
      // 前回の fetch キャッシュ（ADR 0005）が残ると、モックの変更が反映されない。起動前に消す。
      // ビルドを含むため、待ち時間を長めにする。
      command: `node -e "require('node:fs').rmSync('.next/cache/fetch-cache',{recursive:true,force:true})" && pnpm build && pnpm start -H 127.0.0.1 -p ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}`,
      timeout: 180_000,
      // 上書きなしの既存サーバーを再利用すると、実際の GitHub API を呼んでしまう。
      reuseExistingServer: false,
      env: {
        GITHUB_API_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        // 多層防御。上書き中はトークンを送らないが、値自体も空にしておく。
        GITHUB_TOKEN: "",
      },
    },
  ],
});
