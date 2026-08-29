/**
 * Mail Outbound CLI — 正本 namespace。
 * 実装は secretary-correspondence と共有（承認ゲート同一）。
 */
export {
  runCorrespondenceDraft,
  runCorrespondenceList,
  runCorrespondenceShow,
  runCorrespondenceSend,
  runCorrespondenceSendSkill,
  runSlackNotifySkill,
  runCorrespondenceStyleLint,
  runCorrespondenceCompose,
  runCorrespondenceKnowledgeSearch,
  runCorrespondenceFactsVerify,
  runSecretaryMailList,
  runSecretaryMailConfig,
  runSecretaryMailSetupGuide,
} from "./secretary-correspondence.js";
