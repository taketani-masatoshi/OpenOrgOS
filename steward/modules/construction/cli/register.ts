import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import {
  MODULE_ID,
  runConstructionShow,
  runConstructionSiteProgress,
  runConstructionValidate,
} from "./commands.js";

export { MODULE_ID };

export const constructionCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(
      ctx.operationsCmd,
      "construction",
      "Construction — sites · phases (construction module)",
      {
        show: runConstructionShow,
        validate: runConstructionValidate,
        action: {
          name: "site-progress",
          description: "In-progress sites with their current phases (phases.yaml × sites.yaml)",
          options: (cmd: Command) => {
            cmd.option("--site <id>", "Filter by site id");
            cmd.option("--json", "JSON output");
          },
          run: (opts) =>
            runConstructionSiteProgress({
              site: typeof opts.site === "string" ? opts.site : undefined,
              json: Boolean(opts.json),
            }),
        },
      }
    );
  },
  skillHandlers: {
    construction_site_progress: (opts) =>
      runConstructionSiteProgress({ site: opts.id, json: Boolean(opts.json) }),
    construction_show: (opts) => runConstructionShow({ json: Boolean(opts.json) }),
  },
};
