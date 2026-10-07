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

export function normalizeKeyword(input: string): string | null {
  // trim は全角空白（U+3000）・タブ・改行も除去するため、見た目が空の入力を空入力として扱える。
  const trimmed = input.trim();
  return trimmed === "" ? null : trimmed;
}
