export type SearchParamsInput = Readonly<
  Record<string, string | string[] | undefined>
>;

export type SearchQuery = { q: string | null; page: number };

function firstValue(
  params: SearchParamsInput,
  key: string,
): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) {
    // noUncheckedIndexedAccess が無効で value[0] は string と推論されるが、空配列では undefined になる。
    const first: string | undefined = value[0];
    return first;
  }
  return value;
}

function parsePage(value: string | undefined): number {
  // Number()/parseInt() だけだと " 3"・"1e3"・"3abc" を通してしまうため、
  // 正規表現で正の整数表記に限定し、桁あふれ（安全な整数でない値）も除外する。
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) return 1;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : 1;
}

export function parseSearchParams(params: SearchParamsInput): SearchQuery {
  const q = firstValue(params, "q");
  return {
    q: q === undefined ? null : normalizeKeyword(q),
    page: parsePage(firstValue(params, "page")),
  };
}

// trim() が除かないゼロ幅文字（U+200B・U+200C・U+200D・U+2060）。見た目が空の入力を空と判定するためだけに使う。
// `g` 付きのため replace 専用（test() に流用すると lastIndex が残る）。
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\u2060]/g;

export function normalizeKeyword(input: string): string | null {
  // trim は全角空白（U+3000）・タブ・改行も除去するため、見た目が空の入力を空入力として扱える。
  const trimmed = input.trim();
  // ゼロ幅文字と空白だけの入力も空とする。空でないときは、ゼロ幅文字を取り除かず trim した値をそのまま返す。
  return trimmed.replace(ZERO_WIDTH_CHARS, "").trim() === "" ? null : trimmed;
}
