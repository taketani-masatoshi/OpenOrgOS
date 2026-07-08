#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.ORGOS_HOME = packageRoot;

const compiled = join(packageRoot, "dist", "src", "cli.js");
if (existsSync(compiled)) {
  await import(compiled);
} else {
  console.error("OrgOS CLI not built — run: npm run build:package");
  process.exit(1);
}
