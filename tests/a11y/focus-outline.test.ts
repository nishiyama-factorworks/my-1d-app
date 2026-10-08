// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const TARGET_DIRS = ["app", "features", "lib", "components"];
const TARGET_EXTENSIONS = [".ts", ".tsx", ".css", ".js", ".mjs"];

// 仕様 AC-26b2 の 4 つ。outline-0 は outline-0.5 のような別の指定を巻き込まないよう、直後が数字・小数点のものを除く。
// コメント中の語も検出する（除外の仕組みは作らない）。
const FORBIDDEN_OUTLINE =
  /outline-none|outline-0(?![\d.])|outline\s*:\s*none|outline\s*:\s*0(?![\d.])/;

function hasForbiddenOutline(line: string): boolean {
  return FORBIDDEN_OUTLINE.test(line);
}

function isTargetFile(name: string): boolean {
  return (
    TARGET_EXTENSIONS.includes(path.extname(name)) &&
    !/\.test\.[^.]+$/.test(name)
  );
}

function collectFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(full);
    return isTargetFile(entry.name) ? [full] : [];
  });
}

function toRelative(file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

const files = TARGET_DIRS.flatMap((dir) => collectFiles(path.join(root, dir)));

describe("フォーカス表示を消す指定の静的検査", () => {
  it("AC-26b2: app/ features/ lib/ components/ のコードと app/globals.css に、outline-none・outline-0・outline: none・outline: 0 が無い", () => {
    const violations = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .flatMap((line, i) =>
          hasForbiddenOutline(line)
            ? [`${toRelative(file)}:${i + 1}: ${line.trim()}`]
            : [],
        ),
    );

    expect(violations).toEqual([]);
  });

  it("AC-26b2（前提）: 走査したファイルに app/globals.css と features/search/components/search-form.tsx が含まれる", () => {
    const scanned = files.map(toRelative);

    expect(scanned).toContain("app/globals.css");
    expect(scanned).toContain("features/search/components/search-form.tsx");
  });

  it.each(["focus:outline-none", "outline-0", "outline: none;", "outline:0"])(
    "AC-26b2（検出器の確認）: 禁止の指定を含む文字列を検出する: %s",
    (text) => {
      expect(hasForbiddenOutline(text)).toBe(true);
    },
  );

  it.each(["outline-offset-0", "outline-2", "outline-0.5"])(
    "AC-26b2（検出器の確認）: 禁止の指定を含まない文字列を検出しない: %s",
    (text) => {
      expect(hasForbiddenOutline(text)).toBe(false);
    },
  );
});
