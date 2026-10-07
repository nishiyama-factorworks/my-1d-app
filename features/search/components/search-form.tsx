"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { buildSearchPath } from "@/lib/search/paths";
import { normalizeKeyword } from "@/lib/search/query";

export function SearchForm({ initialQuery }: { initialQuery: string }) {
  const inputId = useId();
  const router = useRouter();

  return (
    <form
      role="search"
      className="flex flex-col gap-2"
      // Enter は onKeyDown ではなくブラウザ標準の form 送信に任せる。
      // onKeyDown で拾うと日本語 IME の変換確定の Enter でも誤って送信されるため。
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("q");
        const keyword = normalizeKeyword(
          typeof value === "string" ? value : "",
        );
        if (keyword === null) return;
        router.push(buildSearchPath(keyword, 1));
      }}
    >
      <label htmlFor={inputId} className="text-sm font-medium">
        キーワード
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="search"
          name="q"
          defaultValue={initialQuery}
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          検索
        </button>
      </div>
      <p role="alert" className="text-sm text-red-600" />
    </form>
  );
}
