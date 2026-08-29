import {
  collectStandingOperatorEmailEntries,
  loadOperatorRegistry,
  saveOperatorRegistry,
} from "../org/operators.js";
import {
  assertCanAddStandingHuman,
  assertFounderGrandfatherPolicy,
  assertFounderMigrationPolicy,
  findStandingOperatorEmailCollisions,
  isOooLoginEmailAllowedForRegistry,
  normalizeOooLoginEmailPolicy,
  operatorEmailRequiresLoginDomain,
  standingEntriesFromRegistry,
} from "../org/ooo-login-email.js";
import { getTenantLifecycleStatus } from "../org/tenant-lifecycle.js";
import { operatorRegistrySchema } from "../../../schemas/org/operator.js";
import { getTenantId } from "../tenant.js";
import { loadLedgerSubscription } from "./ledger-subscription.js";
import { listLedgerPlans } from "./ledger-plans.js";
import { buildLedgerUsageSnapshot } from "./ledger-usage.js";
import { loadJournalEntries } from "../finance/expense-claim-journal.js";
import { createBillingPortalSession } from "./stripe-checkout.js";

export type CustomerAdminSnapshot = {
  subscription: ReturnType<typeof loadLedgerSubscription>;
  plans: ReturnType<typeof listLedgerPlans>;
  operators: Array<{
    operator_id: string;
    display_name: string;
    role: string;
    email?: string;
    status: string;
    guest_expires_at?: string;
    guest_expired?: boolean;
  }>;
  usage: ReturnType<typeof buildLedgerUsageSnapshot> & {
    journal_entries: number;
  };
  billing_portal_url: string | null;
  billing_portal_mode: "live" | "stub" | null;
  invite_policy: CustomerAdminInvitePolicy;
};

export type CustomerAdminInvitePolicy = {
  email_domains: string[];
  founder_migration_status: string | null;
  grace_until: string | null;
  grace_days_remaining: number | null;
  grandfather_active: boolean;
  standing_invite_blocked: boolean;
  standing_invite_block_reason: string | null;
  tenant_lifecycle: string;
  guest_invite_allowed: boolean;
  migration_warnings: string[];
};

export function buildCustomerAdminInvitePolicy(): CustomerAdminInvitePolicy {
  const registry = loadOperatorRegistry() ?? operatorRegistrySchema.parse({ version: "1", operators: [] });
  const policy = normalizeOooLoginEmailPolicy(registry.login_policy);
  const migration = registry.login_policy?.founder_migration;
  const lifecycle = getTenantLifecycleStatus();
  const standingBlock = assertCanAddStandingHuman(registry);
  const migrationIssues = assertFounderMigrationPolicy(registry);

  let graceDaysRemaining: number | null = null;
  const graceUntil = migration?.grace_until?.trim();
  if (graceUntil) {
    const end = Date.parse(graceUntil);
    if (!Number.isNaN(end)) {
      graceDaysRemaining = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
    }
  }

  let standingInviteBlocked = Boolean(standingBlock);
  let standingInviteBlockReason = standingBlock?.message ?? null;
  if (lifecycle === "archived" || lifecycle === "purged") {
    standingInviteBlocked = true;
    standingInviteBlockReason = "tenant lifecycle archived — standing operator invite blocked";
  } else if (lifecycle === "winding_down") {
    standingInviteBlocked = true;
    standingInviteBlockReason = "tenant lifecycle winding_down — standing operator invite blocked";
  }

  return {
    email_domains: policy.email_domains,
    founder_migration_status: migration?.status ?? null,
    grace_until: graceUntil ?? null,
    grace_days_remaining: graceDaysRemaining,
    grandfather_active: policy.grandfather_emails.length > 0,
    standing_invite_blocked: standingInviteBlocked,
    standing_invite_block_reason: standingInviteBlockReason,
    tenant_lifecycle: lifecycle,
    guest_invite_allowed: lifecycle !== "archived" && lifecycle !== "purged",
    migration_warnings: migrationIssues.map((i) => i.message),
  };
}

function isGuestExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  return Date.parse(expiresAt) < Date.now();
}

