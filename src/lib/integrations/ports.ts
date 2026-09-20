/**
 * Capability ports. Providers implement these; callers do not name SaaS APIs.
 * Path: src/lib/integrations/ports.ts
 */
import type { ConnectorProvider } from "../../../schemas/connectors.js";

export interface PortResult {
  ok: boolean;
  reason: string;
  dryRun?: boolean;
}

export interface ChatSendInput {
  text: string;
  roomId?: string;
  dryRun?: boolean;
}

export interface ChatPort {
  provider: ConnectorProvider;
  send(input: ChatSendInput): Promise<PortResult>;
}

export interface FilesPutInput {
  path: string;
  body: string;
  dryRun?: boolean;
}

export interface FilesPort {
  provider: ConnectorProvider;
  put(input: FilesPutInput): Promise<PortResult>;
}

/** L1 meta for a fetched message. MIME stays for vault write by the caller. */
export interface MailFetchedMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  /** Raw MIME — never log or paste into chat. */
  mime: string;
}

export interface MailFetchSinceInput {
  /** ISO timestamp; messages after this time when the provider supports it. */
  since?: string;
  label?: string;
  dryRun?: boolean;
}

export interface MailFetchResult extends PortResult {
  messages?: MailFetchedMessage[];
  fetched?: number;
}

export interface MailSendMimeInput {
  mime: string;
  dryRun?: boolean;
}

export interface MailSendResult extends PortResult {
  messageId?: string;
}

export interface MailPort {
  /** `smtp` is generic AUTH LOGIN, not a connector catalog provider. */
  provider: ConnectorProvider | "smtp";
  ping(input?: { dryRun?: boolean }): Promise<PortResult>;
  /** Receive sync. Callers write vault files; the port does not. */
  fetchSince(input?: MailFetchSinceInput): Promise<MailFetchResult>;
  /** Approved send only. The port does not check chat:approve. */
  sendMime(input: MailSendMimeInput): Promise<MailSendResult>;
}

export interface CalendarPort {
  provider: ConnectorProvider;
  ping(input?: { dryRun?: boolean }): Promise<PortResult>;
}

export interface IamPort {
  provider: ConnectorProvider;
  discover(input?: { dryRun?: boolean }): Promise<PortResult>;
}

export const STUB_DOES_NOT_LEAVE = "外へは出しません";
