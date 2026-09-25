import { Command } from "commander";
import "./composition/register-correspondence-hooks.js";
import { registerPlatformCommands } from "../cli/registrars/platform.js";
import { registerOrchestrationCommands } from "../cli/registrars/orchestration.js";
import { registerExecutiveCommands } from "../cli/registrars/executive.js";
import { registerDomainCommands } from "../cli/registrars/domain.js";
import { registerEtaxCommands } from "../cli/registrars/etax.js";
import { registerEfilingCommands } from "../cli/registrars/efiling.js";

/** Build the OrgOS commander tree for catalog and contract tests. */
export function buildOrgOsCommandProgram(): Command {
  const program = new Command().name("orgos");
  registerDomainCommands(program);
  registerPlatformCommands(program);
  registerOrchestrationCommands(program);
  registerExecutiveCommands(program);
  registerEtaxCommands(program);
  registerEfilingCommands(program);
  return program;
}
