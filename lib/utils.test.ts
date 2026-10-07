import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("cn: 複数のクラス名を空白区切りで連結する", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("cn: false / undefined / null の値を除外する", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("cn: 競合する Tailwind クラスは後に書いたものが残る", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
