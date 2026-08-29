/**
 * Write a Canvas view model to disk so Web and Cursor render the same JSON.
 *
 * Builders stay pure; this is the only place that knows the file layout
 * (`<canvasDir>/<suite>/<viewId>.json`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CanvasViewModel } from "../../../schemas/canvas-view.js";
import { canvasViewModelSchema } from "../../../schemas/canvas-view.js";
import { buildComplianceGvpViewModel } from "./builders/compliance-gvp.js";
import { buildComplianceQmsViewModel } from "./builders/compliance-qms.js";

export interface CanvasViewBuildOptions {
  updatedAt?: string;
  tenant?: string;
  reportDate?: string;
  companyName?: string;
}

type CanvasViewBuilder = (opts?: CanvasViewBuildOptions) => CanvasViewModel;

const BUILDERS: Record<string, CanvasViewBuilder> = {
  "compliance/qms": buildComplianceQmsViewModel,
  "compliance/gvp": buildComplianceGvpViewModel,
};

export function listCanvasViewIds(): string[] {
  return Object.keys(BUILDERS).sort();
}

export function syncCanvasView(opts: {
  suite: string;
  viewId: string;
  canvasDir: string;
  updatedAt?: string;
  date?: string;
  tenant?: string;
  companyName?: string;
}): { view_model: CanvasViewModel; path: string } {
  const key = `${opts.suite}/${opts.viewId}`;
  const build = BUILDERS[key];
  if (!build) {
    throw new Error(`Unknown canvas view ${key} (known: ${listCanvasViewIds().join(", ")})`);
  }
  const viewModel = canvasViewModelSchema.parse(
    build({
      updatedAt: opts.updatedAt,
      tenant: opts.tenant,
      reportDate: opts.date,
      companyName: opts.companyName,
    })
  );
  const dir = join(opts.canvasDir, opts.suite);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${opts.viewId}.json`);
  writeFileSync(path, `${JSON.stringify(viewModel, null, 2)}\n`, "utf-8");
  return { view_model: viewModel, path };
}
