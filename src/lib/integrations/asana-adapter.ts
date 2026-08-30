/**
 * Asana CaseReplicaAdapter — OrgOS case is SoT; Asana is L1 replica for external sharing.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getDataDir, loadRegistryFile, writeYamlFile } from "../utils.js";
import { getTenantDir } from "../tenant.js";
import { loadCorrespondenceCaseRef, parseCaseRefFromDraft } from "../correspondence/case-status.js";
import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import { loadIntegrations } from "../integrations.js";
import { loadConnectorSettings, loadConnectorToken } from "./connector-store.js";
import { hydrateConnectorEnvFromStore } from "./connector-secrets-store.js";
import { loadHandoff } from "../routing.js";
import { loadExecutiveTasks } from "../data.js";

/** What the Asana task mirrors. `case` is the original (and default) kind. */
export const asanaTargetKindSchema = z.enum(["case", "work_order", "executive_task"]);

export type AsanaTargetKind = z.output<typeof asanaTargetKindSchema>;

const asanaLinkSchema = z.object({
  kind: asanaTargetKindSchema.default("case"),
  /** OrgOS id of the mirrored record (case / work order / executive task). */
  case_id: z.string().min(1),
  task_gid: z.string().min(1),
  project_gid: z.string().optional(),
  last_pushed_at: z.string().optional(),
  last_pulled_at: z.string().optional(),
  public_notes: z.string().optional(),
});

const asanaLinksFileSchema = z.object({
  version: z.literal(1).default(1),
  links: z.array(asanaLinkSchema).default([]),
});

export type AsanaLink = z.output<typeof asanaLinkSchema>;
export type AsanaLinksFile = z.output<typeof asanaLinksFileSchema>;

function linksPath(): string {
  return join(getDataDir(), "integrations", "asana-links.yaml");
}

function tokenPath(): string {
  return join(getTenantDir(), "records", "integrations", "asana-token.json");
}

export function loadAsanaLinks(): AsanaLinksFile {
  return loadRegistryFile(linksPath(), asanaLinksFileSchema, () =>
    asanaLinksFileSchema.parse({ version: 1, links: [] }),
  );
}

export function saveAsanaLinks(file: AsanaLinksFile): void {
  mkdirSync(join(getDataDir(), "integrations"), { recursive: true });
  writeYamlFile(linksPath(), asanaLinksFileSchema.parse(file));
}

export function findAsanaLink(caseId: string): AsanaLink | undefined {
  return loadAsanaLinks().links.find((l) => l.case_id === caseId);
}

export function findAsanaLinkForTarget(
  kind: AsanaTargetKind,
  id: string,
): AsanaLink | undefined {
  return loadAsanaLinks().links.find((l) => l.kind === kind && l.case_id === id);
}

export function linkAsanaCase(opts: {
  caseId: string;
  taskGid: string;
  projectGid?: string;
}): AsanaLink {
  if (!loadCorrespondenceCaseRef(opts.caseId)) {
    throw new Error(`Case ${opts.caseId} not found in OrgOS SoT`);
  }
  const file = loadAsanaLinks();
  const link: AsanaLink = {
    kind: "case",
    case_id: opts.caseId,
    task_gid: opts.taskGid,
    project_gid: opts.projectGid,
  };
  const idx = file.links.findIndex((l) => l.case_id === opts.caseId);
  if (idx >= 0) file.links[idx] = { ...file.links[idx], ...link };
  else file.links.push(link);
  saveAsanaLinks(file);
  return link;
}

