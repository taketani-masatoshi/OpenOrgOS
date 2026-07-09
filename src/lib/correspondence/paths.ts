import { join } from "node:path";
import { getDocsDir, getTenantDir } from "../utils.js";

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

export function getMailInboxDir(): string {
  return join(getExecutiveRecordsDir(), "mail-inbox");
}

export function correspondenceDraftYamlPath(draftId: string): string {
  return join(getCorrespondenceDraftsDir(), `${draftId}.yaml`);
}

export function correspondenceDraftMdPath(draftId: string): string {
  return join(getCorrespondenceDraftsDir(), `${draftId}.md`);
}
