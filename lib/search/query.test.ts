// @vitest-environment node
import { describe, expect, it } from "vitest";

import { normalizeKeyword } from "./query";

describe("normalizeKeyword", () => {
  it('AC-25a: "  react  " を正規化すると "react" になる', () => {
    expect(normalizeKeyword("  react  ")).toBe("react");
  });

  it('AC-25a: 内側の空白は残り、前後の空白だけが除かれる（" next js " → "next js"）', () => {
    expect(normalizeKeyword(" next js ")).toBe("next js");
  });

  it.each([
    { label: "空文字", input: "" },
    { label: "半角空白のみ", input: "   " },
    { label: "全角空白のみ（U+3000）", input: "　" },
    { label: "タブのみ", input: "\t\t" },
    { label: "改行のみ", input: "\n\r\n" },
  ])("AC-25b: $label を正規化すると null になる", ({ input }) => {
    expect(normalizeKeyword(input)).toBeNull();
  });
});
