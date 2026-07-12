import {
  runSecretaryEscalateAsync,
  writeSecretaryConsultFile,
  dispatchSecretaryEscalation,
  type SecretaryEscalateInput,
} from "../lib/secretary-consult.js";
import { auditCliMutation, requireCliDataWrite } from "../lib/console-auth/cli-operator.js";

export interface SecretaryEscalateCliOptions {
  subject: string;
  background?: string;
  question?: string[];
  confidential?: string;
  format?: string;
  memo?: string;
  webhook?: boolean;
  dispatch?: boolean;
  dryRun?: boolean;
  print?: boolean;
}

export async function runSecretaryEscalate(opts: SecretaryEscalateCliOptions): Promise<void> {
  if (!opts.subject) {
    console.error("Provide --subject");
    process.exit(1);
  }
  const questions = opts.question?.length ? opts.question : [];
  const input: SecretaryEscalateInput = {
    subject: opts.subject,
    background: opts.background,
    questions,
    confidential: (opts.confidential as SecretaryEscalateInput["confidential"]) ?? "L1",
    responseFormat: opts.format,
    memo: opts.memo,
  };

  if (!opts.dryRun) {
    requireCliDataWrite({
      command: "secretary escalate",
      permission: opts.dispatch ? "agent:dispatch" : "escalate:plan",
    });
  }

  const runner = opts.dispatch
    ? dispatchSecretaryEscalation
    : opts.webhook
      ? runSecretaryEscalateAsync
      : null;
  const result = runner
    ? await runner(input, {
        webhook: opts.webhook ?? opts.dispatch,
        dryRun: opts.dryRun,
      })
    : writeSecretaryConsultFile(input, { dryRun: opts.dryRun });

  if (opts.print || opts.dryRun) {
    console.log(result.markdown);
    console.log("");
  }

  if (!opts.dryRun) {
    console.log(`✓ ${result.consultPath}`);
    auditCliMutation("secretary escalate", opts.dispatch ? "dispatch" : "consult");
    if (opts.dispatch && result.handoffId) {
      console.log(`✓ routing-queue ${result.handoffId}`);
      console.log("\nSteward スレッド不要 — Executive Steward handoff 投入済み");
      if (result.handoffPath) console.log(`  handoff: ${result.handoffPath}`);
    } else {
      console.log("\n次: npm run orgos -- secretary escalate --dispatch … で handoff 自動投入");
      console.log("  または Cursor Steward スレッドで CONSULT MD を @ 参照");
    }
    if (result.webhook) {
      console.log(`\nWebhook: ${result.webhook.sent ? "sent" : result.webhook.reason}`);
    }
  }
}
