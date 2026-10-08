// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

type Decision = "ask" | "deny" | "pass";

/**
 * guard-bash.sh を実際に実行して判定を返す。
 * 標準出力が空なら「素通り」、JSON なら permissionDecision を読む。
 * exit code 2（jq が無い等）は実行環境の不備なので、例外のまま伝えてテストを失敗させる。
 */
function decide(command: string): Decision {
  const stdout = execFileSync("bash", [".claude/hooks/guard-bash.sh"], {
    input: JSON.stringify({ tool_input: { command } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
    cwd: root,
  });
  if (stdout.trim() === "") return "pass";
  const parsed = JSON.parse(stdout) as {
    hookSpecificOutput?: { permissionDecision?: string };
  };
  const decision = parsed.hookSpecificOutput?.permissionDecision;
  if (decision === "ask" || decision === "deny") return decision;
  throw new Error(`想定外の hook 出力: ${stdout}`);
}

describe("ready-issues --apply の確認規則（AC-22 / hook）", () => {
  it.each([
    "node scripts/ready-issues.mjs --project 3 --apply",
    "node scripts/ready-issues.mjs --apply --project 3",
    "node scripts\\ready-issues.mjs --project 3 --apply",
    "node ./scripts/ready-issues.mjs --apply",
    'node "scripts/ready-issues.mjs" "--apply" --project 3',
    "cd scripts && node ready-issues.mjs --apply --project 3",
    "node scripts/ready-issues.mjs --project 3 \\\n  --apply",
    "node scripts/ready-issues.mjs --project 3 --apply | tee log.txt",
    // 誤検知の固定（安全側。計画 Q9）
    'git commit -m "feat: ready-issues.mjs に --apply を追加"',
  ])("AC-22: 「%s」は guard-bash.sh で確認（ask）になる", (command) => {
    expect(decide(command)).toBe("ask");
  });

  it.each([
    "node scripts/ready-issues.mjs",
    "node scripts/ready-issues.mjs --assume-closed 8",
    "node scripts/ready-issues.mjs --project 3",
    "node scripts/ready-issues.mjs --project 3 --owner foo",
    "node scripts/ready-issues.mjs --project 3 && echo --apply",
    "pnpm test scripts/lib/ready-issues-cli.test.ts",
  ])("AC-22: 「%s」は guard-bash.sh を素通り（pass）する", (command) => {
    expect(decide(command)).toBe("pass");
  });

  it("AC-22: --apply と .env の読み取りが並ぶとき、確認ではなく拒否（deny）になる", () => {
    expect(decide("node scripts/ready-issues.mjs --apply; cat .env")).toBe(
      "deny",
    );
  });
});

describe("既存の hook 規則の回帰（AC-22）", () => {
  it("AC-22: gh project item-edit は従来どおり確認（ask）になる", () => {
    expect(decide("gh project item-edit 3 --owner x")).toBe("ask");
  });

  it("AC-22: git push --force は従来どおり拒否（deny）になる", () => {
    expect(decide("git push --force")).toBe("deny");
  });
});

describe("ready-issues の settings.json の規則（AC-22）", () => {
  const settings = JSON.parse(
    readFileSync(path.join(root, ".claude/settings.json"), "utf8"),
  ) as { permissions: { allow: string[]; ask: string[] } };

  it("AC-22: allow に引数ありなしを含む ready-issues の実行が入っている", () => {
    expect(settings.permissions.allow).toContain(
      "Bash(node scripts/ready-issues.mjs *)",
    );
  });

  it("AC-22: ask に --apply を含む ready-issues の実行が入っている", () => {
    expect(settings.permissions.ask).toContain(
      "Bash(node scripts/ready-issues.mjs *--apply*)",
    );
  });

  it("AC-22: allow にも ask にも広い Bash(node *) が無い", () => {
    expect(settings.permissions.allow).not.toContain("Bash(node *)");
    expect(settings.permissions.ask).not.toContain("Bash(node *)");
  });
});
