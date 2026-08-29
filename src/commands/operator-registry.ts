import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OperatorRecord, OperatorRegistry } from "../../schemas/org/operator.js";
import { loadOrgAuthorizedPersons } from "../lib/org/tenant-data.js";
import {
  hashOperatorKey,
  loadOperatorRegistry,
  saveOperatorRegistry,
} from "../lib/org/operators.js";
import { getTenantId } from "../lib/tenant.js";

function nextOperatorId(existing: OperatorRecord[]): string {
  const nums = existing
    .map((o) => /^OP-(\d+)$/.exec(o.operator_id)?.[1])
    .filter(Boolean)
    .map((n) => Number.parseInt(n!, 10));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `OP-${String(next).padStart(3, "0")}`;
}

export function runOperatorInitRegistry(opts: {
  writeKeys?: boolean;
  json?: boolean;
}): void {
  const existing = loadOperatorRegistry();
  if (existing?.operators.length) {
    console.log(`operators.yaml already exists (${existing.operators.length} operators)`);
    if (!opts.json) {
      console.log("Use orgos operator registry list to inspect, or delete file to re-init.");
    }
    return;
  }

  const persons = loadOrgAuthorizedPersons();
  const operators: OperatorRecord[] = [];
  const keys: Array<{ operator_id: string; key: string }> = [];

  const ceoKey = randomBytes(24).toString("hex");
  const ceoName = persons.representative?.split(/[、,]/)[0]?.trim() || "CEO";
  operators.push({
    operator_id: "OP-001",
    display_name: ceoName,
    seat_kind: "standard",
    role: "ceo",
    status: "active",
    approver_name: ceoName,
    key_hash: hashOperatorKey(ceoKey),
  });
  keys.push({ operator_id: "OP-001", key: ceoKey });

  const opKey = randomBytes(24).toString("hex");
  operators.push({
    operator_id: "OP-002",
    display_name: "秘書オペレータ",
    seat_kind: "standard",
    role: "operator",
    status: "active",
    key_hash: hashOperatorKey(opKey),
  });
  keys.push({ operator_id: "OP-002", key: opKey });

  for (const director of persons.directors.slice(0, 2)) {
    if (operators.some((o) => o.approver_name === director.name)) continue;
    const id = nextOperatorId(operators);
    const key = randomBytes(24).toString("hex");
    operators.push({
      operator_id: id,
      display_name: director.name,
      seat_kind: "standard",
      role: "approver",
      status: "active",
      approver_name: director.name,
      key_hash: hashOperatorKey(key),
    });
    keys.push({ operator_id: id, key });
  }

  const registry: OperatorRegistry = { version: "1", operators };
  const path = saveOperatorRegistry(registry);

  if (opts.json) {
    console.log(JSON.stringify({ path, tenant: getTenantId(), operators: operators.map((o) => o.operator_id) }, null, 2));
  } else {
    console.log(`✓ Operator registry initialized: ${path}`);
    console.log(`  Tenant: ${getTenantId()}`);
    console.log(`  Operators: ${operators.map((o) => `${o.operator_id} (${o.role})`).join(", ")}`);
  }

  if (opts.writeKeys !== false) {
    const keyDir = join(homedir(), ".orgos", "operators");
    mkdirSync(keyDir, { recursive: true });
    for (const { operator_id, key } of keys) {
      const keyPath = join(keyDir, `${operator_id}.key`);
      writeFileSync(keyPath, `${key}\n`, { mode: 0o600 });
      if (!opts.json) console.log(`  Key written: ${keyPath}`);
    }
    if (!opts.json) {
      console.log("\nUsage:");
      console.log(`  export ORGOS_OPERATOR_KEY="$(cat ~/.orgos/operators/OP-001.key)"`);
      console.log(`  orgos --operator-id OP-001 --tenant ${getTenantId()} escalate plan --text "..."`);
    }
  }
}

export function runOperatorRegistryList(opts: { json?: boolean }): void {
  const reg = loadOperatorRegistry();
  if (!reg) {
    console.log("No operators.yaml — run: orgos operator init-registry");
    process.exit(1);
  }
  const rows = reg.operators.map((o) => ({
    operator_id: o.operator_id,
    display_name: o.display_name,
    role: o.role,
    status: o.status,
    has_key: Boolean(o.key_hash),
    approver_name: o.approver_name,
  }));
  if (opts.json) {
    console.log(JSON.stringify({ tenant: getTenantId(), operators: rows }, null, 2));
    return;
  }
  console.log(`Operator registry (${getTenantId()}):`);
  for (const r of rows) {
    console.log(`  ${r.operator_id}  ${r.role.padEnd(10)}  ${r.status}  ${r.display_name}`);
  }
}

export function runOperatorRotateKey(opts: { operatorId: string; writeKey?: boolean }): void {
  const reg = loadOperatorRegistry();
  if (!reg) throw new Error("operators.yaml not found — run orgos operator init-registry");
  const idx = reg.operators.findIndex((o) => o.operator_id === opts.operatorId);
  if (idx < 0) throw new Error(`Operator ${opts.operatorId} not found`);
  const key = randomBytes(24).toString("hex");
  reg.operators[idx] = { ...reg.operators[idx]!, key_hash: hashOperatorKey(key) };
  saveOperatorRegistry(reg);
  console.log(`✓ Rotated key for ${opts.operatorId}`);
  if (opts.writeKey !== false) {
    const keyPath = join(homedir(), ".orgos", "operators", `${opts.operatorId}.key`);
    mkdirSync(join(homedir(), ".orgos", "operators"), { recursive: true });
    writeFileSync(keyPath, `${key}\n`, { mode: 0o600 });
    console.log(`  ${keyPath}`);
  }
}
