/** CEO-facing labels — keep technical ids out of the UI. */

export const PRODUCT_NAME = "経営ボード";

export function tenantDisplayName(tenantId: string): string {
  const map: Record<string, string> = {
    mal: "MAL",
    southwood: "Southwood",
    demo: "Demo",
    aiac: "AIAC",
  };
  return map[tenantId] ?? tenantId;
}

/** Drop operator/dev noise before showing lines to the CEO. */
export function isOperatorNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return (
    /tenants\//i.test(t) ||
    /docs\/reports\//i.test(t) ||
    /\borgos\b/i.test(t) ||
    /View Model/i.test(t) ||
    /Cursor Canvas/i.test(t) ||
    /SoT/i.test(t) ||
    /present_cmd/i.test(t) ||
    /npm run/i.test(t) ||
    /wire console/i.test(t) ||
    /このボードは閲覧のみ/i.test(t) ||
    /再生成:/i.test(t) ||
    /\.ya?ml\b/i.test(t) ||
    /modules\.yaml/i.test(t)
  );
}

export function cleanDisplayText(text: string): string | null {
  if (isOperatorNoise(text)) return null;
  return text;
}
