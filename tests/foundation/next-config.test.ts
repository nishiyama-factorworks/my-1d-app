// @vitest-environment node
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

describe("next.config の画像設定", () => {
  it("AC-6a（仕様9節）: images.remotePatterns は avatars.githubusercontent.com の https・/u/**・?v=4 だけを許可する", () => {
    expect(nextConfig.images?.remotePatterns).toEqual([
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        port: "",
        pathname: "/u/**",
        search: "?v=4",
      },
    ]);
  });

  it.each([
    ["https://avatars.githubusercontent.com/u/14985020?v=4", true],
    ["http://avatars.githubusercontent.com/u/1?v=4", false],
    ["https://avatars.githubusercontent.com.evil.example/u/1?v=4", false],
    ["https://evil.example/u/1?v=4", false],
    ["https://avatars.githubusercontent.com/u/1?v=5", false],
    ["https://avatars.githubusercontent.com/in/1?v=4", false],
  ])(
    "AC-6a（仕様9節）: 実際の avatar_url の形は許可され、他のホスト・http・似せたホストは許可されない: %s => %s",
    (url, expected) => {
      const remotePatterns = nextConfig.images?.remotePatterns;

      expect(hasRemoteMatch([], remotePatterns ?? [], new URL(url))).toBe(
        expected,
      );
    },
  );
});
