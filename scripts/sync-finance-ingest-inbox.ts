/**
 * Sync steward/platform/finance/ingest-inbox → tenants/_template/docs/io
 * Usage: node --import tsx scripts/sync-finance-ingest-inbox.ts
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const src = join(root, "steward/platform/finance/ingest-inbox");
const destIo = join(root, "tenants/_template/docs/io");
const destInbox = join(destIo, "inbox");

if (!existsSync(src)) {
  console.error(`missing SSOT: ${src}`);
  process.exit(1);
}

mkdirSync(destInbox, { recursive: true });
cpSync(join(src, "00-README.md"), join(destIo, "00-README.md"));
for (const name of readdirSync(src, { withFileTypes: true })) {
  if (!name.isDirectory()) continue;
  const from = join(src, name.name, "00-このフォルダについて.md");
  if (!existsSync(from)) continue;
  const toDir = join(destInbox, name.name);
  mkdirSync(toDir, { recursive: true });
  cpSync(from, join(toDir, "00-このフォルダについて.md"));
  console.log(`synced ${name.name}`);
}
console.log("✓ finance ingest inbox templates synced to tenants/_template/docs/io");
