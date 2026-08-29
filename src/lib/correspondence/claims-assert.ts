/**
 * Assert outbound body amounts/dates match verified claims.
 * Recipient registry is required for all external email drafts/sends.
 */
import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import type { CorrespondenceClaim } from "./facts-verify.js";
import { isAttachmentPathAllowlisted } from "./knowledge-search.js";
import { resolveEmailFromContactRef, resolveSenderByEmail } from "../secretary/contact-registry.js";

export class CorrespondenceClaimsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorrespondenceClaimsError";
  }
}

/** Normalize full-width digits and collapse obfuscated spacing for scans. */
export function normalizeCorrespondenceBody(body: string): string {
  let out = body.replace(/[\uFF10-\uFF19]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
  );
  out = out.replace(/[￥]/g, "¥");
  return out;
}

/** Collapse whitespace between CJK chars to catch 「在 庫」 style obfuscation. */
function bodyForFulfillmentScan(body: string): string {
  return normalizeCorrespondenceBody(body).replace(/\s+/g, "");
}

/** Currency marker, comma groups, 万円, or explicit 円 — bare IDs / years ignored. */
const AMOUNT_RE =
  /(?:¥|￥|\$)\s*(\d{1,3}(?:,\d{3})+|\d+)|(\d{1,3}(?:,\d{3})+)(?!\d)|(\d+)\s*(?:円|万円|man)(?!\w)|(\d{1,6})\s*万(?:円)?/gi;
const DATE_ISO_RE = /\d{4}-\d{2}-\d{2}/g;
const DATE_JA_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
const FULFILLMENT_RE =
  /在庫|納期|出荷(?:可能)?|配送(?:予定)?|リードタイム|lead\s*time|inventory|stock\s*(?:level|qty)?/i;
const AMOUNT_LINE_RE =
  /(?:¥|￥|\$)\s*\d|\d{1,3}(?:,\d{3})+|\d+\s*(?:円|万円|man)|\d+\s*万(?:円)?/i;

function verifiedValues(claims: CorrespondenceClaim[], kind: CorrespondenceClaim["kind"]): Set<string> {
  return new Set(
    claims.filter((c) => c.kind === kind && c.verified).map((c) => c.value),
  );
}

function hasVerified(claims: CorrespondenceClaim[], kind: CorrespondenceClaim["kind"]): boolean {
  return claims.some((c) => c.kind === kind && c.verified);
}

function normalizeAmountToken(raw: string): string {
  return raw.replace(/,/g, "").replace(/万円/g, "0000").replace(/円|man/gi, "").trim();
}

/** Extract monetary amounts (requires currency unit, 万, or thousands separators). */
export function extractAmounts(body: string): string[] {
  const normalized = normalizeCorrespondenceBody(body);
  const out: string[] = [];
  for (const m of normalized.matchAll(AMOUNT_RE)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    if (!raw) continue;
    const digits = raw.replace(/,/g, "");
    if (/^\d{4}$/.test(digits) && Number(digits) >= 1900 && Number(digits) <= 2100) {
      continue;
    }
    if (!digits || Number(digits) === 0) continue;
    // 100万円 → amount_man-style token (matches band / amount_man claims)
    if (m[4]) {
      out.push(digits);
      continue;
    }
    out.push(digits);
  }
  return [...new Set(out)];
}

function amountMatchesClaim(amt: string, claimValue: string): boolean {
  const a = normalizeAmountToken(amt);
  const v = normalizeAmountToken(claimValue);
  if (!a || !v) return false;
  if (v.includes(a) || a.includes(v)) return true;
  const band = v.match(/^(\d+)\s*[-~〜]\s*(\d+)$/);
  if (band) {
    return a === band[1] || a === band[2] || a === `${band[1]}0000` || a === `${band[2]}0000`;
  }
  return false;
}

