import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { startOnboarding } from "../../../../src/lib/propose-surface.js";

export const MODULE_ID = "hr_lifecycle";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export const hrLifecycleCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(
      ctx.operationsCmd,
      "hr-lifecycle",
      "Join and leave procedure ledger — no My Number or account numbers",
      {
        show: () => printJson({ module: MODULE_ID, proposeOnly: true }),
        validate: () => printJson({ ok: true }),
      },
    );
    const hr = ctx.operationsCmd.commands.find((cmd) => cmd.name() === "hr-lifecycle");
    hr
      ?.command("start")
      .description("Open an onboarding procedure and hand off to pdf_esign")
      .requiredOption("--person <ref>", "Person reference id")
      .option("--esign-case <id>", "pdf_esign case id")
      .action((opts: { person: string; esignCase?: string }) => {
        printJson(startOnboarding({ personRef: opts.person, esignCaseId: opts.esignCase }));
      });
  },
};
