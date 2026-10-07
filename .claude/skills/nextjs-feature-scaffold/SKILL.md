---
name: nextjs-feature-scaffold
description: Next.js（App Router）で新しい機能（ページ・コンポーネント・Server Action・テスト一式）を追加する際の標準的なファイル構成と手順。機能の新規追加やルート追加を実装するときに使う。
---

# 機能追加の標準手順（nextjs-feature-scaffold）

> プロジェクトの構成が違う場合は、この SKILL.md を実際の構成に合わせて書き換える（MANUAL 4.9）。

## 構成（feature-first）

```
src/features/<feature>/
  components/        その機能専用の UI（*.tsx と *.test.tsx を同居）
  actions.ts         Server Actions（"use server"）。入力は zod で検証
  schema.ts          zod スキーマと型（入力検証の単一の情報源）
  queries.ts         読み取り系の関数（server-only）
  lib/               純粋なロジック（副作用なし。単体テストの主対象）
  <name>.test.ts(x)  テスト（対象の隣に置く）
src/app/<route>/
  page.tsx           薄く保つ。features を組み立てるだけ
  loading.tsx / error.tsx
e2e/<feature>.spec.ts  主要シナリオのみ
```

## 手順（TDD の順序で）

1. **スキーマ/型を先に決める**（`schema.ts`）。入力と出力の形が決まると、テストが書ける。
2. **純粋ロジックのテスト（RED）→ 実装（GREEN）**（`lib/`）。
3. **Server Action のテスト（RED）→ 実装（GREEN）**: 入力検証エラー・認可エラー・正常系。DB や外部 API は境界でモックする。
4. **コンポーネントのテスト（RED）→ 実装（GREEN）**: Testing Library で role / label / text を使って検索する。Server Component を直接テストしにくい場合は、ロジックを `lib/` と Client の末端コンポーネントに分けてテストする。
5. **ルート（`page.tsx`）を組み立てる**。`loading.tsx` / `error.tsx` を用意する。
6. **E2E**: 価値の高い主要シナリオを 1〜2 本だけ。
7. `bash scripts/verify.sh` を実行して全 PASS を確認する。

## 守ること

- `.claude/rules/10-nextjs.md`（Server/Client 境界、検証、`NEXT_PUBLIC_`）と `20-typescript.md` に従う。
- 機能の外から使うものだけを `index.ts` で export し、内部実装は import させない。
- 共通化は 3 回目の重複が出てから。最初は機能内に置く。
- 環境変数が必要なら `.env.example` にキー名だけ追記する（値は書かない）。
