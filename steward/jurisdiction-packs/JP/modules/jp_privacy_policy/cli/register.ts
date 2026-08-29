import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../../../src/lib/module-cli-factory.js";
import {
  MODULE_ID,
  runPrivacyPolicyShow,
  runPrivacyPolicyStatus,
  runPrivacyPolicyValidate,
} from "./commands.js";

export { MODULE_ID };

export const jpPrivacyPolicyCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(
      ctx.operationsCmd,
      "privacy-policy",
      "Privacy policy — version · publication · required sections",
      {
        show: runPrivacyPolicyShow,
        validate: runPrivacyPolicyValidate,
        action: {
          name: "policy-status",
          description: "Publication state with required-section coverage",
          options: (cmd) => {
            cmd.option("--json", "JSON output");
          },
          run: (opts) => runPrivacyPolicyStatus({ json: Boolean(opts.json) }),
        },
      }
    );
  },
  skillHandlers: {
    jp_privacy_policy_show: (opts) => runPrivacyPolicyShow({ json: Boolean(opts.json) }),
    jp_privacy_policy_status: (opts) => runPrivacyPolicyStatus({ json: Boolean(opts.json) }),
  },
};
