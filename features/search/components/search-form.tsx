"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { buildSearchPath } from "@/lib/search/paths";
import { normalizeKeyword } from "@/lib/search/query";

const EMPTY_KEYWORD_GUIDE = "キーワードを入力してください";

export function SearchForm({ initialQuery }: { initialQuery: string }) {
  const inputId = useId();
  const guideId = useId();
  const router = useRouter();
  const [guide, setGuide] = useState<string>("");

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
        if (keyword === null) {
          setGuide(EMPTY_KEYWORD_GUIDE);
          return;
        }
        // 同じ q で再送信すると key が変わらず再描画されず案内が残るため、遷移前に明示的に消す。
        setGuide("");
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
          aria-invalid={guide !== "" ? true : undefined}
          aria-describedby={guide !== "" ? guideId : undefined}
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          検索
        </button>
      </div>
      <p id={guideId} role="alert" className="text-sm text-red-600">
        {guide}
      </p>
    </form>
  );
}
