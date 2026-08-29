/**
 * LLM reply compose from verified fact pack only (never sends).
 */
import { z } from "zod";
import { findTriageEntry } from "./mail-triage-queue.js";
import { buildFactsVerify, type CorrespondenceClaim } from "./facts-verify.js";
import { createCorrespondenceDraft } from "./draft.js";
import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import { postLlmChat } from "../operator-runtime/llm-chat.js";
import { getLlmApiConfig, isLlmMockEnabled, type LlmApiConfig } from "../operator-runtime/llm-api.js";
import { withLlmWorker } from "../llm-pool/router.js";
import { hasConfiguredLlmWorkers } from "../llm-pool/registry.js";
import {
  applyLocalLlmErrorFallbackToSystem,
  formatLocalLlmMailErrorFallbackSuffix,
  isLocalLlmErrorFallbackEnabled,
  parseLocalLlmErrorReply,
} from "../operator-runtime/local-llm-error-fallback.js";
import { loadCorrespondenceStyle, resolveCorrespondenceLocale } from "./style-resolve.js";
import { DEFAULT_CORRESPONDENCE_AGENT_ID } from "./cli-labels.js";
import {
  assertCorrespondenceClaims,
  CorrespondenceClaimsError,
  extractAmounts,
  lineLooksLikeAmountAssertion,
} from "./claims-assert.js";
import { assertCorrespondenceStyleLint } from "./style-lint.js";

const composeResponseSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  claims_used: z.array(z.string()).default([]),
  attachment_refs: z.array(z.string()).default([]),
  next_action_due: z.string().optional(),
  unverified_notes: z.string().optional(),
});

export type ComposeResponse = z.output<typeof composeResponseSchema>;

const SYSTEM_PROMPT = `You draft a business reply email for OrgOS Mail Outbound.
Return JSON only with keys: subject, body, claims_used, attachment_refs, next_action_due, unverified_notes.
Rules:
- Never invent amounts, delivery dates, inventory, or lead times.
- If inventory/delivery claims are verified=false, do not mention 在庫・納期・出荷 at all.
- If a needed fact is missing, omit it from the body and put a note in unverified_notes.
- Do not include AI disclaimers, "自動送信", or sender-address explanations.
- Japanese business tone unless locale says otherwise.
- claims_used must list claim ids you relied on.`;

function buildUserPrompt(opts: {
  from: string;
  subject: string;
  claims: CorrespondenceClaim[];
  knowledge: Array<{ path: string; excerpt: string }>;
  forbidden: string[];
  locale: string;
}): string {
  return [
    `Locale: ${opts.locale}`,
    `Inbound From: ${opts.from}`,
    `Inbound Subject: ${opts.subject}`,
    "",
    "Verified claims (only source of numbers/dates):",
    JSON.stringify(
      opts.claims.filter((c) => c.verified),
      null,
      2,
    ),
    "",
    "Unverified claims (do not assert in body):",
    JSON.stringify(
      opts.claims.filter((c) => !c.verified),
      null,
      2,
    ),
    "",
    "Knowledge excerpts (L1):",
    JSON.stringify(opts.knowledge, null, 2),
    "",
    "Forbidden phrases:",
    opts.forbidden.join(", "),
  ].join("\n");
}

async function parseComposeContent(rawText: string): Promise<ComposeResponse | undefined> {
  if (parseLocalLlmErrorReply(rawText).isError) return undefined;
  try {
    return composeResponseSchema.parse(JSON.parse(rawText));
  } catch {
    return undefined;
  }
}

