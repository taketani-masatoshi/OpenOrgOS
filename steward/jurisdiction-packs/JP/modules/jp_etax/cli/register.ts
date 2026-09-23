import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { registerEtaxCommandTree } from "../../../../../../src/cli/registrars/etax.js";
import { runEtaxSpecStatus } from "../../../../../../src/commands/etax.js";

export const MODULE_ID = "jp_etax";

export const jp_etaxCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerEtaxCommandTree(ctx.operationsCmd);
  },
  skillHandlers: {
    jp_etax_spec_status: (opts) => runEtaxSpecStatus({ json: Boolean(opts.json) }),
  },
};
