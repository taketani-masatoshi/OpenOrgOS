import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  ledgerSignupsFileSchema,
  ledgerSignupSchema,
  type LedgerSignup,
  type LedgerSignupStatus,
} from "../../../schemas/product/ledger-product.js";
import { getWorkspaceRoot, getTenantsDir } from "../orgos-paths.js";
import { getClock } from "../runtime-context.js";
import { listLedgerProductTenantIds } from "./ledger-product-tenant.js";

const FLEET_DIR = "product-fleet";

function fleetDir(): string {
  return join(getWorkspaceRoot(), FLEET_DIR);
}

function signupsPath(): string {
  return join(fleetDir(), "signups.yaml");
}

function loadSignupsFile() {
  const path = signupsPath();
  if (!existsSync(path)) {
    return ledgerSignupsFileSchema.parse({ version: 1, signups: [] });
  }
  return ledgerSignupsFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

function saveSignupsFile(file: ReturnType<typeof loadSignupsFile>): void {
  mkdirSync(fleetDir(), { recursive: true });
  writeFileSync(signupsPath(), YAML.stringify(file), "utf-8");
}

export function listLedgerSignups(): LedgerSignup[] {
  return loadSignupsFile().signups;
}

export function findLedgerSignup(signupId: string): LedgerSignup | undefined {
  return listLedgerSignups().find((row) => row.signup_id === signupId);
}

export function createLedgerSignup(input: {
  tenantId: string;
  companyName: string;
  adminEmail: string;
  plan: LedgerSignup["plan"];
}): LedgerSignup {
  const tenantId = input.tenantId.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(tenantId)) {
    throw new Error(`Invalid tenant id "${tenantId}"`);
  }
  const file = loadSignupsFile();
  if (file.signups.some((row) => row.tenant_id === tenantId)) {
    throw new Error(`Signup already exists for tenant "${tenantId}"`);
  }
  const signup: LedgerSignup = ledgerSignupSchema.parse({
    signup_id: `SIGNUP-${tenantId}`,
    tenant_id: tenantId,
    company_name: input.companyName.trim(),
    admin_email: input.adminEmail.trim().toLowerCase(),
    plan: input.plan,
    status: "pending",
    created_at: getClock().now().toISOString(),
  });
  file.signups.push(signup);
  saveSignupsFile(file);
  return signup;
}

export function updateLedgerSignup(
  signupId: string,
  patch: Partial<
    Pick<
      LedgerSignup,
      | "status"
      | "stripe_checkout_session_id"
      | "stripe_customer_id"
    >
  >,
): LedgerSignup {
  const file = loadSignupsFile();
  const index = file.signups.findIndex((row) => row.signup_id === signupId);
  if (index < 0) throw new Error(`Signup not found: ${signupId}`);
  const next = ledgerSignupSchema.parse({ ...file.signups[index]!, ...patch });
  file.signups[index] = next;
  saveSignupsFile(file);
  return next;
}

export function setLedgerSignupStatus(
  signupId: string,
  status: LedgerSignupStatus,
): LedgerSignup {
  return updateLedgerSignup(signupId, { status });
}

export type FleetTenantStatus = {
  tenant_id: string;
  company_name: string;
  subscription_status: string | null;
  plan: string | null;
  signup_status: string | null;
};

export function listFleetTenantStatus(opts?: {
  productOnly?: boolean;
}): FleetTenantStatus[] {
  const productIds = opts?.productOnly ? new Set(listLedgerProductTenantIds()) : null;
  const tenantsDir = getTenantsDir();
  if (!existsSync(tenantsDir)) return [];
  const signups = listLedgerSignups();
  const rows: FleetTenantStatus[] = [];

  for (const entry of readdirSync(tenantsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    if (productIds && !productIds.has(entry.name)) continue;
    const tenantYaml = join(tenantsDir, entry.name, "tenant.yaml");
    if (!existsSync(tenantYaml)) continue;
    const signup = signups.find((row) => row.tenant_id === entry.name);
    let companyName = entry.name;
    try {
      const raw = readFileSync(tenantYaml, "utf-8");
      const match = raw.match(/^name:\s*(.+)$/m);
      if (match?.[1]) companyName = match[1].trim();
    } catch {
      /* ignore */
    }
    const subPath = join(tenantsDir, entry.name, "data/product/subscription.yaml");
    let subscriptionStatus: string | null = null;
    let plan: string | null = null;
    if (existsSync(subPath)) {
      try {
        const sub = YAML.parse(readFileSync(subPath, "utf-8")) as {
          status?: string;
          plan?: string;
        };
        subscriptionStatus = sub.status ?? null;
        plan = sub.plan ?? null;
      } catch {
        /* ignore */
      }
    }
    rows.push({
      tenant_id: entry.name,
      company_name: companyName,
      subscription_status: subscriptionStatus,
      plan,
      signup_status: signup?.status ?? null,
    });
  }

  return rows.sort((a, b) => a.tenant_id.localeCompare(b.tenant_id));
}
