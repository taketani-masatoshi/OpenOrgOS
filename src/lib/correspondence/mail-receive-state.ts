import {
  mailReceiveStateSchema,
  type MailReceiveState,
} from "../../../schemas/correspondence/mail-receive-state.js";
import { loadRegistryFile, writeYamlFile } from "../utils.js";
import { getMailReceiveStatePath } from "./paths.js";

export function loadMailReceiveState(): MailReceiveState {
  return loadRegistryFile(getMailReceiveStatePath(), mailReceiveStateSchema, () =>
    mailReceiveStateSchema.parse({ version: 1, provider: "imap", mailbox: "INBOX", last_uid: 0 })
  );
}

export function saveMailReceiveState(state: MailReceiveState): void {
  writeYamlFile(getMailReceiveStatePath(), mailReceiveStateSchema.parse(state));
}

export function updateMailReceiveState(
  patch: Partial<MailReceiveState> & Pick<MailReceiveState, "last_uid">
): MailReceiveState {
  const current = loadMailReceiveState();
  const next = mailReceiveStateSchema.parse({ ...current, ...patch });
  saveMailReceiveState(next);
  return next;
}
