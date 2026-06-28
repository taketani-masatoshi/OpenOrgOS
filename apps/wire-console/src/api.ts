export interface User {
  operator_id: string;
  approver_id: string;
  mode: string;
}

export interface AuthConfig {
  mode: "dev" | "prod";
  dev_login_allowed: boolean;
  prod_adapter?: "oidc" | "webauthn" | "legacy_token";
  prod_default_adapter?: "oidc";
  legacy_token_allowed?: boolean;
  legacy_token_deprecated?: boolean;
  oidc?: {
    issuer: string;
    audience: string;
    client_id: string;
    jwks_configured?: boolean;
    hs256_configured?: boolean;
  };
  webauthn?: { rp_id: string; credential_count: number; registration_allowed?: boolean };
  webauthn_e2e_login?: boolean;
}

export interface TenantSummary {
  id: string;
  name: string;
  display_name?: string;
  lifecycle?: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface TenantSnapshot {
  tenant_id: string;
  validation: {
    ok: boolean;
    issues: ValidationIssue[];
    warnings: ValidationIssue[];
  };
  counts: {
    outbox: number;
    inbox: number;
    transactions: number;
    wire_pending: number;
    witness_pending: number;
  };
  witness_pool?: { enabled: boolean; hub_count: number };
}

export interface EnvelopeListItem {
  event_id: string;
  envelope_digest: string;
  recorded_at: string;
  event_type: string;
  origin_org_id: string;
  destination_org_id?: string;
  transaction_type?: string;
  direction?: string;
  has_provenance: boolean;
}

export interface TransactionRecord {
  transaction_id: string;
  direction: string;
  transaction_type: string;
  event_id: string;
  recorded_at: string;
  counterparty: { org_id: string; org_uri?: string };
  refs: { contract_id?: string };
}

export interface WireApproval {
  approval_id: string;
  scope: string;
  status: string;
  proposed_at: string;
  proposed_by: string;
  subject_ref?: string;
  message?: string;
  approver_id?: string;
  wire?: {
    peer_id?: string;
    transaction_type?: string;
    contract_id?: string;
    wire_event_id?: string;
    transaction_id?: string;
  };
}

export interface PeerProfile {
  peer_id: string;
  display_name: string;
  org_uri?: string;
  jurisdiction?: string;
}

export interface EventDetail {
  event_id: string;
  envelope_digest: string;
  recorded_at: string;
  location: "outbox" | "inbox";
  envelope: unknown;
  provenance?: { source: string; written_at: string; digest: string };
  transaction?: TransactionRecord;
  wire_delivered?: boolean;
}

export interface WorkflowStep {
  id: "approval" | "outbox" | "delivery" | "witness";
  label: string;
  status: "done" | "pending" | "queued" | "partial" | "rejected" | "n/a";
  detail?: string;
}

export interface EventWorkflow {
  event_id: string;
  approval_id?: string;
  peer_id?: string;
  wire_delivered: boolean;
  wire_pending: boolean;
  quorum_satisfied: boolean;
  steps: WorkflowStep[];
}

export interface DeliveryState {
  pending: { peer_id: string; event_id: string; last_error?: string }[];
  delivered: { peer_id: string; event_id: string; delivered_at: string }[];
}

export interface WitnessStatus {
  pool: { enabled: boolean; hub_count: number; quorum_mode?: string };
  pending: { hub_id: string; event_id: string; side: string }[];
}

export interface NoticeWireTypeOption {
  value: string;
  label: string;
}

export const NOTICE_TYPES: NoticeWireTypeOption[] = [
  { value: "contract.execution.notice", label: "契約履行の通知" },
  { value: "obligation.acknowledged", label: "義務の受理" },
  { value: "invoice.issued", label: "請求書の発行" },
  { value: "payment.instructed", label: "支払いの指示" },
  { value: "contract.executed", label: "契約の締結" },
];

export type MailFolder = "inbox" | "outbox" | "pending" | "witness" | "all" | "threads";

export interface HumanMessageSummary {
  id: string;
  folder: "inbox" | "outbox" | "pending" | "witness" | "all";
  kind: "envelope" | "approval" | "witness";
  thread_id: string;
  subject: string;
  preview: string;
  counterparty: string;
  counterparty_id?: string;
  recorded_at: string;
  status_label: string;
  status_tone: "neutral" | "pending" | "success" | "warning" | "error";
  event_id?: string;
  approval_id?: string;
  contract_id?: string;
  transaction_id?: string;
  wire_event_id?: string;
  can_approve?: boolean;
  can_send?: boolean;
}

export interface MailThreadSummary {
  thread_id: string;
  title: string;
  counterparty: string;
  message_count: number;
  last_at: string;
  status_label: string;
  status_tone: HumanMessageSummary["status_tone"];
  contract_id?: string;
  transaction_id?: string;
  messages: HumanMessageSummary[];
}

export interface HumanMessageBody {
  id: string;
  subject: string;
  from_label: string;
  to_label: string;
  recorded_at: string;
  body_text: string;
  status_label: string;
  status_tone: HumanMessageSummary["status_tone"];
  workflow_summary: string[];
  event_id?: string;
  approval_id?: string;
  wire_event_id?: string;
  peer_id?: string;
  contract_id?: string;
  can_approve?: boolean;
  can_send?: boolean;
  can_witness?: boolean;
}

export interface WireConsoleScenario {
  as_of: string;
  scenario_id: string;
  title: string;
  org_role: "sender" | "receiver" | "witness";
  org_role_ja: string;
  counterparty_label: string;
  contract_id?: string;
  flow_steps: string[];
  anchors: {
    inter_org_event_id: string;
    ack_event_id?: string;
  };
  mail_hints: {
    inbox?: string;
    outbox?: string;
    pending?: string;
    witness?: string;
    threads?: string;
  };
  witness?: {
    anchor_event_id: string;
    hub_ids: string[];
    this_org_side?: "sent" | "received" | "none";
    note?: string;
  };
}

export function formatWireApprovalStatus(status: string, scope?: string): string {
  if (scope === "wire" && status === "completed") return "transmitted";
  return status;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body;
}

export function shortDigest(digest: string): string {
  return digest.length > 12 ? `${digest.slice(0, 8)}…` : digest;
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
