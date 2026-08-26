import type {
  FounderMigration,
  OperatorLoginPolicy,
  OperatorRecord,
  OperatorRegistry,
  OperatorRole,
} from "../../../schemas/org/operator.js";

export type OooLoginEmailPolicy = {
  email_domains: string[];
  grandfather_emails: string[];
};

export type FounderGrandfatherIssue = {
  code:
    | "grandfather_too_many"
    | "grandfather_not_ceo"
    | "personal_not_founder"
    | "second_human_without_domain"
    | "grandfather_blocks_second_human";
  operator_id?: string;
  message: string;
};

export type FounderMigrationIssue = {
  code: "grace_expired" | "closed_with_grandfather";
  message: string;
};

export type StandingOperatorEmailEntry = {
  tenantId: string;
  operator_id: string;
  email: string;
  role: OperatorRole;
  status: string;
  guest: boolean;
};

export type StandingOperatorEmailCollision = {
  /** Present for tests only — callers must not log or persist into tracked summaries. */
  email: string;
  seats: Array<{ tenantId: string; operator_id: string }>;
};

const DOMAIN_CHECKED_ROLES = new Set([
  "ceo",
  "approver",
  "operator",
  "readonly",
  "auditor",
]);

export function normalizeOooEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function oooEmailDomain(email: string): string | undefined {
  const norm = normalizeOooEmail(email);
  const at = norm.lastIndexOf("@");
  if (at <= 0 || at === norm.length - 1) return undefined;
  return norm.slice(at + 1);
}

export function normalizeOooLoginEmailPolicy(
  policy: OperatorLoginPolicy | OooLoginEmailPolicy | undefined,
): OooLoginEmailPolicy {
  return {
    email_domains: (policy?.email_domains ?? [])
      .map((d) => d.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean),
    grandfather_emails: (policy?.grandfather_emails ?? [])
      .map((e) => normalizeOooEmail(e))
      .filter((e) => e.includes("@"))
      .slice(0, 1),
  };
}

/** Personal addresses stay only when listed in grandfather_emails (or domains unset). */
export function isOooLoginEmailAllowed(
  email: string,
  policy: OooLoginEmailPolicy,
): boolean {
  const norm = normalizeOooEmail(email);
  if (!norm.includes("@")) return false;
  if (policy.grandfather_emails.includes(norm)) return true;
  if (policy.email_domains.length === 0) return true;
  return isCompanyDomainEmail(norm, policy.email_domains);
}

export function getFounderMigration(registry: OperatorRegistry): FounderMigration | undefined {
  return registry.login_policy?.founder_migration;
}

/** Grandfather personal email is SSO-eligible only while migration is open and grace has not expired. */
export function isGrandfatherEmailEffective(
  registry: OperatorRegistry,
  email: string,
): boolean {
  const norm = normalizeOooEmail(email);
  const policy = normalizeOooLoginEmailPolicy(registry.login_policy);
  if (!policy.grandfather_emails.includes(norm)) return false;
  const migration = getFounderMigration(registry);
  if (migration?.status === "closed") return false;
  const graceUntil = migration?.grace_until?.trim();
  if (graceUntil) {
    const end = Date.parse(graceUntil);
    if (!Number.isNaN(end) && end < Date.now()) return false;
  }
  return true;
}

/** Registry-aware login email check (respects founder_migration grace / closed). */
export function isOooLoginEmailAllowedForRegistry(
  email: string,
  registry: OperatorRegistry,
): boolean {
  const norm = normalizeOooEmail(email);
  if (!norm.includes("@")) return false;
  if (isGrandfatherEmailEffective(registry, norm)) return true;
  const policy = normalizeOooLoginEmailPolicy(registry.login_policy);
  if (policy.email_domains.length === 0) return true;
  return isCompanyDomainEmail(norm, policy.email_domains);
}

export function assertFounderMigrationPolicy(
  registry: OperatorRegistry,
): FounderMigrationIssue[] {
  const policy = normalizeOooLoginEmailPolicy(registry.login_policy);
  const issues: FounderMigrationIssue[] = [];
  if (policy.grandfather_emails.length === 0) return issues;

  const migration = getFounderMigration(registry);
  if (migration?.status === "closed") {
    issues.push({
      code: "closed_with_grandfather",
      message:
        "login_policy.grandfather_emails must be empty when founder_migration.status is closed",
    });
  }

  const graceUntil = migration?.grace_until?.trim();
  if (graceUntil) {
    const end = Date.parse(graceUntil);
    if (!Number.isNaN(end) && end < Date.now()) {
      issues.push({
        code: "grace_expired",
        message:
          "founder_migration grace period expired — retire grandfather email (orgos operator founder-email retire)",
      });
    }
  }
  return issues;
}

/** Block adding another standing human while founder grandfather email remains listed. */
export function assertCanAddStandingHuman(
  registry: OperatorRegistry,
): FounderGrandfatherIssue | null {
  const policy = normalizeOooLoginEmailPolicy(registry.login_policy);
  if (policy.grandfather_emails.length === 0) return null;
  const standingCount = registry.operators.filter((o) => isStandingHumanOperator(o)).length;
  if (standingCount >= 1) {
    return {
      code: "grandfather_blocks_second_human",
      message:
        "login_policy.grandfather_emails must be retired before adding another standing human operator",
    };
  }
  return null;
}

