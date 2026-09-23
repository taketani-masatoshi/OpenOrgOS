import type { Command } from "commander";
import { registerLegacyProtocolCommands } from "./legacy-protocol.js";
import { registerHubCommands } from "./hub.js";
import { registerLegacyWireGatewayCommands } from "./wire-gateway.js";

/** Compatibility roots: protocol · hub · wire-gateway. Prefer `orgos wire`. */
export function registerProtocolCompatibilityCommands(program: Command): void {
  registerLegacyProtocolCommands(program);
  registerHubCommands(program);
  registerLegacyWireGatewayCommands(program);
}

export {
  definePeerRegisterCommand,
  definePeerDiscoverCommand,
  definePeerMigrateLegacyCommand,
  defineDeliverEnvelopeCommand,
  defineDeliverStatusCommand,
  defineDeliverFlushPendingCommand,
  defineDeliverPullCommand,
  defineWitnessRegisterCommand,
  defineWitnessVerifyCommand,
  defineWitnessFlushPendingCommand,
  defineWitnessPoolStatusCommand,
  defineWitnessPoolInitTrustedCommand,
} from "./shared-command-defs.js";
