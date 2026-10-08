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

describe("package.json の scripts (仕様 0020)", () => {
  it("AC-1: scripts.dev が next dev である", () => {
    expect(readPackageJson().scripts.dev).toBe("next dev");
  });

  it("AC-2: scripts.start が next start である", () => {
    expect(readPackageJson().scripts.start).toBe("next start");
  });

  it("AC-3: 既存の6スクリプトの内容が変わっていない", () => {
    const { scripts } = readPackageJson();

    expect(scripts.typecheck).toBe("next typegen && tsc --noEmit");
    expect(scripts.lint).toBe("eslint .");
    expect(scripts.test).toBe("vitest run");
    expect(scripts["test:e2e"]).toBe("playwright test");
    expect(scripts.build).toBe("next build");
    expect(scripts.format).toBe("prettier --write .");
  });
});
