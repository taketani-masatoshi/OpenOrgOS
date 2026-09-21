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

    cmd
      .command("intake")
      .description("Parse an invoice fixture into tax and T-number candidates. Does not post")
      .requiredOption("--text <text>", "Fixture text")
      .option("--catalog <json>", "Offline registration catalog JSON")
      .action(async (opts: { text: string; catalog?: string }) => {
        const { matchRegistration, parseInvoiceFixture } = await import(
          "../../../../../../src/lib/propose-surface.js"
        );
        const candidate = parseInvoiceFixture(opts.text);
        const registration = opts.catalog
          ? matchRegistration(JSON.parse(opts.catalog), candidate.tNumber)
          : undefined;
        console.log(JSON.stringify({ ...candidate, registration }));
      });
  },
  skillHandlers: {
    jp_invoice_registration: runJpInvoiceRegistrationSkill,
    jp_qualified_invoice_issue: runJpQualifiedInvoiceIssueSkill,
  },
};
