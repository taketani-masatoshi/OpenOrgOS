#!/usr/bin/env node
import "./bootstrap-tenant.js";
import { Command } from "commander";
import { registerPlatformCommands } from "./cli/registrars/platform.js";
import { registerOrchestrationCommands } from "./cli/registrars/orchestration.js";
import { registerExecutiveCommands } from "./cli/registrars/executive.js";
import { registerDomainCommands } from "./cli/registrars/domain.js";

const program = new Command();

program
  .name("steward")
  .description("Steward OS - Property Business Edition CLI")
  .version("0.2.0")
  .option("--tenant <id>", "Tenant instance (env: STEWARD_TENANT; default from tenant.yaml)");

registerDomainCommands(program);
registerPlatformCommands(program);
registerOrchestrationCommands(program);
registerExecutiveCommands(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
