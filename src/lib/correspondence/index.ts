export {
  createCorrespondenceDraft,
  loadCorrespondenceDraft,
  listCorrespondenceDrafts,
  saveCorrespondenceDraft,
} from "./draft.js";
export {
  assertCorrespondenceApproved,
  sendApprovedCorrespondence,
  CorrespondenceApprovalGateError,
} from "./send-gate.js";
export { listExecutiveMail } from "./mail-list.js";
export { resolveMailConfig, loadMailConfig } from "./mail-config.js";
