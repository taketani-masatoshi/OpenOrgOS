/**
 * Deprecation warnings for legacy CLI roots superseded by canonical facades.
 */

import type { Command } from "commander";

const LEGACY_CLI_ROOTS: Record<string, string> = {
  protocol: "orgos wire",
  "wire-gateway": "orgos wire gateway",
};

export function attachLegacyCliDeprecationWarnings(program: Command): void {
  for (const command of program.commands) {
    const replacement = LEGACY_CLI_ROOTS[command.name()];
    if (!replacement) continue;
    command.hook("preAction", () => {
      if (process.env.ORGOS_SUPPRESS_LEGACY_WARN === "1") return;
      console.warn(
        `[orgos] \`${command.name()}\` is a compatibility alias — prefer \`${replacement}\``
      );
    });
  }
}
