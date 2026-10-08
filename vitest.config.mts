import path from "node:path";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    // e2e/ は Playwright が実行する（pnpm test:e2e）。Vitest に拾わせない（仕様 0013 の AC-31g）。
    // configDefaults.exclude を残す（外すと node_modules 配下のテストまで対象になる）。
    exclude: [...configDefaults.exclude, "e2e/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
