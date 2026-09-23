export const WEIGHTS = {
  definition: 15,
  skill_cli: 20,
  data_sot: 15,
  routing: 10,
  dashboard: 15,
  test: 10,
  tenant: 15,
  orchestration: 2,
} as const;

export const EXECUTIVE_STEWARD_SKILL_CLI_MAX = WEIGHTS.skill_cli - WEIGHTS.orchestration;