async function callComposeLlm(user: string): Promise<ComposeResponse | undefined> {
  if (!getLlmApiConfig() && !isLlmMockEnabled() && !hasConfiguredLlmWorkers()) {
    return undefined;
  }

  if (hasConfiguredLlmWorkers() || isLlmMockEnabled()) {
    try {
      return await withLlmWorker(async (lease) => {
        let systemContent = SYSTEM_PROMPT;
        if (lease.worker.tier === "local" && isLocalLlmErrorFallbackEnabled()) {
          systemContent =
            applyLocalLlmErrorFallbackToSystem(SYSTEM_PROMPT, "local") +
            formatLocalLlmMailErrorFallbackSuffix();
        }
        const res = await postLlmChat(
          [
            { role: "system", content: systemContent },
            { role: "user", content: user },
          ],
          {
            responseFormat: { type: "json_object" },
            temperature: 0.3,
            target: lease.target,
          },
        );
        if (!res.ok || !res.message || typeof res.message.content !== "string") {
          return undefined;
        }
        return parseComposeContent(res.message.content.trim());
      });
    } catch {
      return undefined;
    }
  }

  const cfg = getLlmApiConfig();
  if (!cfg) return undefined;
  const target: LlmApiConfig = cfg;
  const res = await postLlmChat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    { responseFormat: { type: "json_object" }, temperature: 0.3, target },
  );
  if (!res.ok || !res.message || typeof res.message.content !== "string") return undefined;
  return parseComposeContent(res.message.content.trim());
}

/** Deterministic compose when LLM is unavailable — exported for golden regression. */
export function buildDeterministicComposeReply(opts: {
  subject: string;
  claims: CorrespondenceClaim[];
  knowledge?: Array<{ path: string; excerpt: string }>;
}): ComposeResponse {
  const recipient = opts.claims.find((c) => c.kind === "recipient" && c.verified);
  const knowledgeLine = opts.knowledge?.[0]
    ? `参考資料: ${opts.knowledge[0].path}`
    : undefined;
  const lines = [
    recipient ? `${recipient.value} 様` : "ご担当者様",
    "",
    "お世話になっております。",
    "",
    "ご連絡ありがとうございます。内容を確認のうえ、改めてご連絡いたします。",
    knowledgeLine,
    "",
    "何卒よろしくお願い申し上げます。",
  ];
  const attachmentRefs =
    opts.knowledge
      ?.map((h) => h.path)
      .filter((p) => p.startsWith("docs/product/") || p.startsWith("docs/sales/"))
      .slice(0, 2) ?? [];
  return {
    subject: opts.subject.startsWith("Re:") ? opts.subject : `Re: ${opts.subject}`,
    body: lines
      .filter((l) => l != null)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    claims_used: opts.claims.filter((c) => c.verified).map((c) => c.id),
    attachment_refs: attachmentRefs,
    unverified_notes: "LLM unavailable — deterministic fallback draft",
  };
}

function fallbackCompose(opts: {
  subject: string;
  claims: CorrespondenceClaim[];
  knowledge?: Array<{ path: string; excerpt: string }>;
}): ComposeResponse {
  return buildDeterministicComposeReply(opts);
}

