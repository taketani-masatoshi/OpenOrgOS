import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { issuePortalGrant, issueTrackingUrl } from "../../../../src/lib/propose-surface.js";

export const MODULE_ID = "client_portal";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export const clientPortalCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(
      ctx.operationsCmd,
      "client-portal",
      "Client portal grants — ids and status only",
      {
        show: () => printJson({ module: MODULE_ID, proposeOnly: true }),
        validate: () => printJson({ ok: true }),
      },
    );
    const portal = ctx.operationsCmd.commands.find((cmd) => cmd.name() === "client-portal");
    portal
      ?.command("grant")
      .description("Issue a view link for contract, invoice, and order status ids")
      .requiredOption("--grantee <id>", "Grantee id")
      .option("--contract <id>", "Contract id")
      .option("--invoice <id>", "Invoice id")
      .option("--order-status <status>", "Order status")
      .action((opts: { grantee: string; contract?: string; invoice?: string; orderStatus?: string }) => {
        printJson(
          issuePortalGrant({
            granteeId: opts.grantee,
            contractId: opts.contract,
            invoiceId: opts.invoice,
            orderStatus: opts.orderStatus,
          }),
        );
      });
    portal
      ?.command("track")
      .description("Tracking URL with assignee and ETA. No map tiles")
      .requiredOption("--job <id>", "Job id")
      .requiredOption("--assignee <id>", "Assignee id")
      .requiredOption("--eta <text>", "ETA")
      .action((opts: { job: string; assignee: string; eta: string }) => {
        printJson(issueTrackingUrl({ jobId: opts.job, assigneeId: opts.assignee, eta: opts.eta }));
      });
  },
};
