"use client";

import { useId } from "react";

export function SearchForm({ initialQuery }: { initialQuery: string }) {
  const inputId = useId();

  return (
    <form role="search" className="flex flex-col gap-2">
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
