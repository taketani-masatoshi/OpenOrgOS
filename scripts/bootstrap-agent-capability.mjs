#!/usr/bin/env node
/**
 * Generates agent-capability-manifest.yaml and _template seed stubs.
 * Run: node scripts/bootstrap-agent-capability.mjs
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import YAML from "yaml";

const ROOT = join(import.meta.dirname, "..");

const ENTRIES = [
  ["executive_steward", "executive-steward", [], ["docs/reports/dashboard/", "docs/reports/executive-notes/"], ["executive-daily"], ["executive_dashboard", "daily_ops", "p0_closing"]],
  ["secretary", "secretary", ["data/executive/"], ["docs/executive/"], ["secretary-schedule", "secretary-one-on-one", "secretary-correspondence"], ["schedule_management", "one_on_one_prep", "external_correspondence"]],
  ["finance", "finance", ["data/finance/", "data/plans/"], ["docs/plans/", "docs/finance/"], ["monthly-close", "finance-variance"], ["monthly_close", "cashflow_forecast", "variance_analysis", "capex_planning"]],
  ["contract", "contract", ["data/contracts/"], ["docs/contracts/"], ["contract-expiry"], ["contract_expiry_check", "contract_register"]],
  ["compliance", "compliance", ["data/compliance/"], ["docs/compliance/", "docs/company/regulations/", "docs/company/licenses/"], ["compliance-permit", "compliance-controls"], ["permit_expiry_check", "iso_control_review"]],
  ["operations", "operations", ["data/document-io.yaml"], ["docs/io/"], ["travel-booking"], ["operations_records"]],
  ["coo", "coo", [], ["docs/reports/routing-queue/", "docs/reports/agent-summaries/"], ["coo-work-order"], []],
  ["cto", "cto", [], ["docs/engineering/"], ["cto-architecture"], []],
  ["engineering", "engineering", [], ["docs/engineering/"], ["engineering-code"], []],
  ["design_lead", "design-lead", [], ["docs/design/"], ["design-lead-review"], []],
  ["design", "design", [], ["docs/design/assets/"], ["design-assets"], []],
  ["sales_lead", "sales-lead", ["data/sales/"], ["docs/sales/"], ["sales-pipeline"], []],
  ["sales_outbound", "sales-outbound", ["data/sales/outbound/"], ["docs/sales/outbound/"], ["sales-outbound"], []],
  ["sales_inbound", "sales-inbound", ["data/sales/inbound/"], ["docs/sales/inbound/"], ["sales-inbound"], []],
  ["customer_success", "customer-success", ["data/customers/"], ["docs/customers/"], ["customer-success"], []],
  ["marketing_lead", "marketing-lead", ["data/marketing/"], ["docs/marketing/"], ["marketing-content"], []],
  ["social_media", "social-media", ["data/marketing/social/"], ["docs/marketing/social/"], ["social-post"], []],
  ["personal_finance", "personal-finance", ["data/personal-finance/"], ["docs/personal-finance/"], ["personal-finance"], []],
  ["legal", "legal", ["data/legal/"], ["docs/legal/"], ["legal-teikan"], []],
  ["security", "security", ["data/classification-registry.yaml"], ["docs/compliance/privacy/"], ["security-audit"], []],
  ["human_resources", "human-resources", ["data/hr/"], ["docs/company/hr/"], ["hr-labor"], []],
  ["corporate_governance", "corporate-governance", ["data/governance/"], ["docs/company/governance/"], ["corporate-meetings"], []],
  ["accounting", "accounting", ["data/finance/invoices/"], ["docs/finance/accounting/"], ["accounting-ops"], ["monthly_close"]],
  ["tax", "tax", ["data/finance/tax/"], ["docs/company/tax/"], ["tax-filing"], ["tax_filing_prep"]],
  ["procurement", "procurement", ["data/procurement/"], ["docs/procurement/"], ["procurement-order"], []],
  ["government_affairs", "government-affairs", ["data/government/"], ["docs/government/"], ["subsidy-government"], []],
  ["intellectual_property", "intellectual-property", ["data/ip/"], ["docs/ip/"], ["ip-trademark"], []],
  ["general_affairs", "general-affairs", ["data/general-affairs/"], ["docs/general-affairs/"], ["general-affairs"], []],
  ["project_management", "project-management", ["data/projects/"], ["docs/projects/"], ["pmo-project"], []],
  ["product_management", "product-management", ["data/product/"], ["docs/product/"], ["product-roadmap"], []],
  ["recruiting", "recruiting", ["data/recruiting/"], ["docs/recruiting/"], ["recruiting-pipeline"], []],
  ["risk_insurance", "risk-insurance", ["data/risk/"], ["docs/risk/"], ["risk-insurance"], []],
  ["data_analytics", "data-analytics", ["data/analytics/"], ["docs/analytics/"], ["data-analytics"], []],
  ["devops", "devops", ["data/devops/"], ["docs/devops/"], ["devops-ops"], []],
  ["investor_relations", "investor-relations", ["data/investor-relations/"], ["docs/investor-relations/"], ["investor-relations"], []],
  ["esg_sustainability", "esg-sustainability", ["data/esg/"], ["docs/esg/"], ["esg-sustainability"], []],
  ["internal_audit", "internal-audit", ["data/compliance/"], ["docs/audit/internal/", "docs/compliance/"], ["internal-audit-scope"], ["internal_audit_scope"]],
  ["privacy_officer", "privacy-officer", ["data/classification-registry.yaml"], ["docs/compliance/privacy/"], ["privacy-officer"], []],
  ["treasury", "treasury", ["data/treasury/"], ["docs/treasury/"], ["treasury-cash"], []],
  ["customer_support", "customer-support", ["data/support/"], ["docs/support/"], ["customer-support"], []],
  ["pr_communications", "pr-communications", ["data/pr/"], ["docs/pr/"], ["pr-communications"], []],
  ["learning_development", "learning-development", ["data/learning/"], ["docs/learning/"], ["learning-development"], []],
  ["corporate_development", "corporate-development", ["data/corp-dev/"], ["docs/corp-dev/"], ["corporate-development"], []],
  ["quality_assurance", "quality-assurance", ["data/quality/"], ["docs/quality/", "docs/compliance/iso/"], ["quality-assurance"], ["qa_nonconformance_triage", "qa_iso9001_controls"]],
  ["medical_device_regulatory", "medical-device-regulatory", ["data/medical-device/"], ["docs/medical-device/", "docs/quality/"], ["medical-device-regulatory"], ["jp_medical_device_qms", "jp_medical_device_gvp", "jp_medical_device_ledgers"]],
];

const manifest = {
  version: "1",
  agents: ENTRIES.map(([id, slug, data_paths, docs_paths, route_ids, skills]) => ({
    id,
    summary_slug: slug,
    data_paths,
    docs_paths,
    route_ids,
    skills,
    pulse_checks: [
      ...data_paths.map((path) => ({ type: "path_exists", path })),
      ...docs_paths.map((path) => ({ type: "path_exists", path })),
    ],
  })),
};

const manifestPath = join(ROOT, "steward/core/agents/agent-capability-manifest.yaml");
writeFileSync(manifestPath, YAML.stringify(manifest), "utf-8");
console.log(`✓ ${manifestPath} (${manifest.agents.length} agents)`);

const templateRoot = join(ROOT, "tenants/_template");
const acmeRoot = join(ROOT, "tenants/acme");

function ensureSeed(tenantRoot, relPath) {
  const full = join(tenantRoot, relPath);
  if (relPath.endsWith("/")) {
    mkdirSync(full, { recursive: true });
    const readme = join(full, "00-README.md");
    if (!existsSync(readme)) {
      writeFileSync(
        readme,
        `# ${relPath}\n\nAgent capability seed — copy from \`tenants/_template\` on \`orgos tenant init\`.\n`,
        "utf-8"
      );
    }
    return;
  }
  mkdirSync(dirname(full), { recursive: true });
  if (!existsSync(full)) {
    if (relPath.endsWith(".yaml")) {
      writeFileSync(full, `# ${relPath}\nversion: \"1\"\n`, "utf-8");
    } else {
      writeFileSync(full, `# ${relPath}\n`, "utf-8");
    }
  }
}

for (const [, , data_paths, docs_paths] of ENTRIES) {
  for (const p of [...data_paths, ...docs_paths]) {
    ensureSeed(templateRoot, p);
    ensureSeed(acmeRoot, p);
  }
}

// acme: minimal yaml for key domains if empty
const acmeSales = join(acmeRoot, "data/sales/pipeline.yaml");
if (!existsSync(acmeSales)) {
  writeFileSync(acmeSales, "version: \"1\"\npipeline: []\n", "utf-8");
}

console.log("✓ _template + acme agent capability seeds");

const PULSE_BLOCK = (id, slug, skills) => {
  const skillLines =
    skills.length > 0
      ? skills.map((s) => `| ${s} | registry Skill |`).join("\n")
      : "";
  return `

## 使用 Skill / CLI

| 手段 | 内容 |
|------|------|
| agent_pulse | \`orgos agent pulse --agent ${id}\` |
${skillLines}

## CLI

\`\`\`bash
orgos agent readiness --agent ${id}
orgos agent pulse --agent ${id}
\`\`\`

## コンテキスト

- 能力正本: [agent-capability-manifest.yaml](agent-capability-manifest.yaml)
- 統括: [steward_agent_roster.md](../orchestrators/steward_agent_roster.md)
`;
};

const FULL_BLOCK = (id, slug, skills) => `

## 目的

- 担当領域の監視 · 下書き · 要約（Primary Folder 正本）
- pulse 後: \`docs/reports/agent-summaries/${slug}/\`

## 禁止事項

- 人間承認ゲートの単独実行
- 担当外 data/docs 編集 · L2/L3 出力
${PULSE_BLOCK(id, slug, skills)}`;

for (const [id, slug, , , , skills] of ENTRIES) {
  const agentPath = join(ROOT, `steward/core/agents/${id}_agent.md`);
  if (!existsSync(agentPath)) continue;
  let content = readFileSync(agentPath, "utf-8");
  if (content.includes("orgos agent pulse")) continue;
  if (!content.includes("## 目的")) {
    content = content.trimEnd() + FULL_BLOCK(id, slug, skills);
  } else {
    content = content.trimEnd() + PULSE_BLOCK(id, slug, skills);
  }
  writeFileSync(agentPath, content + "\n", "utf-8");
}

console.log("✓ agent.md enrichment");
