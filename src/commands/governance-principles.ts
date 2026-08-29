import { setTenantId } from "../lib/tenant.js";
import {
  assessGovernancePrinciples,
  initIso37000SelfDeclaration,
  markIso37000SelfDeclared,
} from "../lib/org/governance-principles.js";

function resolveTenant(tenant?: string): void {
  if (tenant) setTenantId(tenant);
}

export function runGovernancePrinciplesStatus(opts: {
  tenant?: string;
  json?: boolean;
}): void {
  resolveTenant(opts.tenant);
  const status = assessGovernancePrinciples();
  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log("OrgOS governance principles · ISO 37000 self-declaration readiness\n");
  console.log(`  Principles rule: ${status.principles_rule_ok ? "OK" : "MISSING"}`);
  console.log(`  Control map:     ${status.control_map_ok ? "OK" : "MISSING"}`);
  console.log(
    `  standards.yaml:  ISO-37000 ${status.standard_enabled ? "enabled" : "disabled/missing"}`,
  );
  console.log(
    `  Purpose:         ${status.purpose_ok ? "OK" : "MISSING"} — ${status.purpose_detail}`,
  );
  console.log(
    `  Applicability:   ${status.applicability_ok ? "OK" : "MISSING"} (principles-applicability.md)`,
  );
  console.log(`  Coverage:        ${status.principles_ok}/${status.principles_total}`);
  console.log(`  Ready to declare: ${status.ready_for_self_declaration ? "yes" : "no"}`);
  console.log(`  Declaration:     ${status.declaration?.status ?? "（未初期化）"}`);
  if (status.declaration?.next_review) {
    console.log(
      `  Next review:     ${status.declaration.next_review}${status.review_overdue ? " · OVERDUE" : ""}`,
    );
  }
  console.log("");
  for (const row of status.principles) {
    const mark = row.ok ? "✓" : "✗";
    console.log(`  ${mark} ${row.principle_id} ${row.title}`);
    if (!row.ok) {
      if (row.missing_paths.length) {
        console.log(`      missing: ${row.missing_paths.join(", ")}`);
      }
      if (row.semantic_detail) {
        console.log(`      check: ${row.semantic_detail}`);
      }
    }
  }
  if (!status.ready_for_self_declaration) {
    process.exitCode = 1;
  }
}

export function runGovernancePrinciplesInit(opts: {
  tenant?: string;
  force?: boolean;
  json?: boolean;
}): void {
  resolveTenant(opts.tenant);
  const result = initIso37000SelfDeclaration({ force: opts.force });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("ISO 37000 self-declaration draft initialized\n");
  console.log(`  YAML: ${result.declaration_path}`);
  console.log(`  MD:   ${result.markdown_path}`);
  console.log(
    `  Ready: ${result.status.ready_for_self_declaration ? "yes" : "no"} (${result.status.principles_ok}/${result.status.principles_total})`,
  );
  console.log(
    '\n次: 充足確認後、人間署名 → orgos governance principles declare --signatory "氏名"',
  );
}

export function runGovernancePrinciplesDeclare(opts: {
  tenant?: string;
  signatory: string;
  role?: string;
  json?: boolean;
}): void {
  resolveTenant(opts.tenant);
  const decl = markIso37000SelfDeclared({
    signatoryName: opts.signatory,
    signatoryRole: opts.role,
  });
  if (opts.json) {
    console.log(JSON.stringify(decl, null, 2));
    return;
  }
  console.log("ISO 37000 self-declaration recorded\n");
  console.log(`  status: ${decl.status}`);
  console.log(`  signed_at: ${decl.signed_at}`);
  console.log(`  signatory: ${decl.signatory_role} / ${decl.signatory_name}`);
  console.log("\n注意: 本宣言は第三者認証ではありません（ISO 37301 等とは別）。");
}
