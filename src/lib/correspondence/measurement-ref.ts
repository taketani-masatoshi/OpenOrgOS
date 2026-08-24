/**
 * 計測・デモ・証明用プレースホルダ — 社外文 / 本番 VR confirm では拒否。
 * デモ時のみ `--allow-measurement-ref` で明示許可。
 */
export const MEASUREMENT_EXTERNAL_REF_RE =
  /LIVE-MEASURE|DEMO-ONLY|TEST-REF|HP-PROOF|PROOF-|REH-/i;

export function isMeasurementExternalRef(ref?: string): boolean {
  return Boolean(ref?.trim() && MEASUREMENT_EXTERNAL_REF_RE.test(ref));
}

export function bodyContainsMeasurementPlaceholder(body: string): boolean {
  return MEASUREMENT_EXTERNAL_REF_RE.test(body);
}

/**
 * Hot Pepper deep-link 経路: 人手で得た予約番号の最低形状。
 * 計測プレースホルダは別途 `isMeasurementExternalRef` で拒否する。
 */
export function assertHotpepperExternalRefShape(ref: string): void {
  const t = ref.trim();
  if (t.length < 6 || !/\d/.test(t)) {
    throw new Error(
      `Hot Pepper external_ref は数字を含む本番予約番号（6文字以上）を想定します: "${t}"。デモ番号は --allow-measurement-ref が必要です`
    );
  }
}
