// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..");

function readEnvExampleLines(): string[] {
  return readFileSync(path.join(root, ".env.example"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** git check-ignore の終了コードを返す（0: 管理外 / 1: 管理対象）。 */
function checkIgnoreExitCode(target: string): number {
  try {
    execFileSync("git", ["check-ignore", "--no-index", "-q", target], {
      cwd: root,
      stdio: "ignore",
    });
    return 0;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (typeof status === "number") return status;
    throw error;
  }
}

describe("環境変数ファイル（AC-32a）", () => {
  it("AC-32a: .env.example に GITHUB_TOKEN のキーがある", () => {
    const keys = readEnvExampleLines().filter((l) => !l.startsWith("#"));
    expect(keys).toContain("GITHUB_TOKEN=");
  });

  it("AC-32a: .env.example のコメント以外の行はすべて値を持たないキーである", () => {
    const nonComments = readEnvExampleLines().filter((l) => !l.startsWith("#"));
    for (const line of nonComments) {
      expect(line).toMatch(/^[A-Z][A-Z0-9_]*=$/);
    }
  });

  it("AC-32a: .env.example に GITHUB_TOKEN 以外のキーが無い（コメント内の例も含む）", () => {
    const text = readEnvExampleLines().join("\n");
    const keys = [...text.matchAll(/([A-Z][A-Z0-9_]*)=/g)].map((m) => m[1]);
    const others = keys.filter((k) => k !== "GITHUB_TOKEN");
    expect(others).toEqual([]);
  });

  it.each([
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test.local",
  ])("AC-32a: %s は Git 管理外である", (file) => {
    expect(checkIgnoreExitCode(file)).toBe(0);
  });

  it("AC-32a: .env.example は Git 管理外ではない", () => {
    expect(checkIgnoreExitCode(".env.example")).toBe(1);
  });
});
