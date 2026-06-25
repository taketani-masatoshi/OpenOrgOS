import type { Command } from "commander";
import type { SkillRunOptions } from "../commands/skills.js";

/** Context passed to each module's register() — shared parent commands created once. */
export interface ModuleCliContext {
  program: Command;
  operationsCmd: Command;
}

export interface ModuleCliBundle {
  moduleId: string;
  register: (ctx: ModuleCliContext) => void;
  /** Skill CLI handlers keyed by `skills run <id>` command id */
  skillHandlers?: Record<string, (opts: SkillRunOptions) => void | Promise<void>>;
}
