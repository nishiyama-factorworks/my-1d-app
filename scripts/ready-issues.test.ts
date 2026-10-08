// @vitest-environment node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ENTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "ready-issues.mjs",
);

// gh が呼ばれる引数（引数なし・--project 付き）は、このテストでは実行しない
function runEntry(args: string[]) {
  try {
    const stdout = execFileSync(process.execPath, [ENTRY, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: e.status ?? -1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

describe("入口 scripts/ready-issues.mjs（実プロセス）", () => {
  it("AC-17: --apply だけを付けると使い方を stderr に表示して終了コード 1", () => {
    const result = runEntry(["--apply"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("使い方");
  });

  it("未知のオプション --foo では使い方を stderr に表示して終了コード 1", () => {
    const result = runEntry(["--foo"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("使い方");
  });
});
