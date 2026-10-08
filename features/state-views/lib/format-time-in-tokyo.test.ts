// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatTimeInTokyo } from "./format-time-in-tokyo";

describe("formatTimeInTokyo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("AC-18a: 2026-10-08T06:42:00Z は 15:42 になる", () => {
    expect(formatTimeInTokyo(new Date("2026-10-08T06:42:00Z"))).toBe("15:42");
  });

  it.each([
    {
      name: "AC-18a: 日本時間の深夜0時（2026-10-08T15:00:00Z）は 00:00 になり 24:00 にならない",
      iso: "2026-10-08T15:00:00Z",
      expected: "00:00",
    },
    {
      name: "AC-18a: 時・分を2桁に0埋めする（2026-10-08T00:05:00Z → 09:05）",
      iso: "2026-10-08T00:05:00Z",
      expected: "09:05",
    },
    {
      name: "AC-18a: 日付をまたぐ前（2026-10-07T23:59:00Z → 08:59）",
      iso: "2026-10-07T23:59:00Z",
      expected: "08:59",
    },
    {
      name: "AC-18a: 日付をまたぐ直前（2026-10-08T14:59:00Z → 23:59）",
      iso: "2026-10-08T14:59:00Z",
      expected: "23:59",
    },
  ])("$name", ({ iso, expected }) => {
    expect(formatTimeInTokyo(new Date(iso))).toBe(expected);
  });

  it.each([{ tz: "UTC" }, { tz: "America/Los_Angeles" }, { tz: "Asia/Tokyo" }])(
    "AC-18a: 実行環境のタイムゾーンが $tz でも 2026-10-08T06:42:00Z は 15:42 になる",
    ({ tz }) => {
      vi.stubEnv("TZ", tz);

      expect(formatTimeInTokyo(new Date("2026-10-08T06:42:00Z"))).toBe("15:42");
    },
  );
});
