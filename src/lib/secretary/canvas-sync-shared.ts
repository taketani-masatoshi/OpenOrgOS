/**
 * Shared formatting for Canvas sync outputs (Web / Cursor same VM).
 * Path: src/lib/secretary/canvas-sync-shared.ts
 */

/** `更新: YYYY-MM-DD HH:mm JST` — stable label for view models. */
export function formatUpdatedAtJst(now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const iso = jst.toISOString();
  return `更新: ${iso.slice(0, 10)} ${iso.slice(11, 16)} JST`;
}
