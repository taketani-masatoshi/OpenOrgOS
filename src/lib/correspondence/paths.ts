import { join } from "node:path";
import { getDataDir, getDocsDir, getTenantDir } from "../utils.js";
import { STEWARD_CORE_DIR } from "../steward-paths.js";

export function getCorrespondenceDraftsDir(): string {
  return join(getDocsDir(), "executive", "correspondence-drafts");
}

export function getTenantRecordsDir(): string {
  return join(getTenantDir(), "records");
}

export function getExecutiveRecordsDir(): string {
  return join(getTenantRecordsDir(), "executive");
}

export function getMailConfigPath(): string {
  return join(getExecutiveRecordsDir(), "mail-config.yaml");
}

export function getMailConfigExamplePath(): string {
  return join(getExecutiveRecordsDir(), "mail-config.yaml.example");
}

export function getMailSentDir(): string {
  return join(getExecutiveRecordsDir(), "mail-sent");
}

/** Wire protocol outbound .eml archive (L2 · gitignore). */
export function getWireSentDir(): string {
  return join(getExecutiveRecordsDir(), "wire-sent");
}

/** IMAP 受信アーカイブ（Secretary 社外メール）。≠ docs/io/inbox · ≠ protocol/inbox */
export function getMailReceivedDir(): string {
  return join(getExecutiveRecordsDir(), "mail-received");
}

/** @deprecated Use getMailReceivedDir — legacy path name mail-inbox */
export function getMailInboxDir(): string {
  return getMailReceivedDir();
}

export function correspondenceDraftYamlPath(draftId: string): string {
  return join(getCorrespondenceDraftsDir(), `${draftId}.yaml`);
}

export function correspondenceDraftMdPath(draftId: string): string {
  return join(getCorrespondenceDraftsDir(), `${draftId}.md`);
}

export function getMailTriageQueuePath(): string {
  return join(getDataDir(), "executive", "mail-triage-queue.yaml");
}

export function getMailTriageQueueExamplePath(): string {
  return join(getDataDir(), "executive", "mail-triage-queue.yaml.example");
}

export function getMailReceiveStatePath(): string {
  return join(getDataDir(), "executive", "mail-receive-state.yaml");
}

export function getTenantMailTriageRulesPath(): string {
  return join(getDataDir(), "correspondence", "mail-triage-rules.yaml");
}

export function getCoreMailTriageRulesPath(): string {
  return join(STEWARD_CORE_DIR, "correspondence", "mail-triage-rules.yaml");
}

export function getImapEnvPath(): string {
  return join(getExecutiveRecordsDir(), "imap.env");
}

export function inboundCorrespondenceDraftMdPath(messageId: string): string {
  return join(getCorrespondenceDraftsDir(), `inbound-${messageId}.md`);
}
