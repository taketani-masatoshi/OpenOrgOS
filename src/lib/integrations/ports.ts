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

export interface MailPort {
  provider: ConnectorProvider;
  ping(input?: { dryRun?: boolean }): Promise<PortResult>;
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
