/**
 * permit-app intake CLI — モジュール有効化後の既取得申告 / APP 起動
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  permitApplicationRegistryFileSchema,
  type PermitApplicationEntry,
} from "../../../../../../schemas/jp-permit-registry.js";
import {
  attestExistingPermit,
  formatComplianceIntakePlan,
  persistIntakePlan,
  planComplianceIntake,
} from "../../../../../../src/lib/module-compliance-onboard.js";
import { getModuleDataDir } from "../../../../../../src/lib/module-business-data.js";
import { currentDate, writeYamlFile } from "../../../../../../src/lib/utils.js";
import { emitLicenseLifecycleEvent } from "../../../../../../src/lib/permit-license-events.js";

function applicationRegistryPath(): string {
  return join(getModuleDataDir("jp_permit_application"), "application-registry.yaml");
}

function loadApps() {
  const path = applicationRegistryPath();
  if (!existsSync(path)) return { as_of: currentDate(), applications: [] as PermitApplicationEntry[] };
  return permitApplicationRegistryFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

function nextAppId(type: string, property?: string): string {
  const existing = new Set(loadApps().applications.map((a) => a.id));
  const slug = type.replace(/^pt-/, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  const propPart = property ? `${property.replace(/^PROP-/, "P")}-` : "";
  let n = 1;
  let id = `APP-${propPart}${slug}-${String(n).padStart(3, "0")}`;
  while (existing.has(id)) {
    n += 1;
    id = `APP-${propPart}${slug}-${String(n).padStart(3, "0")}`;
  }
  return id;
}

export function runPermitAppIntakePlan(opts: {
  module: string;
  property?: string;
  write?: boolean;
  json?: boolean;
}): void {
  const plan = planComplianceIntake(opts.module, { propertyId: opts.property });
  if (opts.write) persistIntakePlan(plan);
  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(formatComplianceIntakePlan(plan));
  if (opts.write) {
    console.log(
      `\n✓ intake session: data/permit-applications/intake/${opts.module}.yaml`
    );
  }
}

export function runPermitAppIntakeAttest(opts: {
  module?: string;
  type: string;
  permitNumber: string;
  issuedOn: string;
  evidence: string;
  property?: string;
  issuer?: string;
  write?: boolean;
  json?: boolean;
}): void {
  try {
    const result = attestExistingPermit({
      moduleId: opts.module,
      permitTypeId: opts.type,
      permitNumber: opts.permitNumber,
      issuedOn: opts.issuedOn,
      evidencePath: opts.evidence,
      propertyId: opts.property,
      issuer: opts.issuer,
      write: opts.write,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`# 既取得申告 — ${opts.module ?? "catalog"}\n`);
    console.log(
      `permit: ${result.permit.id} · ${result.permit.permit_type_id} · ${result.permit.status}`
    );
    console.log(`number: ${opts.permitNumber} · issued: ${opts.issuedOn}`);
    if (result.evidence_logical) console.log(`evidence: ${result.evidence_logical}`);
    if (result.event_id) console.log(`event: ${result.event_id}`);
    if (!opts.write) {
      console.log("\n`--write` で PER active · PDF 複写 · INDEX · company-event");
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export function runPermitAppIntakeStartApp(opts: {
  module: string;
  type: string;
  property?: string;
  write?: boolean;
  json?: boolean;
}): void {
  const id = nextAppId(opts.type, opts.property);
  const app: PermitApplicationEntry = {
    id,
    permit_type_id: opts.type,
    status: "preparing",
    phase: "obtain",
    property_id: opts.property as PermitApplicationEntry["property_id"],
    docs_root: `docs/permit-applications/${id}/`,
    notes: `created via module compliance intake (${opts.module}) — 未取得・これから申請`,
  };

  if (opts.json) {
    console.log(JSON.stringify({ application: app }, null, 2));
    if (!opts.write) return;
  } else {
    console.log(`# 取得案件作成（intake）— ${app.id}\n`);
    console.log(`module: ${opts.module} · type: ${opts.type}`);
  }

  if (opts.write) {
    const data = loadApps();
    const path = applicationRegistryPath();
    mkdirSync(join(path, ".."), { recursive: true });
    writeYamlFile(path, {
      ...data,
      as_of: currentDate(),
      applications: [...data.applications, app],
    });
    emitLicenseLifecycleEvent({
      lifecycle: "LicenseApplicationStarted",
      applicationId: app.id,
      permitTypeId: app.permit_type_id,
      propertyId: app.property_id,
      phase: "obtain",
      notes: `intake start-app from module ${opts.module}`,
    });
    persistIntakePlan(planComplianceIntake(opts.module, { propertyId: opts.property }));
    console.log(`✓ ${path}`);
    console.log(`次: orgos operations permit-app prepare --application ${app.id} --write`);
  } else if (!opts.json) {
    console.log("\n`--write` で application-registry に保存");
  }
}
