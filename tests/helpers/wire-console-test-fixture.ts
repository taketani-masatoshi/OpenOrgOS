import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR, setTenantId } from "../../src/lib/tenant.js";
import { ensureProtocolSigningKey } from "../../src/lib/protocol/signing.js";

export const WIRE_CONSOLE_TEST_TENANT = "wire-console-test";

export const WIRE_CONSOLE_TEST_EVENT_ID = "c0ffee00-0000-4000-8000-000000000001";

const TEMPLATE_DIR = join(ROOT_DIR, "tests", "fixtures", "wire-console-test");

function copyTemplate(relPath: string, destRoot: string): void {
  const src = join(TEMPLATE_DIR, relPath);
  const dest = join(destRoot, relPath);
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileSync(dest, readFileSync(src, "utf-8"), "utf-8");
}

/** Reset mutable protocol/org state for isolated wire-console HTTP tests. */
export function resetWireConsoleTestTenant(): void {
  const tenantRoot = join(ROOT_DIR, "tenants", WIRE_CONSOLE_TEST_TENANT);
  for (const rel of [
    "data/org/pending-approvals.yaml",
    "data/protocol/transactions-registry.yaml",
    "data/protocol/audit-chain.jsonl",
    "data/protocol/wire-pending.yaml",
    "data/protocol/wire-delivered.yaml",
    "data/protocol/witness-pending.yaml",
  ]) {
    const p = join(tenantRoot, rel);
    if (existsSync(p)) rmSync(p, { force: true });
  }
  for (const dir of ["docs/protocol/outbox", "docs/protocol/inbox"]) {
    const p = join(tenantRoot, dir);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }

  for (const rel of [
    "data/org/pending-approvals.yaml",
    "data/protocol/transactions-registry.yaml",
    "data/protocol/audit-chain.jsonl",
    "docs/protocol/outbox/seed-outbox.json",
    "docs/protocol/outbox/seed-outbox.steward-provenance.json",
    "docs/protocol/inbox/seed-inbox.json",
  ]) {
    copyTemplate(rel, tenantRoot);
  }

  const inboxSrc = readFileSync(
    join(tenantRoot, "docs/protocol/inbox/seed-inbox.json"),
    "utf-8"
  );
  writeFileSync(
    join(tenantRoot, "docs/protocol/inbox", `${WIRE_CONSOLE_TEST_EVENT_ID}.json`),
    inboxSrc,
    "utf-8"
  );
  rmSync(join(tenantRoot, "docs/protocol/inbox/seed-inbox.json"), { force: true });

  setTenantId(WIRE_CONSOLE_TEST_TENANT);
  ensureProtocolSigningKey();
}
