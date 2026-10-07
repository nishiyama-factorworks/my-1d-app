import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 画像最適化の `url` パラメータは利用者が自由に組み立てられる。ホスト・パス・
    // クエリを固定して、キャッシュを回避した大量取得に使われるのを防ぐ。
    // 許可ホストは 0003 の AC-5g（avatar_url の許可ホスト）と一致させている。
    // トレードオフ: GitHub が `?v=4` を変えると、全アイコンが 400 になる。
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        port: "",
        pathname: "/u/**",
        search: "?v=4",
      },
    ],
  },
};

export default nextConfig;
