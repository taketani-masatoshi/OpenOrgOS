import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../../../src/lib/module-cli-factory.js";
import {
  MODULE_ID,
  runWomenEmpowermentKpi,
  runWomenEmpowermentShow,
  runWomenEmpowermentValidate,
} from "./commands.js";

export { MODULE_ID };

export const jpWomenEmpowermentCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(
      ctx.operationsCmd,
      "women-empowerment",
      "Women empowerment — 一般事業主行動計画 · KPI · 施策",
      {
        show: runWomenEmpowermentShow,
        validate: runWomenEmpowermentValidate,
        action: {
          name: "kpi",
          description: "Action plan KPIs with unset baseline / target flagged",
          options: (cmd) => {
            cmd.option("--json", "JSON output");
          },
          run: (opts) => runWomenEmpowermentKpi({ json: Boolean(opts.json) }),
        },
      }
    );
  },
  skillHandlers: {
    jp_women_empowerment_show: (opts) => runWomenEmpowermentShow({ json: Boolean(opts.json) }),
    jp_women_empowerment_kpi: (opts) => runWomenEmpowermentKpi({ json: Boolean(opts.json) }),
  },
};
