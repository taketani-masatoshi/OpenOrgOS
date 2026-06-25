import type { Command } from "commander";

export interface ModuleCliHandlers {
  show: (opts: { json?: boolean }) => void;
  validate: () => void;
  action?: {
    name: string;
    description: string;
    run: (opts: Record<string, unknown>) => void;
    options?: (cmd: Command) => void;
  };
}

export function registerStandardModuleCommands(
  operationsCmd: Command,
  subcommand: string,
  description: string,
  handlers: ModuleCliHandlers
): void {
  const cmd = operationsCmd.command(subcommand).description(description);

  cmd
    .command("show")
    .description("Module status summary")
    .option("--json", "JSON output")
    .action((opts) => handlers.show({ json: opts.json }));

  cmd.command("validate").description("Validate module data files").action(() => handlers.validate());

  if (handlers.action) {
    const actionCmd = cmd.command(handlers.action.name).description(handlers.action.description);
    handlers.action.options?.(actionCmd);
    actionCmd.action((opts) => handlers.action!.run(opts));
  }
}
