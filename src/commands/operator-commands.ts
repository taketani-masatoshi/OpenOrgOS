import {
  listCommandCatalog,
  resolveCommandPlan,
  handleChatCommandMessage,
} from "../lib/operator-commands/index.js";
import { setTenantId } from "../lib/tenant.js";

export function runCommandsList(opts: { tenant?: string; json?: boolean } = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const entries = listCommandCatalog();
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, commands: entries }, null, 2));
    return;
  }
  console.log("| kind | skill_id | label | cli | permission |");
  console.log("|------|----------|-------|-----|------------|");
  for (const e of entries) {
    console.log(
      `| ${e.kind} | ${e.skill_id} | ${e.label} | ${e.cli_command ?? "—"} | ${e.permission} |`
    );
  }
  console.log(`\n${entries.length} chat-enabled commands`);
}

export async function runCommandsMatch(opts: {
  tenant?: string;
  text: string;
  skillId?: string;
  execute?: boolean;
  json?: boolean;
}): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  if (!opts.text?.trim()) {
    console.error("Usage: orgos commands match --text \"...\"");
    process.exit(1);
  }

  if (opts.execute) {
    const result = await handleChatCommandMessage({
      message: opts.text,
      skillId: opts.skillId,
      operatorId: "cli",
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (!result.handled) {
      console.log("no match");
      process.exit(2);
    }
    console.log(result.reply ?? "");
    if (result.run && !result.run.ok) process.exit(1);
    return;
  }

  const plan = resolveCommandPlan({
    message: opts.text,
    skillId: opts.skillId,
  });
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, plan }, null, 2));
    return;
  }
  console.log(`status: ${plan.status}`);
  if (plan.skill_id) console.log(`skill: ${plan.skill_id}`);
  if (plan.label) console.log(`label: ${plan.label}`);
  if (plan.cli_display) console.log(`cli: ${plan.cli_display}`);
  if (plan.missing_args?.length) console.log(`missing: ${plan.missing_args.join(", ")}`);
  if (plan.candidates.length) {
    console.log("candidates:");
    for (const c of plan.candidates) {
      console.log(`  - ${c.skill_id} (${c.score}) ${c.label}`);
    }
  }
  if (plan.message) console.log(`message: ${plan.message}`);
  if (plan.status === "not_found") process.exit(2);
}
