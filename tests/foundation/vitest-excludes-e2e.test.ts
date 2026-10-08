// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// 仕様 0013 AC-31g: pnpm test（Vitest）は e2e/ 配下を実行しない。
// 設定ファイルの中身ではなく、Vitest が実際に拾う対象ファイルの一覧で確かめる。
const ROOT = path.resolve(import.meta.dirname, "../..");
const VITEST_BIN = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");

function toRelative(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function listVitestFiles(): string[] {
  // pnpm の .cmd を避けるため、実行中の Node で vitest の bin を直接起動する。
  const output = execFileSync(
    process.execPath,
    [VITEST_BIN, "list", "--filesOnly", "--json"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const parsed: unknown = JSON.parse(output.slice(output.indexOf("[")));
  if (!Array.isArray(parsed)) {
    throw new Error("vitest list の出力が配列ではありません");
  }
  return parsed.map((entry: { file: string }) => toRelative(entry.file));
}

describe("AC-31g: Vitest の対象ファイルと e2e/", () => {
  let files: string[] = [];

  beforeAll(() => {
    files = listVitestFiles();
  }, 60_000);

  it("AC-31g: e2e/ 配下に *.spec.ts が 1 件以上ある", () => {
    const specs = readdirSync(path.join(ROOT, "e2e")).filter((name) =>
      name.endsWith(".spec.ts"),
    );

    expect(specs.length).toBeGreaterThanOrEqual(1);
  });

  it("AC-31g: Vitest の対象ファイルに e2e/ 配下のファイルが含まれない", () => {
    const e2eFiles = files.filter((file) => file.startsWith("e2e/"));

    expect(e2eFiles).toEqual([]);
  });

  it("AC-31g（対照）: Vitest の対象ファイルに lib/github/http.test.ts が含まれる", () => {
    expect(files).toContain("lib/github/http.test.ts");
  });
});
