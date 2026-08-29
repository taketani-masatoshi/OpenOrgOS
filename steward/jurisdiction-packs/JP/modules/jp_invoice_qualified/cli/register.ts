import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpInvoiceRegistrationSkill,
  runJpQualifiedInvoiceIssueSkill,
} from "../../../../../../src/lib/finance/tax-skill-runners.js";
import {
  runTaxInvoiceRegistrationCheck,
  runTaxQualifiedInvoiceCheck,
} from "../../../../../../src/commands/tax.js";

export const MODULE_ID = "jp_invoice_qualified";

export const jp_invoice_qualifiedCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("invoice-qualified")
      .description("JP qualified invoice registration check (jp_invoice_qualified)");

    cmd
      .command("registration")
      .description("Verify T-number and invoice registration consistency")
      .option("--json")
      .action((opts: { json?: boolean }) =>
        runTaxInvoiceRegistrationCheck({ json: Boolean(opts.json) }),
      );

    cmd
      .command("issue-check")
      .description("Qualified invoice issuance prerequisites")
      .option("--json")
      .action((opts: { json?: boolean }) =>
        runTaxQualifiedInvoiceCheck({ json: Boolean(opts.json) }),
      );
  },
  skillHandlers: {
    jp_invoice_registration: runJpInvoiceRegistrationSkill,
    jp_qualified_invoice_issue: runJpQualifiedInvoiceIssueSkill,
  },
};