export async function buildCustomerAdminSnapshot(
  returnUrl = "http://localhost:9470/?account=1",
): Promise<CustomerAdminSnapshot> {
  const registry = loadOperatorRegistry();
  const entries = loadJournalEntries().entries;
  const usage = buildLedgerUsageSnapshot();
  const sub = loadLedgerSubscription();

  let billingPortalUrl: string | null = null;
  let billingPortalMode: "live" | "stub" | null = null;
  if (sub?.stripe_customer_id) {
    try {
      const session = await createBillingPortalSession({
        customerId: sub.stripe_customer_id,
        returnUrl,
      });
      billingPortalUrl = session.url;
      billingPortalMode = session.mode;
    } catch {
      billingPortalUrl = null;
      billingPortalMode = null;
    }
  }

  return {
    subscription: sub,
    plans: listLedgerPlans(),
    operators:
      registry?.operators.map((op) => ({
        operator_id: op.operator_id,
        display_name: op.display_name,
        role: op.role,
        email: op.email,
        status: op.status,
        guest_expires_at: op.guest_expires_at,
        guest_expired: isGuestExpired(op.guest_expires_at),
      })) ?? [],
    usage: {
      ...usage,
      journal_entries: entries.length,
    },
    billing_portal_url: billingPortalUrl,
    billing_portal_mode: billingPortalMode,
    invite_policy: buildCustomerAdminInvitePolicy(),
  };
}

export function inviteLedgerOperator(input: {
  displayName: string;
  email: string;
  role: "operator" | "readonly" | "approver";
  guestExpiresAt?: string;
}): { operator_id: string } {
  const email = input.email.trim().toLowerCase();
  const isGuest = Boolean(input.guestExpiresAt?.trim());
  const lifecycle = getTenantLifecycleStatus();
  if (lifecycle === "archived" || lifecycle === "purged") {
    throw new Error("tenant lifecycle archived — standing operator invite blocked");
  }
  if (!isGuest && lifecycle === "winding_down") {
    throw new Error("tenant lifecycle winding_down — standing operator invite blocked");
  }

  const registry = loadOperatorRegistry() ??
    operatorRegistrySchema.parse({ version: "1", operators: [] });

  const requiresDomain = operatorEmailRequiresLoginDomain({
    role: input.role,
    guest_expires_at: input.guestExpiresAt,
  });

  if (requiresDomain && !isOooLoginEmailAllowedForRegistry(email, registry)) {
    throw new Error("operator email is outside login_policy.email_domains");
  }
  const baseId = input.email
    .split("@")[0]!
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  let operatorId = `OP-${baseId || "INVITE"}`;
  let suffix = 1;
  while (registry.operators.some((op) => op.operator_id === operatorId)) {
    operatorId = `OP-${baseId || "INVITE"}-${suffix++}`;
  }

  const candidate = {
    operator_id: operatorId,
    display_name: input.displayName.trim(),
    approver_name: input.displayName.trim(),
    role: input.role,
    status: "active" as const,
    email,
    guest_expires_at: input.guestExpiresAt,
    permissions:
      input.role === "approver"
        ? (["chat:read", "chat:ask", "chat:approve", "finance:reconcile"] as const)
        : input.role === "operator"
          ? (["chat:read", "chat:ask", "finance:reconcile"] as const)
          : (["chat:read", "audit:read"] as const),
  };

  const nextRegistry = operatorRegistrySchema.parse({
    ...registry,
    operators: [...registry.operators, candidate],
  });

  if (!isGuest) {
    const grandfatherBlock = assertCanAddStandingHuman(nextRegistry);
    if (grandfatherBlock) {
      throw new Error(grandfatherBlock.message);
    }
    const founderIssues = assertFounderGrandfatherPolicy(nextRegistry);
    if (founderIssues.length > 0) {
      throw new Error(founderIssues[0]!.message);
    }

    const tenantId = getTenantId();
    const entries = [
      ...collectStandingOperatorEmailEntries().filter((e) => e.tenantId !== tenantId),
      ...standingEntriesFromRegistry(tenantId, nextRegistry),
    ];
    const collisions = findStandingOperatorEmailCollisions(entries);
    if (collisions.some((c) => c.email === email)) {
      throw new Error(
        "standing operator email is already used on another tenant — use a company-domain or guest seat",
      );
    }
  }

  saveOperatorRegistry(nextRegistry);
  return { operator_id: operatorId };
}

export function isOperatorGuestExpired(
  guestExpiresAt: string | undefined,
): boolean {
  return isGuestExpired(guestExpiresAt);
}
