/**
 * Public facade for agent reporting / mission relay.
 * Implementation lives under src/lib/agents/reporting/.
 */

export type { AgentMission } from "../../schemas/agent-reporting.js";

export {
  loadChainPolicy,
  isFieldAgent,
  canReceiveImplementOrder,
} from "./agents/reporting/chain-policy.js";

export {
  missionsDir,
  generateMissionId,
  writeMission,
  loadMission,
  listMissions,
  findMissionByWorkOrder,
  listCooRelayInbox,
  listStewardInbox,
} from "./agents/reporting/mission-store.js";

export type {
  CreateAgentOrderOptions,
  SubmitAgentReportOptions,
  AckRelayOptions,
} from "./agents/reporting/relay.js";
export {
  createAgentOrder,
  submitAgentReport,
  ackRelay,
  relayPulseReport,
  createMissionFromWorkOrder,
  relayWorkOrderComplete,
} from "./agents/reporting/relay.js";

export { formatReportingInboxMarkdown } from "./agents/reporting/inbox-format.js";
