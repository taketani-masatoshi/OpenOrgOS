import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { currentDate } from "./utils.js";

export interface TenantScaffoldResult {
  created: string[];
  skipped: string[];
}

function writeScaffoldFile(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

/** Standard executive SoT skeleton — all tenants (tenant-init · setup-wizard · scaffold-data). */
export function seedExecutiveYamlFromExamples(
  dataDir: string,
  skipExisting?: boolean,
  result?: TenantScaffoldResult
): void {
  const execDir = join(dataDir, "executive");
  mkdirSync(execDir, { recursive: true });
  const bases = ["calendar", "tasks", "one-on-ones", "external-contacts", "stakeholders"];
  for (const base of bases) {
    const example = join(execDir, `${base}.yaml.example`);
    const target = join(execDir, `${base}.yaml`);
    const rel = `data/executive/${base}.yaml`;
    if (skipExisting && existsSync(target)) {
      result?.skipped.push(rel);
      continue;
    }
    if (existsSync(example)) {
      cpSync(example, target);
      result?.created.push(rel);
      continue;
    }
    const empty: Record<string, string> = {
      calendar: "events: []\n",
      tasks: "tasks: []\n",
      "one-on-ones": "one_on_ones: []\n",
      "external-contacts": "contacts: []\n",
      stakeholders: "stakeholders: []\n",
    };
    writeScaffoldFile(target, empty[base] ?? "notes: |\n  skeleton\n");
    result?.created.push(rel);
  }
}

/** Protocol peer registry skeleton — Secretary contact gate (§2.8.1). */
export function seedProtocolYamlFromExamples(
  dataDir: string,
  skipExisting?: boolean,
  result?: TenantScaffoldResult
): void {
  const protocolDir = join(dataDir, "protocol");
  mkdirSync(protocolDir, { recursive: true });
  const example = join(protocolDir, "peers.yaml.example");
  const target = join(protocolDir, "peers.yaml");
  const rel = "data/protocol/peers.yaml";
  if (skipExisting && existsSync(target)) {
    result?.skipped.push(rel);
    return;
  }
  if (existsSync(example)) {
    cpSync(example, target);
    result?.created.push(rel);
    return;
  }
  writeScaffoldFile(target, `as_of: "${currentDate()}"\npeers: []\n`);
  result?.created.push(rel);
}
