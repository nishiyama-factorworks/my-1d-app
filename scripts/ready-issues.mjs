// @ts-check
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { runReadyIssues } from "./lib/ready-issues-cli.mjs";

const execFileAsync = promisify(execFile);
const SPECS_DIR = new URL("../docs/specs/", import.meta.url);

/**
 * gh をシェルを経由せずに呼ぶ。失敗時は stderr を持つ Error で reject される。
 * @param {string[]} args
 * @returns {Promise<{ stdout: string }>}
 */
async function runGh(args) {
  const { stdout } = await execFileAsync("gh", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return { stdout };
}

/**
 * 仕様ファイル（先頭が数字の *.md。_template.md などは除く）を読む。
 * @returns {Promise<{ name: string; text: string }[]>}
 */
async function readSpecFiles() {
  const names = (await readdir(SPECS_DIR)).filter((name) =>
    /^\d.*\.md$/.test(name),
  );
  return Promise.all(
    names.map(async (name) => ({
      name,
      text: await readFile(new URL(name, SPECS_DIR), "utf8"),
    })),
  );
}

process.exitCode = await runReadyIssues({
  argv: process.argv.slice(2),
  runGh,
  readSpecFiles,
  out: console.log,
  err: console.error,
});
