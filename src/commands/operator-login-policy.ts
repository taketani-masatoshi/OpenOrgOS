import { operatorRegistrySchema } from "../../schemas/org/operator.js";
import {
  addDaysIso,
  assertFounderMigrationPolicy,
  FOUNDER_MIGRATION_GRACE_DAYS,
  isCompanyDomainEmail,
  normalizeOooLoginEmailPolicy,
  normalizeOooEmail,
} from "../lib/org/ooo-login-email.js";
import { loadOperatorRegistry, saveOperatorRegistry } from "../lib/org/operators.js";
import { getTenantId } from "../lib/tenant.js";

function requireRegistry() {
  const reg = loadOperatorRegistry();
  if (!reg) throw new Error("operators.yaml not found — run orgos operator init-registry");
  return reg;
}

export function runOperatorLoginDomainSet(opts: { domain: string; json?: boolean }): void {
  const reg = requireRegistry();
  const domain = opts.domain.trim().toLowerCase().replace(/^\./, "");
  if (!domain) throw new Error("--domain is required");

  const existing = (reg.login_policy?.email_domains ?? [])
    .map((d) => d.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
  const domains = [...new Set([...existing, domain])];

  const grandfather = (reg.login_policy?.grandfather_emails ?? []).map((e) =>
    normalizeOooEmail(e),
  );
  const hadDomains = existing.length > 0;
  let founder_migration = reg.login_policy?.founder_migration;

  if (!hadDomains && grandfather.length > 0 && !founder_migration) {
    founder_migration = {
      status: "open",
      grace_until: addDaysIso(new Date(), FOUNDER_MIGRATION_GRACE_DAYS),
    };
  }

  const login_policy = {
    ...reg.login_policy,
    email_domains: domains,
    grandfather_emails: reg.login_policy?.grandfather_emails ?? [],
    founder_migration,
  };

  const next = operatorRegistrySchema.parse({ ...reg, login_policy });
  const path = saveOperatorRegistry(next);

  const out = {
    tenant: getTenantId(),
    path,
    email_domains: domains,
    founder_migration,
  };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`✓ login_policy.email_domains updated (${path})`);
  console.log(`  domains: ${domains.join(", ")}`);
  if (founder_migration) {
    console.log(
      `  founder_migration: ${founder_migration.status}${founder_migration.grace_until ? ` until ${founder_migration.grace_until}` : ""}`,
    );
  }
}

export function runOperatorFounderEmailRetire(opts: { json?: boolean }): void {
  const reg = requireRegistry();
  const policy = normalizeOooLoginEmailPolicy(reg.login_policy);
  if (policy.grandfather_emails.length === 0) {
    throw new Error("login_policy.grandfather_emails is already empty");
  }
  if (policy.email_domains.length === 0) {
    throw new Error("login_policy.email_domains must be set before retiring grandfather email");
  }

  const ceo = reg.operators.find((o) => o.status === "active" && o.role === "ceo" && o.email?.trim());
  if (!ceo?.email) {
    throw new Error("active ceo with email required before retiring grandfather");
  }
  if (!isCompanyDomainEmail(ceo.email, policy.email_domains)) {
    throw new Error(
      "ceo email must be on a company domain before retiring grandfather — update ceo email first",
    );
  }

  const closedAt = new Date().toISOString().slice(0, 10);
  const login_policy = {
    ...reg.login_policy,
    email_domains: policy.email_domains,
    grandfather_emails: [] as string[],
    founder_migration: {
      status: "closed" as const,
      closed_at: closedAt,
      grace_until: reg.login_policy?.founder_migration?.grace_until,
    },
  };

  const next = operatorRegistrySchema.parse({ ...reg, login_policy });
  const path = saveOperatorRegistry(next);

  const out = {
    tenant: getTenantId(),
    path,
    founder_migration: login_policy.founder_migration,
    ceo_operator_id: ceo.operator_id,
  };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`✓ founder grandfather email retired (${path})`);
  console.log(`  ceo: ${ceo.operator_id} (company domain verified)`);
  console.log(`  founder_migration.status: closed (${closedAt})`);
}

export function runOperatorFounderEmailStatus(opts: { json?: boolean }): void {
  const reg = requireRegistry();
  const policy = normalizeOooLoginEmailPolicy(reg.login_policy);
  const migration = reg.login_policy?.founder_migration;
  const migrationIssues = assertFounderMigrationPolicy(reg);

  const out = {
    tenant: getTenantId(),
    email_domains: policy.email_domains,
    grandfather_emails: policy.grandfather_emails,
    founder_migration: migration ?? null,
    migration_issues: migrationIssues,
  };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`Founder email migration (${getTenantId()}):`);
  console.log(`  email_domains: ${policy.email_domains.join(", ") || "(none)"}`);
  console.log(
    `  grandfather_emails: ${policy.grandfather_emails.join(", ") || "(none)"}`,
  );
  if (migration) {
    console.log(
      `  founder_migration: ${migration.status}${migration.grace_until ? ` grace_until=${migration.grace_until}` : ""}${migration.closed_at ? ` closed_at=${migration.closed_at}` : ""}`,
    );
  } else {
    console.log("  founder_migration: (not set)");
  }
  for (const issue of migrationIssues) {
    console.log(`  ⚠ ${issue.message}`);
  }
}
