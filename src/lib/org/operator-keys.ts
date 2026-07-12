import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readOperatorKeyFromFile } from "../console-auth/cli-operator.js";
import { isProdSecurityMode } from "../console-auth/operator-rbac.js";
import {
  findOperatorById,
  hashOperatorKey,
  loadOperatorRegistry,
  saveOperatorRegistry,
  verifyOperatorKey,
} from "./operators.js";

export interface OperatorKeyRepairResult {
  synced: string[];
  rotated: string[];
}

export function rotateOperatorKeyRecord(
  operatorId: string,
  opts?: { writeKey?: boolean }
): { keyPath?: string } {
  const reg = loadOperatorRegistry();
  if (!reg) throw new Error("operators.yaml not found — run orgos operator init-registry");
  const idx = reg.operators.findIndex((o) => o.operator_id === operatorId);
  if (idx < 0) throw new Error(`Operator ${operatorId} not found`);
  const key = randomBytes(24).toString("hex");
  reg.operators[idx] = { ...reg.operators[idx]!, key_hash: hashOperatorKey(key) };
  saveOperatorRegistry(reg);
  if (opts?.writeKey === false) return {};
  const keyPath = join(homedir(), ".orgos", "operators", `${operatorId}.key`);
  mkdirSync(join(homedir(), ".orgos", "operators"), { recursive: true });
  writeFileSync(keyPath, `${key}\n`, { mode: 0o600 });
  return { keyPath };
}

function listKeyRepairCandidates(): string[] {
  const registry = loadOperatorRegistry();
  if (!registry) return [];
  return registry.operators
    .filter((row) => row.status === "active" && (row.role === "ceo" || row.role === "approver"))
    .map((row) => row.operator_id);
}

export function syncAndRepairOperatorKeys(opts?: {
  allowRotate?: boolean;
}): OperatorKeyRepairResult {
  const synced: string[] = [];
  const rotated: string[] = [];
  const registry = loadOperatorRegistry();
  if (!registry) return { synced, rotated };

  let changed = false;
  for (const operator of registry.operators) {
    const key = readOperatorKeyFromFile(operator.operator_id);
    if (!key) continue;
    const nextHash = hashOperatorKey(key);
    if (operator.key_hash === nextHash) continue;
    operator.key_hash = nextHash;
    synced.push(operator.operator_id);
    changed = true;
  }
  if (changed) saveOperatorRegistry(registry);

  if (opts?.allowRotate === false || isProdSecurityMode()) {
    return { synced, rotated };
  }

  for (const operatorId of listKeyRepairCandidates()) {
    const key = readOperatorKeyFromFile(operatorId);
    const record = findOperatorById(operatorId);
    if (!record) continue;
    if (key && verifyOperatorKey(record.key_hash, key)) continue;
    rotateOperatorKeyRecord(operatorId);
    rotated.push(operatorId);
  }

  return { synced, rotated };
}

export function ensureOperatorAuthEnv(operatorId: string): {
  operatorId: string;
  repaired: OperatorKeyRepairResult;
} {
  process.env.STEWARD_OPERATOR_AUTH ??= "1";
  const repaired = syncAndRepairOperatorKeys({ allowRotate: true });
  const key = readOperatorKeyFromFile(operatorId);
  const record = findOperatorById(operatorId);
  if (!record) throw new Error(`Unknown operator_id "${operatorId}"`);
  if (!key || !verifyOperatorKey(record.key_hash, key)) {
    throw new Error(
      `Operator ${operatorId} key unavailable or mismatched — run: orgos doctor --tenant <id> --repair`
    );
  }
  process.env.ORGOS_OPERATOR_KEY = key;
  process.env.ORGOS_CLI_OPERATOR_ID = operatorId;
  return { operatorId, repaired };
}
