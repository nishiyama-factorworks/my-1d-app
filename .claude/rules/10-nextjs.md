---
paths:
  - "src/app/**/*.{ts,tsx}"
  - "app/**/*.{ts,tsx}"
  - "src/features/**/*.{ts,tsx}"
  - "next.config.*"
  - "middleware.ts"
  - "src/middleware.ts"
---

# Next.js（App Router）ルール

> 対象パスのファイルを読み書きするときだけ読み込まれる。Pages Router を使う場合は MANUAL 5章を参照して書き換える。

## バージョン依存の挙動

- キャッシュ、`params`/`searchParams` の扱い、Server Actions など**バージョンで挙動が変わる部分は推測で書かない**。`package.json` の Next.js バージョンを確認し、公式ドキュメント（または `node_modules/next/dist/docs`）で確かめる。

## Server / Client の境界

- コンポーネントは既定で **Server Component**。`"use client"` はイベントハンドラ・状態・ブラウザ API が必要な**末端のコンポーネントだけ**に付ける。ページや layout 全体を client にしない。
- Client Component から Server 専用コード（DB、シークレット、`server-only` なモジュール）を import しない。サーバ専用モジュールには `import "server-only"` を付ける。
- `NEXT_PUBLIC_` で始まる環境変数はブラウザへ公開される。シークレットには絶対に使わない。

## ルーティング・ファイル規約

- `page.tsx` は薄く保つ。データ取得と表示の組み立て以外のロジックは `src/features/<名前>/` に置く。
- ルートごとに `loading.tsx` / `error.tsx` を必要に応じて用意し、`not-found` は `notFound()` で扱う。
- メタデータは `metadata` / `generateMetadata` で定義する。`<head>` を手書きしない。

## データ取得・変更

- 読み取りは Server Component 内で行う。クライアントからの `useEffect` による取得は最後の手段。
- 変更は Server Action または Route Handler。**入力は必ず zod 等でサーバ側検証**し、認可チェックを行ってから処理する（クライアント側検証だけに頼らない）。
- Route Handler は HTTP ステータスとエラー形式を統一する（`{ error: { code, message } }`）。
- 外部 API 呼び出しにはタイムアウトとエラー処理を入れ、失敗時の UI を用意する。

## UI

- 画像は `next/image`、リンクは `next/link`、フォントは `next/font` を使う。
- アクセシビリティ: セマンティックな HTML、フォームには label、画像には alt、キーボード操作可能であること。
