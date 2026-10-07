// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CLIENT_COMPONENT_ERROR = /cannot be imported from a Client Component/;

describe("AC-23c: lib/github はサーバー専用", () => {
  it("AC-23c: react-server 条件なしで server-only を import すると拒否される", async () => {
    await expect(import("server-only")).rejects.toThrow(CLIENT_COMPONENT_ERROR);
  });

  it.each(["@/lib/github", "@/lib/github/http", "@/lib/github/client"])(
    "AC-23c: react-server 条件なしで %s を import すると拒否される",
    async (specifier) => {
      await expect(import(/* @vite-ignore */ specifier)).rejects.toThrow(
        CLIENT_COMPONENT_ERROR,
      );
    },
  );

  it.each(["http.ts", "client.ts"])(
    'AC-23c: %s は先頭のコメントを除いた最初の文が import "server-only" である',
    (file) => {
      const source = readFileSync(path.join(import.meta.dirname, file), "utf8");
      const withoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .trim();
      expect(withoutComments.startsWith('import "server-only";')).toBe(true);
    },
  );
});
