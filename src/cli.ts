#!/usr/bin/env node
import "./bootstrap-tenant.js";
import { Command } from "commander";
import { registerPlatformCommands } from "./cli/registrars/platform.js";
import { registerOrchestrationCommands } from "./cli/registrars/orchestration.js";
import { registerExecutiveCommands } from "./cli/registrars/executive.js";
import { registerDomainCommands } from "./cli/registrars/domain.js";
import {
  maybeWarnLegacyCli,
  ORGOS_CLI_NAME,
  ORGOS_PRODUCT_NAME,
  ORGOS_PRODUCT_TAGLINE,
  ORGOS_TENANT_ENV,
  LEGACY_TENANT_ENV,
} from "./lib/orgos-cli.js";

maybeWarnLegacyCli();

const program = new Command();

program
  .name(ORGOS_CLI_NAME)
  .description(`${ORGOS_PRODUCT_NAME} — ${ORGOS_PRODUCT_TAGLINE}`)
  .version("0.8.0")
  .option(
    "--tenant <id>",
    `Tenant instance (env: ${ORGOS_TENANT_ENV} or ${LEGACY_TENANT_ENV}; default from tenant.yaml)`
  );

registerDomainCommands(program);
registerPlatformCommands(program);
registerOrchestrationCommands(program);
registerExecutiveCommands(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