export function addDaysIso(date: Date, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const FOUNDER_MIGRATION_GRACE_DAYS = 90;

export function operatorEmailRequiresLoginDomain(
  op: Pick<OperatorRecord, "role" | "guest_expires_at">,
): boolean {
  if (op.role === "mcp_service") return false;
  if (op.guest_expires_at?.trim()) return false;
  return DOMAIN_CHECKED_ROLES.has(op.role);
}

export function isStandingHumanOperator(
  op: Pick<OperatorRecord, "role" | "status" | "guest_expires_at" | "email">,
): boolean {
  if (op.status !== "active") return false;
  if (!op.email?.trim()) return false;
  return operatorEmailRequiresLoginDomain(op);
}

export function isCompanyDomainEmail(email: string, domains: string[]): boolean {
  if (domains.length === 0) return false;
  const domain = oooEmailDomain(email);
  if (!domain) return false;
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

/**
 * Founder seat rules (pure):
 * - grandfather_emails at most one, and must match active ceo email
 * - personal (non-company) standing emails only for that founder ceo seat
 * - two+ standing human emails require email_domains
 */
export function assertFounderGrandfatherPolicy(
  registry: OperatorRegistry,
): FounderGrandfatherIssue[] {
  const rawGrandfather = (registry.login_policy?.grandfather_emails ?? []).map((e) =>
    normalizeOooEmail(e),
  );
  const policy = normalizeOooLoginEmailPolicy(registry.login_policy);
  const issues: FounderGrandfatherIssue[] = [];

  if (rawGrandfather.length > 1) {
    issues.push({
      code: "grandfather_too_many",
      message:
        "login_policy.grandfather_emails allows at most one founder personal email",
    });
  }

  const activeCeos = registry.operators.filter(
    (o) => o.status === "active" && o.role === "ceo" && o.email?.trim(),
  );
  const ceoEmails = new Set(activeCeos.map((o) => normalizeOooEmail(o.email!)));

  for (const gf of policy.grandfather_emails) {
    if (!ceoEmails.has(gf)) {
      issues.push({
        code: "grandfather_not_ceo",
        operator_id: activeCeos[0]?.operator_id,
        message:
          "login_policy.grandfather_emails must match an active ceo operator email",
      });
    }
  }

  const standing = registry.operators.filter((o) => isStandingHumanOperator(o));
  const standingEmails = standing.map((o) => ({
    operator_id: o.operator_id,
    email: normalizeOooEmail(o.email!),
    role: o.role,
  }));

  if (policy.email_domains.length === 0 && standingEmails.length >= 2) {
    issues.push({
      code: "second_human_without_domain",
      message:
        "second standing human operator requires login_policy.email_domains (company domain before adding humans)",
    });
  }

  if (policy.email_domains.length === 0) {
    return issues;
  }

  const founderEmail = policy.grandfather_emails[0];
  for (const seat of standingEmails) {
    if (isCompanyDomainEmail(seat.email, policy.email_domains)) continue;
    if (founderEmail && seat.email === founderEmail && seat.role === "ceo") continue;
    issues.push({
      code: "personal_not_founder",
      operator_id: seat.operator_id,
      message: `Operator ${seat.operator_id} email is outside login_policy.email_domains (only the active ceo may use grandfather_emails)`,
    });
  }

  return issues;
}

export function listOperatorEmailsOutsideLoginPolicy(
  registry: OperatorRegistry,
): Array<{ operator_id: string; reason: "domain" | FounderGrandfatherIssue["code"] }> {
  const out: Array<{
    operator_id: string;
    reason: "domain" | FounderGrandfatherIssue["code"];
  }> = [];

  for (const issue of assertFounderGrandfatherPolicy(registry)) {
    if (issue.code === "personal_not_founder" && issue.operator_id) {
      out.push({ operator_id: issue.operator_id, reason: issue.code });
    }
  }

  const policy = normalizeOooLoginEmailPolicy(registry.login_policy);
  if (policy.email_domains.length === 0) return out;

  for (const op of registry.operators) {
    if (!isStandingHumanOperator(op)) continue;
    if (!isOooLoginEmailAllowedForRegistry(op.email!, registry)) {
      if (!out.some((r) => r.operator_id === op.operator_id)) {
        out.push({ operator_id: op.operator_id, reason: "domain" });
      }
    }
  }
  return out;
}

/** Same email must not be a standing operator on multiple tenants. Guests are excluded. */
export function findStandingOperatorEmailCollisions(
  entries: StandingOperatorEmailEntry[],
): StandingOperatorEmailCollision[] {
  const byEmail = new Map<string, Array<{ tenantId: string; operator_id: string }>>();

  for (const entry of entries) {
    if (entry.status !== "active") continue;
    if (entry.guest) continue;
    if (entry.role === "mcp_service") continue;
    if (!DOMAIN_CHECKED_ROLES.has(entry.role)) continue;
    const email = normalizeOooEmail(entry.email);
    if (!email.includes("@")) continue;

    const seats = byEmail.get(email) ?? [];
    if (!seats.some((s) => s.tenantId === entry.tenantId && s.operator_id === entry.operator_id)) {
      seats.push({ tenantId: entry.tenantId, operator_id: entry.operator_id });
    }
    byEmail.set(email, seats);
  }

  const collisions: StandingOperatorEmailCollision[] = [];
  for (const [email, seats] of byEmail) {
    const tenants = new Set(seats.map((s) => s.tenantId));
    if (tenants.size >= 2) {
      collisions.push({ email, seats });
    }
  }
  return collisions.sort((a, b) => a.email.localeCompare(b.email));
}

export function standingEntriesFromRegistry(
  tenantId: string,
  registry: OperatorRegistry,
): StandingOperatorEmailEntry[] {
  return registry.operators
    .filter((o) => o.email?.trim())
    .map((o) => ({
      tenantId,
      operator_id: o.operator_id,
      email: o.email!,
      role: o.role,
      status: o.status,
      guest: Boolean(o.guest_expires_at?.trim()),
    }));
}
