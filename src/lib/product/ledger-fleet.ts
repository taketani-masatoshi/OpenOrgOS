import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from "node:fs";
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
import { findControlPlaneTenant } from "./ledger-control-plane.js";

const FLEET_DIR = "product-fleet";
const TENANT_ID_LOCK = ".tenant-id-allocation.lock";

function fleetDir(): string {
  return join(getWorkspaceRoot(), FLEET_DIR);
}

/** Serialize signup reservations and the final create check across processes. */
export function withLedgerTenantAllocationLock<T>(operation: () => T): T {
  mkdirSync(fleetDir(), { recursive: true });
  const lockPath = join(fleetDir(), TENANT_ID_LOCK);
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Tenant ID allocation is already in progress");
    }
    throw error;
  }
  try {
    return operation();
  } finally {
    rmdirSync(lockPath);
  }
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

/** A signup must never claim an existing tenant or a control-plane reservation. */
export function assertLedgerTenantIdUnoccupied(tenantId: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(tenantId)) {
    throw new Error(`Invalid tenant id "${tenantId}"`);
  }
  if (existsSync(join(getTenantsDir(), tenantId))) {
    throw new Error(`Tenant "${tenantId}" already exists`);
  }
  if (findControlPlaneTenant(tenantId)) {
    throw new Error(`Tenant "${tenantId}" is reserved in the control plane`);
  }
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
  return withLedgerTenantAllocationLock(() => {
    const file = loadSignupsFile();
    if (file.signups.some((row) => row.tenant_id === tenantId)) {
      throw new Error(`Signup already exists for tenant "${tenantId}"`);
    }
    assertLedgerTenantIdUnoccupied(tenantId);
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
  });
}

/** Resume only the same applicant while checkout has not completed. */
export function reserveOrResumeLedgerSignup(input: {
  tenantId: string;
  companyName: string;
  adminEmail: string;
  plan: LedgerSignup["plan"];
}): LedgerSignup {
  const tenantId = input.tenantId.trim().toLowerCase();
  return withLedgerTenantAllocationLock(() => {
    const file = loadSignupsFile();
    const existing = file.signups.find((row) => row.tenant_id === tenantId);
    if (existing) {
      if (
        existing.company_name !== input.companyName.trim() ||
        existing.admin_email !== input.adminEmail.trim().toLowerCase() ||
        existing.plan !== input.plan ||
        !["pending", "checkout"].includes(existing.status)
      ) {
        throw new Error(`Signup already exists for tenant "${tenantId}"`);
      }
      assertLedgerTenantIdUnoccupied(tenantId);
      return existing;
    }
    assertLedgerTenantIdUnoccupied(tenantId);
    const signup = ledgerSignupSchema.parse({
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
  });
}

export function updateLedgerSignup(
  signupId: string,
  patch: Partial<
    Pick<
      LedgerSignup,
      | "status"
      | "stripe_checkout_session_id"
      | "stripe_checkout_url"
      | "stripe_checkout_mode"
      | "stripe_customer_id"
      | "welcome_sent_at"
    >
  >,
): LedgerSignup {
  return withLedgerTenantAllocationLock(() => {
    const file = loadSignupsFile();
    const index = file.signups.findIndex((row) => row.signup_id === signupId);
    if (index < 0) throw new Error(`Signup not found: ${signupId}`);
    const next = ledgerSignupSchema.parse({ ...file.signups[index]!, ...patch });
    file.signups[index] = next;
    saveSignupsFile(file);
    return next;
  });
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
