export function normalizeKeyword(input: string): string | null {
  // trim は全角空白（U+3000）・タブ・改行も除去するため、見た目が空の入力を空入力として扱える。
  const trimmed = input.trim();
  return trimmed === "" ? null : trimmed;
}