function jaDateToIsoHint(month: string, day: string, yearHint?: string): string {
  const y = yearHint ?? new Date().getUTCFullYear().toString();
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/**
 * If body mentions amounts/dates, each must appear in verified claims.
 * Inventory / delivery language requires verified inventory / delivery claims.
 */
export function assertCorrespondenceClaims(
  draft: Pick<CorrespondenceDraft, "body" | "to" | "contact_ref" | "attachment_refs">,
  claims: CorrespondenceClaim[],
  opts?: { requireRecipient?: boolean },
): void {
  const body = draft.body ?? "";
  const amountClaims = verifiedValues(claims, "amount");

  for (const amt of extractAmounts(body)) {
    if (amountClaims.size === 0) {
      throw new CorrespondenceClaimsError(
        `本文に金額「${amt}」がありますが、承認済み claims がありません`,
      );
    }
    const ok = [...amountClaims].some((v) => amountMatchesClaim(amt, v));
    if (!ok) {
      throw new CorrespondenceClaimsError(
        `本文の金額「${amt}」が verified claims と一致しません`,
      );
    }
  }

  assertDatesAgainstClaims(body, claims);
  assertFulfillmentLanguage(body, claims);
  if (opts?.requireRecipient !== false) {
    assertRecipientRegistered(draft);
  }
  assertAttachmentsAllowlisted(draft.attachment_refs ?? []);
}

/** ISO and Japanese dates must match verified date/delivery claims when those exist. */
export function assertDatesAgainstClaims(body: string, claims: CorrespondenceClaim[]): void {
  const dateClaims = verifiedValues(claims, "date");
  const deliveryClaims = verifiedValues(claims, "delivery");
  if (dateClaims.size === 0 && deliveryClaims.size === 0) return;

  const allowed = new Set([...dateClaims, ...deliveryClaims]);
  for (const iso of body.matchAll(DATE_ISO_RE)) {
    const value = iso[0]!;
    const ok = [...allowed].some((v) => v.includes(value) || value.includes(v));
    if (!ok) {
      throw new CorrespondenceClaimsError(
        `本文の日付「${value}」が verified claims と一致しません`,
      );
    }
  }

  const yearHint = [...allowed].map((v) => v.match(/\d{4}/)?.[0]).find(Boolean);
  for (const m of body.matchAll(DATE_JA_RE)) {
    const hint = jaDateToIsoHint(m[1]!, m[2]!, yearHint);
    const ok = [...allowed].some((v) => {
      if (v.includes(hint)) return true;
      const jm = v.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
      if (jm && jm[1] === m[1] && jm[2] === m[2]) return true;
      const iso = v.match(/\d{4}-(\d{2})-(\d{2})/);
      if (iso && Number(iso[1]) === Number(m[1]) && Number(iso[2]) === Number(m[2])) return true;
      return false;
    });
    if (!ok) {
      throw new CorrespondenceClaimsError(
        `本文の日付「${m[0]}」が verified claims と一致しません`,
      );
    }
  }
}

/** Reject inventory/delivery assertions unless verified claims exist. */
export function assertFulfillmentLanguage(body: string, claims: CorrespondenceClaim[]): void {
  const scan = bodyForFulfillmentScan(body);
  if (!FULFILLMENT_RE.test(body) && !FULFILLMENT_RE.test(scan)) return;
  if (/在庫|出荷|配送|inventory|stock/i.test(body + scan) && !hasVerified(claims, "inventory")) {
    throw new CorrespondenceClaimsError(
      "在庫・出荷の記述がありますが、inventory claim が未確認です",
    );
  }
  if (/納期|リードタイム|lead\s*time/i.test(body + scan) && !hasVerified(claims, "delivery")) {
    throw new CorrespondenceClaimsError(
      "納期の記述がありますが、delivery claim が未確認です",
    );
  }
}

/**
 * Amounts in body always require verified amount claims (even without claims-json pack).
 */
export function assertAmountsRequireVerifiedClaims(
  body: string,
  claims: CorrespondenceClaim[],
): void {
  const amounts = extractAmounts(body);
  if (!amounts.length) return;
  const amountClaims = verifiedValues(claims, "amount");
  if (amountClaims.size === 0) {
    throw new CorrespondenceClaimsError(
      `本文に金額「${amounts[0]}」がありますが、承認済み amount claim がありません`,
    );
  }
  for (const amt of amounts) {
    const ok = [...amountClaims].some((v) => amountMatchesClaim(amt, v));
    if (!ok) {
      throw new CorrespondenceClaimsError(
        `本文の金額「${amt}」が verified claims と一致しません`,
      );
    }
  }
}

/** True when a line looks like it asserts a monetary amount. */
export function lineLooksLikeAmountAssertion(line: string): boolean {
  return AMOUNT_LINE_RE.test(line);
}

export function assertRecipientRegistered(
  draft: Pick<CorrespondenceDraft, "to" | "contact_ref">,
): void {
  if (draft.contact_ref) {
    const email = resolveEmailFromContactRef(draft.contact_ref);
    if (!email) {
      throw new CorrespondenceClaimsError(
        `contact_ref ${draft.contact_ref} に email がありません`,
      );
    }
    if (draft.to && draft.to.toLowerCase() !== email.toLowerCase()) {
      throw new CorrespondenceClaimsError(
        `to (${draft.to}) が contact_ref email (${email}) と一致しません`,
      );
    }
    return;
  }
  if (!draft.to) {
    throw new CorrespondenceClaimsError("宛先 to がありません");
  }
  const email = draft.to.trim().toLowerCase();
  const resolved = resolveSenderByEmail(email);
  if (!resolved.known) {
    throw new CorrespondenceClaimsError(
      `宛先 ${draft.to} が external-contacts に未登録です`,
    );
  }
}

export function assertAttachmentsAllowlisted(refs: string[]): void {
  for (const ref of refs) {
    if (!isAttachmentPathAllowlisted(ref)) {
      throw new CorrespondenceClaimsError(
        `添付パスが許可されていません: ${ref}`,
      );
    }
  }
}

export function assertOutboundSlackDraft(
  draft: Pick<
    CorrespondenceDraft,
    "body" | "slack_channel" | "attachment_refs" | "notes" | "channel"
  >,
): void {
  if (draft.channel && draft.channel !== "slack") return;
  if (!draft.slack_channel?.trim()) {
    throw new CorrespondenceClaimsError("slack channel が未指定です");
  }
  assertAttachmentsAllowlisted(draft.attachment_refs ?? []);
  const claims = parseClaimsFromDraftNotes(draft.notes);
  const bodyDraft = {
    body: draft.body,
    to: undefined,
    contact_ref: undefined,
    attachment_refs: draft.attachment_refs,
  };
  if (claims.length > 0) {
    assertCorrespondenceClaims(bodyDraft, claims, { requireRecipient: false });
  } else {
    assertFulfillmentLanguage(draft.body ?? "", []);
    assertAmountsRequireVerifiedClaims(draft.body ?? "", []);
  }
}

/**
 * Draft-time / send-time gate for email and slack outbound.
 */
export function assertOutboundCorrespondenceDraft(
  draft: Pick<
    CorrespondenceDraft,
    | "body"
    | "to"
    | "contact_ref"
    | "attachment_refs"
    | "notes"
    | "channel"
    | "slack_channel"
  >,
): void {
  if (draft.channel === "slack") {
    assertOutboundSlackDraft(draft);
    return;
  }
  assertOutboundEmailDraft(draft);
}

/**
 * Draft-time / send-time gate for all external email.
 * Recipient is always required. Amounts and fulfillment language always gated.
 * Claims pack (when present) is fully checked.
 */
export function assertOutboundEmailDraft(
  draft: Pick<CorrespondenceDraft, "body" | "to" | "contact_ref" | "attachment_refs" | "notes" | "channel">,
): void {
  if (draft.channel && draft.channel !== "email") return;
  assertRecipientRegistered(draft);
  assertAttachmentsAllowlisted(draft.attachment_refs ?? []);
  const claims = parseClaimsFromDraftNotes(draft.notes);
  if (claims.length > 0) {
    assertCorrespondenceClaims(draft, claims);
  } else {
    assertFulfillmentLanguage(draft.body ?? "", []);
    assertAmountsRequireVerifiedClaims(draft.body ?? "", []);
  }
}

/** Parse claims JSON from draft notes (compose stores them). */
export function parseClaimsFromDraftNotes(notes?: string): CorrespondenceClaim[] {
  if (!notes) return [];
  const m = notes.match(/claims-json:(\[[\s\S]*?\])(?:\n|$)/);
  if (!m?.[1]) return [];
  try {
    return JSON.parse(m[1]) as CorrespondenceClaim[];
  } catch {
    return [];
  }
}
