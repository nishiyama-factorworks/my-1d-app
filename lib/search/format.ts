// Intl / toLocaleString は ICU や既定ロケールの違いで、サーバーとブラウザの出力が
// 食い違う（ハイドレーション不一致の原因になる）ため使わず、正規表現で桁区切りする。
export function formatNumber(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatLanguage(language: string | null): string {
  return language === null || language === "" ? "-" : language;
}
