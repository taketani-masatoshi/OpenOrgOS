import {
  loadTenantSetupAnswersFromFile,
  runTenantSetupWizard,
} from "../lib/tenant-setup-wizard.js";
import { runValidate } from "./validate.js";
import { getTenantId } from "../lib/tenant.js";

export interface TenantSetupCliOptions {
  answers?: string;
  nonInteractive?: boolean;
  operator?: string;
  skipValidate?: boolean;
  json?: boolean;
}

export async function runTenantSetupCommand(opts: TenantSetupCliOptions): Promise<void> {
  const answers = opts.answers ? loadTenantSetupAnswersFromFile(opts.answers) : undefined;

  const result = await runTenantSetupWizard({
    answers,
    nonInteractive: opts.nonInteractive ?? Boolean(answers),
    operatorId: opts.operator,
  });

  if (!opts.skipValidate) {
    runValidate({});
  }

  if (opts.json) {
    console.log(JSON.stringify({ tenant: getTenantId(), ...result }, null, 2));
    return;
  }

  console.log(`✓ Tenant setup complete · ${getTenantId()}`);
  console.log(`  integrations: ${result.integrations_path}`);
  if (result.mail_config_path) {
    console.log(`  mail config: ${result.mail_config_path}`);
  }
  if (result.executive_seeded) {
    console.log("  executive: seeded from *.yaml.example");
  }
  if (result.operators_initialized) {
    console.log("  operators: registry ready");
  }
  if (result.env_hints.length) {
    console.log("\nEnv hints:");
    for (const h of result.env_hints) console.log(`  ${h}`);
  }
}
