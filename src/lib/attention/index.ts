/**
 * CEO attention board shared helpers for Canvas View Models.
 * Path: src/lib/attention/index.ts
 */
import type { CanvasViewModel } from "../../../schemas/canvas-view.js";

/** Row / decision caps so a CEO board stays scannable on one screen. */
export const CEO_ATTENTION_CANVAS_DEFAULTS = {
  maxRows: 40,
  maxDecisions: 8,
} as const;

/** Note shown when a board lists fewer rows than the portfolio holds. */
export function omitNote(shown: number, total: number): string {
  if (total <= shown) return "";
  return `他 ${total - shown} 件は省略`;
}

export function attentionEmptyCallout(
  title: string,
  body: string,
): CanvasViewModel["sections"][number] {
  return { type: "callout", tone: "success", title, body };
}

export function attentionBoardLinks(opts: {
  tenant: string;
  domainKey: string;
}): CanvasViewModel["links"] {
  const path = opts.domainKey.replace(/_/g, "/");
  return {
    web_path: `/t/${opts.tenant}/${path}`,
    present_cmd: `orgos canvas view --id ${opts.domainKey}`,
  };
}
