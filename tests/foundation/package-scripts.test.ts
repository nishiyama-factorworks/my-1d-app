// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

function readPackageJson(): {
  scripts: Record<string, string>;
} {
  return JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8"));
}

describe("package.json の起動スクリプト（仕様 0020）", () => {
  it("AC-1: scripts.dev が next dev と完全に一致する", () => {
    expect(readPackageJson().scripts.dev).toBe("next dev");
  });

  it("AC-2: scripts.start が next start と完全に一致する", () => {
    expect(readPackageJson().scripts.start).toBe("next start");
  });
});

describe("AC-3: 既存のスクリプトは変わらない", () => {
  it.each([
    ["typecheck", "next typegen && tsc --noEmit"],
    ["lint", "eslint ."],
    ["test", "vitest run"],
    ["test:e2e", "playwright test"],
    ["build", "next build"],
    ["format", "prettier --write ."],
  ])("AC-3: scripts.%s が %s と完全に一致する", (name, expected) => {
    expect(readPackageJson().scripts[name]).toBe(expected);
  });
});
