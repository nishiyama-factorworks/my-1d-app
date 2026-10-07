// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

function readPackageJson(): {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
} {
  return JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8"));
}

function minMajor(range: string): number {
  const match = range.match(/\d+/);
  if (!match) throw new Error(`メジャーバージョンを取り出せない: ${range}`);
  return Number(match[0]);
}

function collectFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full) : [full];
  });
}

describe("プロジェクト構造 (AC-21b)", () => {
  it("AC-21b: next のメジャーバージョンが16以上である", () => {
    const range = readPackageJson().dependencies.next;

    expect(minMajor(range)).toBeGreaterThanOrEqual(16);
  });

  it("AC-21b: ルート直下に app/ と app/page.tsx・app/layout.tsx がある", () => {
    expect(existsSync(path.join(root, "app"))).toBe(true);
    expect(existsSync(path.join(root, "app/page.tsx"))).toBe(true);
    expect(existsSync(path.join(root, "app/layout.tsx"))).toBe(true);
  });

  it("AC-21b: tsconfig.json の compilerOptions.strict が true である", () => {
    const { config, error } = ts.readConfigFile(
      path.join(root, "tsconfig.json"),
      ts.sys.readFile,
    );

    expect(error).toBeUndefined();
    expect(config.compilerOptions.strict).toBe(true);
  });

  it("AC-21b: app/ 配下にスモークテスト (*.test.tsx) が1件以上ある", () => {
    const smokeTests = collectFiles(path.join(root, "app")).filter((f) =>
      f.endsWith(".test.tsx"),
    );

    expect(smokeTests.length).toBeGreaterThanOrEqual(1);
  });

  it("非機能8節: scripts.test が vitest run である", () => {
    expect(readPackageJson().scripts.test).toBe("vitest run");
  });

  it("AC-21a: scripts.typecheck が tsc の前に型生成 (next typegen) を行う", () => {
    // 生成型 (LayoutProps 等) は Git 管理外のため、クリーン状態では生成しないと型エラーになる
    expect(readPackageJson().scripts.typecheck).toMatch(
      /^next typegen && tsc /,
    );
  });
});
