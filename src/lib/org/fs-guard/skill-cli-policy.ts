/**
 * FS-guard coverage for Skill / CLI mutations (ADR 0039).
 * Canonical writes should use orgos guard apply; listed commands remain exceptions until migrated.
 */

export type FsGuardSkillCliPolicy = {
  command: string;
  status: "guard_required" | "exception_documented";
  note: string;
};

/** Commands that mutate canonical tenant data — guard apply target (incremental rollout). */
export const FS_GUARD_SKILL_CLI_POLICY: FsGuardSkillCliPolicy[] = [
  {
    command: "orgos guard apply",
    status: "guard_required",
    note: "Primary canonical write path after init",
  },
  {
    command: "orgos finances add",
    status: "guard_required",
    note: "Uses applyAgentWrite when FS-guard is enforced (finance agent)",
  },
  {
    command: "orgos finances reconcile",
    status: "guard_required",
    note: "Read-only by default; --output uses applyAgentWrite when FS-guard enforced",
  },
  {
    command: "orgos broker transfer",
    status: "guard_required",
    note: "--write stores instruction under runs/broker/ via finance agent when enforced",
  },
  {
    command: "orgos agent dispatch run",
    status: "guard_required",
    note: "Dispatch context.path checked by fs-guard when initialized",
  },
  {
    command: "operator_guard_apply",
    status: "guard_required",
    note: "LLM canonical write — host signs; expected_sha256 CAS required; not gated by ORGOS_LLM_TOOLS_WRITE",
  },
  {
    command: "orgos skills run",
    status: "guard_required",
    note: "Sets FS-guard agent context from skill.agent_id before CLI handlers",
  },
  {
    command: "orgos guard hash",
    status: "guard_required",
    note: "Prints current canonical sha256 for CAS (--expected-sha256)",
  },
];

export function listFsGuardSkillCliExceptions(): FsGuardSkillCliPolicy[] {
  return FS_GUARD_SKILL_CLI_POLICY.filter((p) => p.status === "exception_documented");
}

export function isGuardRequiredCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return FS_GUARD_SKILL_CLI_POLICY.some(
    (p) => p.status === "guard_required" && normalized.startsWith(p.command.toLowerCase()),
  );
}

export function formatFsGuardSkillCliPolicyTable(): string {
  const lines = [
    "| Command | Status | Note |",
    "|---------|--------|------|",
    ...FS_GUARD_SKILL_CLI_POLICY.map(
      (p) => `| \`${p.command}\` | ${p.status} | ${p.note} |`,
    ),
  ];
  return lines.join("\n");
}