/** Strip lines that invent fulfillment or amounts not backed by verified claims. */
export function sanitizeComposeBody(body: string, claims: CorrespondenceClaim[]): string {
  const hasInv = claims.some((c) => c.kind === "inventory" && c.verified);
  const hasDel = claims.some((c) => c.kind === "delivery" && c.verified);
  const amountClaims = new Set(
    claims.filter((c) => c.kind === "amount" && c.verified).map((c) => c.value.replace(/,/g, "")),
  );

  let out = body
    .split(/\n/)
    .filter((line) => {
      if (!hasInv && /在庫|出荷可能/.test(line)) return false;
      if (!hasDel && /納期|リードタイム|lead\s*time/i.test(line)) return false;
      if (lineLooksLikeAmountAssertion(line)) {
        const amts = extractAmounts(line);
        if (!amts.length) return true;
        if (amountClaims.size === 0) return false;
        const ok = amts.every((amt) =>
          [...amountClaims].some((v) => v.includes(amt) || amt.includes(v)),
        );
        if (!ok) return false;
      }
      return true;
    })
    .join("\n");

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function enforceComposeClaims(
  compose: ComposeResponse,
  claims: CorrespondenceClaim[],
  to: string,
  contactRef?: string,
): ComposeResponse {
  const body = sanitizeComposeBody(compose.body, claims);
  const next = { ...compose, body };
  try {
    assertCorrespondenceClaims(
      {
        body: next.body,
        to,
        contact_ref: contactRef,
        attachment_refs: next.attachment_refs,
      },
      claims,
    );
    return next;
  } catch (e) {
    if (e instanceof CorrespondenceClaimsError) {
      throw new CorrespondenceClaimsError(
        `compose claims check failed: ${e.message}`,
      );
    }
    throw e;
  }
}

export interface ComposeCorrespondenceResult {
  draft: CorrespondenceDraft;
  approvalId?: string;
  compose: ComposeResponse;
  claims: CorrespondenceClaim[];
  usedLlm: boolean;
}

export async function composeCorrespondenceReply(opts: {
  mailId: string;
  caseId?: string;
  operator?: string;
  to?: string;
  contactRef?: string;
  proposeApproval?: boolean;
}): Promise<ComposeCorrespondenceResult> {
  const entry = findTriageEntry(opts.mailId);
  if (!entry) throw new Error(`Triage entry ${opts.mailId} not found`);

  const facts = buildFactsVerify({
    mailId: opts.mailId,
    caseId: opts.caseId,
    query: entry.subject,
  });

  const locale = resolveCorrespondenceLocale({ contactRef: opts.contactRef });
  const style = loadCorrespondenceStyle(locale);
  const user = buildUserPrompt({
    from: entry.from,
    subject: entry.subject,
    claims: facts.claims,
    knowledge: facts.knowledge_hits.map((h) => ({ path: h.path, excerpt: h.excerpt })),
    forbidden: style.forbidden_phrases ?? [],
    locale,
  });

  let compose = await callComposeLlm(user);
  let usedLlm = Boolean(compose);
  if (!compose) {
    compose = fallbackCompose({
      subject: entry.subject,
      claims: facts.claims,
      knowledge: facts.knowledge_hits.map((h) => ({ path: h.path, excerpt: h.excerpt })),
    });
    usedLlm = false;
  }

  const to = opts.to ?? facts.recipient_email;
  if (!to) {
    throw new Error(
      "宛先を解決できません — contact-ref を登録するか --to を指定してください",
    );
  }

  compose = enforceComposeClaims(compose, facts.claims, to, opts.contactRef);
  assertCorrespondenceStyleLint({
    body: compose.body,
    subject: compose.subject,
    contact_ref: opts.contactRef,
    notes: opts.caseId ? `case:${opts.caseId}` : undefined,
  });

  const caseId =
    opts.caseId ??
    (facts.case?.kind === "inquiry" || facts.case?.kind === "deal" ? facts.case.id : undefined);

  const notesParts = [
    `compose:mail=${opts.mailId}`,
    caseId ? `case:${caseId}` : "",
    facts.warnings.length ? `facts-warnings: ${facts.warnings.join("; ")}` : "",
    compose.unverified_notes ? `unverified: ${compose.unverified_notes}` : "",
    `claims-json:${JSON.stringify(facts.claims)}`,
  ].filter(Boolean);

  const { draft, approvalId } = createCorrespondenceDraft({
    channel: "email",
    to,
    subject: compose.subject,
    body: compose.body,
    createdBy: opts.operator ?? DEFAULT_CORRESPONDENCE_AGENT_ID,
    contactRef: opts.contactRef,
    attachmentRefs: compose.attachment_refs,
    notes: notesParts.join("\n"),
    proposeApproval: opts.proposeApproval !== false,
    inquiryId: caseId?.startsWith("INQ-") ? caseId : undefined,
    dealId: caseId?.startsWith("DEAL-") ? caseId : undefined,
  });

  return { draft, approvalId, compose, claims: facts.claims, usedLlm };
}
