#!/usr/bin/env node
/** Split schemas/finance.ts into schemas/finance/*.ts (REF-4d). */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "schemas/finance.ts"), "utf-8").split("\n");
const header = `import { z } from "zod";
import { dateString, monthString } from "../common.js";
`;

const slices = [
  ["monthly-loans.ts", 3, 159],
  ["yojitsu.ts", 160, 242],
  ["balance-assets.ts", 244, 302],
  ["tax-profiles.ts", 304, 439],
  ["chart-of-accounts.ts", 441, 475],
  ["types.ts", 477, 507],
];

const outDir = join(ROOT, "schemas/finance");
mkdirSync(outDir, { recursive: true });

for (const [name, start, end] of slices) {
  const body = src.slice(start - 1, end).join("\n");
  writeFileSync(join(outDir, name), header + body + "\n");
}

writeFileSync(
  join(outDir, "index.ts"),
  `export * from "./monthly-loans.js";
export * from "./yojitsu.js";
export * from "./balance-assets.js";
export * from "./tax-profiles.js";
export * from "./chart-of-accounts.js";
export * from "./types.js";
`
);

writeFileSync(join(ROOT, "schemas/finance.ts"), `/** @deprecated Import from ./finance/index.js — split REF-4d */
export * from "./finance/index.js";
`);

console.log("split schemas/finance.ts -> schemas/finance/");
