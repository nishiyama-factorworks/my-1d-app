// E2E 用の偽の GitHub API（仕様 0013、ADR 0006）。
// `node --experimental-strip-types` で直接実行するため、型注釈以外の TypeScript 構文は使わない。
// 応答するのは仕様 6.2 の 2 つだけ（GET のみ）。それ以外は 404。
// データは決定的に作る（乱数・現在時刻を使わない）。リクエストのヘッダや本文はログに出さない。
import http from "node:http";

const HOST = "127.0.0.1";
const PORT = 4010;
const TOTAL = 45;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fullName(n: number): { owner: string; repo: string } {
  return { owner: `e2e-owner-${pad(n)}`, repo: `react-sample-${pad(n)}` };
}

function summary(n: number) {
  const { owner, repo } = fullName(n);
  return {
    full_name: `${owner}/${repo}`,
    private: false,
    visibility: "public",
    owner: {
      login: owner,
      // mappers.ts の許可ホストと next.config.ts の remotePatterns（/u/**・?v=4）を満たす。
      avatar_url: `https://avatars.githubusercontent.com/u/${n}?v=4`,
    },
  };
}

// 項目ごとに異なる値にして、Star 数と Watcher 数などの取り違えを検出できるようにする。
// watchers_count は使われないことの確認用（表示されたら誤り）。
function detail(n: number) {
  return {
    ...summary(n),
    language: "TypeScript",
    stargazers_count: 12345,
    subscribers_count: 678,
    watchers_count: 99999,
    forks_count: 910,
    open_issues_count: 11,
    html_url: `https://github.com/${summary(n).full_name}`,
  };
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function notFound(res: http.ServerResponse): void {
  send(res, 404, { message: "Not Found" });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" || req.url === undefined) {
    notFound(res);
    return;
  }
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname === "/search/repositories") {
    if (url.searchParams.get("q") !== "react") {
      send(res, 200, { total_count: 0, incomplete_results: false, items: [] });
      return;
    }
    const page = Number(url.searchParams.get("page") ?? "1");
    const perPage = Number(url.searchParams.get("per_page") ?? "30");
    // 範囲外の値でループが膨らまないよう、本物の API と同じ範囲に限る。
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(perPage) ||
      perPage < 1 ||
      perPage > 100
    ) {
      send(res, 422, { message: "Validation Failed" });
      return;
    }
    const start = (page - 1) * perPage;
    const items = [];
    for (let n = start + 1; n <= Math.min(start + perPage, TOTAL); n++) {
      items.push(summary(n));
    }
    send(res, 200, { total_count: TOTAL, incomplete_results: false, items });
    return;
  }

  const match = /^\/repos\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (match !== null) {
    for (let n = 1; n <= TOTAL; n++) {
      const { owner, repo } = fullName(n);
      if (match[1] === owner && match[2] === repo) {
        send(res, 200, detail(n));
        return;
      }
    }
  }
  notFound(res);
});

// 127.0.0.1 だけで待ち受ける（0.0.0.0 にしない）。
server.listen(PORT, HOST);

// Playwright が webServer を止めるときに、接続を残さず閉じる。
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