export function resolveAsanaPat(): string | undefined {
  hydrateConnectorEnvFromStore();
  if (process.env.ORGOS_ASANA_PAT?.trim()) return process.env.ORGOS_ASANA_PAT.trim();
  const oauth = loadConnectorToken("asana");
  if (oauth?.access_token) return oauth.access_token;
  if (!existsSync(tokenPath())) return undefined;
  try {
    const raw = JSON.parse(readFileSync(tokenPath(), "utf-8")) as {
      personal_access_token?: string;
    };
    return raw.personal_access_token?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export interface AsanaStatusReport {
  configured: boolean;
  links: number;
  token_source?: "env" | "records" | "none";
}

export function asanaIntegrationStatus(): AsanaStatusReport {
  const env = Boolean(process.env.ORGOS_ASANA_PAT?.trim());
  const records = existsSync(tokenPath());
  return {
    configured: env || records,
    links: loadAsanaLinks().links.length,
    token_source: env ? "env" : records ? "records" : "none",
  };
}

/** L1-only payload — never include email body, amounts, or personal addresses. */
export function buildAsanaPushPayload(caseId: string): {
  name: string;
  notes: string;
  due_on?: string;
} {
  const ref = loadCorrespondenceCaseRef(caseId);
  if (!ref) throw new Error(`Case ${caseId} not found`);
  const notes = [
    `OrgOS case: ${ref.id}`,
    `Status: ${ref.status}`,
    ref.next_action ? `Next: ${ref.next_action}` : "",
    "Source of truth: OrgOS (Asana is a replica).",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    name: `${ref.id} · ${ref.subject ?? ref.company ?? "case"}`.slice(0, 200),
    notes,
    due_on: ref.next_action_due,
  };
}

export async function pushAsanaCase(caseId: string): Promise<{ ok: boolean; reason?: string }> {
  const link = findAsanaLink(caseId);
  if (!link) return { ok: false, reason: "not_linked" };
  const pat = resolveAsanaPat();
  if (!pat) return { ok: false, reason: "no_token" };

  const payload = buildAsanaPushPayload(caseId);
  const body: Record<string, unknown> = {
    data: {
      name: payload.name,
      notes: payload.notes,
      ...(payload.due_on ? { due_on: payload.due_on } : {}),
    },
  };

  const res = await fetch(`https://app.asana.com/api/1.0/tasks/${link.task_gid}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { ok: false, reason: `asana_http_${res.status}` };
  }

  const file = loadAsanaLinks();
  const idx = file.links.findIndex((l) => l.case_id === caseId);
  if (idx >= 0) {
    file.links[idx] = {
      ...file.links[idx]!,
      last_pushed_at: new Date().toISOString(),
    };
    saveAsanaLinks(file);
  }
  return { ok: true };
}

export async function pullAsanaCase(caseId: string): Promise<{
  ok: boolean;
  public_notes?: string;
  reason?: string;
}> {
  const link = findAsanaLink(caseId);
  if (!link) return { ok: false, reason: "not_linked" };
  const pat = resolveAsanaPat();
  if (!pat) return { ok: false, reason: "no_token" };

  const res = await fetch(
    `https://app.asana.com/api/1.0/tasks/${link.task_gid}?opt_fields=name,notes,due_on`,
    { headers: { Authorization: `Bearer ${pat}` } },
  );
  if (!res.ok) return { ok: false, reason: `asana_http_${res.status}` };
  const json = (await res.json()) as { data?: { notes?: string } };
  const notes = json.data?.notes?.slice(0, 500);

  const file = loadAsanaLinks();
  const idx = file.links.findIndex((l) => l.case_id === caseId);
  if (idx >= 0) {
    file.links[idx] = {
      ...file.links[idx]!,
      last_pulled_at: new Date().toISOString(),
      public_notes: notes,
    };
    saveAsanaLinks(file);
  }
  // Never overwrite OrgOS status from Asana
  return { ok: true, public_notes: notes };
}

export async function pushAsanaCaseIfLinked(
  draft: CorrespondenceDraft,
): Promise<void> {
  const ref = parseCaseRefFromDraft(draft);
  if (!ref) return;
  if (!findAsanaLink(ref.id)) return;
  await pushAsanaCase(ref.id);
}

export interface AsanaTaskPayload {
  name: string;
  notes: string;
  due_on?: string;
}

const SOT_FOOTER = "Source of truth: OrgOS (Asana is a replica).";

/**
 * L1-only payload for any mirrored record. Deliberately narrow: id, title,
 * status and due date. Requirements text, mail bodies and amounts stay in OrgOS.
 */
export function buildAsanaTargetPayload(
  kind: AsanaTargetKind,
  id: string,
): AsanaTaskPayload {
  if (kind === "case") return buildAsanaPushPayload(id);

  if (kind === "work_order") {
    const handoff = loadHandoff(id);
    const title = handoff.subject ?? handoff.skill ?? handoff.to_agent;
    return {
      name: `${handoff.id} · ${title}`.slice(0, 200),
      notes: [
        `OrgOS work order: ${handoff.id}`,
        `Status: ${handoff.status}`,
        `Agent: ${handoff.to_agent}`,
        handoff.work_kind ? `Kind: ${handoff.work_kind}` : "",
        SOT_FOOTER,
      ]
        .filter(Boolean)
        .join("\n"),
      due_on: handoff.due_date,
    };
  }

  const task = loadExecutiveTasks().tasks.find((t) => t.id === id);
  if (!task) throw new Error(`Executive task ${id} not found`);
  return {
    name: `${task.id} · ${task.title}`.slice(0, 200),
    notes: [
      `OrgOS executive task: ${task.id}`,
      `Status: ${task.status}`,
      `Priority: ${task.priority}`,
      SOT_FOOTER,
    ].join("\n"),
    due_on: task.due ?? undefined,
  };
}

export interface AsanaPushResult {
  ok: boolean;
  reason?: string;
  task_gid?: string;
  created?: boolean;
}

function resolveAsanaProjectGid(explicit?: string): string | undefined {
  return explicit?.trim() || loadConnectorSettings("asana")?.default_project_gid?.trim() || undefined;
}

/**
 * Mirror an OrgOS record into Asana. Creates the task on first push and
 * updates it afterwards; the OrgOS record is never modified here.
 */
export async function pushAsanaTarget(opts: {
  kind: AsanaTargetKind;
  id: string;
  projectGid?: string;
  fetchImpl?: typeof fetch;
}): Promise<AsanaPushResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const pat = resolveAsanaPat();
  if (!pat) {
    return { ok: false, reason: "Asana が未接続です。連携設定から接続してください。" };
  }

  let payload: AsanaTaskPayload;
  try {
    payload = buildAsanaTargetPayload(opts.kind, opts.id);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  const link = findAsanaLinkForTarget(opts.kind, opts.id);
  const headers = {
    Authorization: `Bearer ${pat}`,
    "Content-Type": "application/json",
  };
  const data: Record<string, unknown> = {
    name: payload.name,
    notes: payload.notes,
    ...(payload.due_on ? { due_on: payload.due_on } : {}),
  };

  if (!link) {
    const projectGid = resolveAsanaProjectGid(opts.projectGid);
    if (!projectGid) {
      return {
        ok: false,
        reason: "Asana のプロジェクトが未設定です。連携設定で既定プロジェクトを選んでください。",
      };
    }
    const res = await fetchImpl("https://app.asana.com/api/1.0/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({ data: { ...data, projects: [projectGid] } }),
    });
    if (!res.ok) return { ok: false, reason: `asana_http_${res.status}` };
    const json = (await res.json()) as { data?: { gid?: string } };
    const gid = json.data?.gid;
    if (!gid) return { ok: false, reason: "asana_missing_task_gid" };
    const file = loadAsanaLinks();
    file.links.push(
      asanaLinkSchema.parse({
        kind: opts.kind,
        case_id: opts.id,
        task_gid: gid,
        project_gid: projectGid,
        last_pushed_at: new Date().toISOString(),
      }),
    );
    saveAsanaLinks(file);
    return { ok: true, task_gid: gid, created: true };
  }

  const res = await fetchImpl(`https://app.asana.com/api/1.0/tasks/${link.task_gid}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ data }),
  });
  if (!res.ok) return { ok: false, reason: `asana_http_${res.status}` };

  const file = loadAsanaLinks();
  const idx = file.links.findIndex((l) => l.kind === opts.kind && l.case_id === opts.id);
  if (idx >= 0) {
    file.links[idx] = { ...file.links[idx]!, last_pushed_at: new Date().toISOString() };
    saveAsanaLinks(file);
  }
  return { ok: true, task_gid: link.task_gid, created: false };
}

/** Ensure integrations.yaml can mention asana without requiring it. */
export function asanaConfiguredInIntegrations(): boolean {
  const integ = loadIntegrations();
  return Boolean(integ?.notes?.toLowerCase().includes("asana")) || asanaIntegrationStatus().configured;
}
