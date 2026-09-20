/**
 * Optional L1 secretary note to Nextcloud. Never copies vault or data/ YAML.
 * Path: src/lib/integrations/secretary-l1-mirror.ts
 */
import { countHighPriorityTriage, loadMailTriageQueue } from "../correspondence/mail-triage-queue.js";
import { loadMailReceiveState } from "../correspondence/mail-receive-state.js";
import {
  nextcloudConfigFromEnv,
  nextcloudFilesPort,
  type NextcloudConfig,
} from "./sovereign/nextcloud-webdav.js";
import type { PortResult } from "./ports.js";

export const SECRETARY_L1_NOTE_PATH = "opendesk-verify/secretary-l1-note.txt";

/** Build a short L1 summary line — counts only, no subjects or bodies. */
export function buildSecretaryL1Note(opts?: {
  now?: string;
  receiveState?: ReturnType<typeof loadMailReceiveState>;
  triageCount?: number;
  highPriority?: number;
}): string {
  const state = opts?.receiveState ?? loadMailReceiveState();
  const triage = opts?.triageCount ?? loadMailTriageQueue().entries.length;
  const high =
    opts?.highPriority ??
    countHighPriorityTriage().pending;
  const when = opts?.now ?? new Date().toISOString();
  return [
    "OrgOS secretary L1 mirror",
    `at: ${when}`,
    `receive_last_sync: ${state.last_sync_at ?? "never"}`,
    `receive_last_count: ${state.last_sync_count ?? 0}`,
    `triage_entries: ${triage}`,
    `triage_high_priority: ${high}`,
  ].join("\n");
}

/**
 * Put the L1 note when Nextcloud env is configured.
 * No-op (ok:false, reason) when env is missing — callers treat as skip.
 */
export async function mirrorSecretaryL1ToNextcloud(opts?: {
  config?: NextcloudConfig | null;
  body?: string;
  fetchImpl?: typeof fetch;
}): Promise<PortResult> {
  const config = opts?.config === undefined ? nextcloudConfigFromEnv() : opts.config;
  if (!config) {
    return { ok: false, reason: "ORGOS_NEXTCLOUD_* が未設定のためスキップ" };
  }
  const body = opts?.body ?? buildSecretaryL1Note();
  return nextcloudFilesPort(config, opts?.fetchImpl).put({
    path: SECRETARY_L1_NOTE_PATH,
    body,
  });
}
