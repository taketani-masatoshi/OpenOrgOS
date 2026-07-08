import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  REG008_LODGING_LIMITS,
  travelBookingRequestSchema,
  travelPortalsFileSchema,
  type DraftStatus,
  type PortalId,
  type TravelBookingRequest,
  type TravelPortal,
  type TravelPortalsFile,
  type TravelRole,
} from "../../../../schemas/travel-booking.js";
import { getModuleSeedDir } from "../../../../src/lib/modules.js";
import { resolveCorporateCoreReg } from "../../../../src/lib/jurisdiction.js";
import { currentDate, daysBetween, readYamlFile, readYamlFileRaw, resolveTenantPath } from "../../../../src/lib/utils.js";

export const TRAVEL_PORTALS_REL = "data/operations/travel-portals.yaml";
export const TRAVEL_PORTALS_EXAMPLE_REL = "data/operations/travel-portals.yaml.example";
export const TRAVEL_DRAFTS_REL = "docs/operations/travel-drafts";
export const TRAVEL_MODULE_ID = "travel_booking";

export type IntakeField =
  | "portal_id"
  | "destination"
  | "destination_area"
  | "check_in"
  | "check_out"
  | "guests";

export interface IntakeValidationResult {
  ok: boolean;
  missing: IntakeField[];
  errors: string[];
  request?: TravelBookingRequest;
}

export interface Reg008CheckResult {
  lodgingLimit: number;
  budgetMax?: number;
  lodgingOk: boolean;
  needsApproval: boolean;
  messages: string[];
}

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function travelPortalsPath(): string {
  return resolveTenantPath(TRAVEL_PORTALS_REL);
}

export function travelPortalsExamplePath(): string {
  return resolveTenantPath(TRAVEL_PORTALS_EXAMPLE_REL);
}

export function moduleTravelPortalsExamplePath(): string {
  return join(getModuleSeedDir(TRAVEL_MODULE_ID), "travel-portals.yaml.example");
}

export function loadTravelPortals(): TravelPortalsFile | null {
  const paths = [travelPortalsPath(), travelPortalsExamplePath(), moduleTravelPortalsExamplePath()];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    return readYamlFile(path, travelPortalsFileSchema);
  }
  return null;
}

export function getTravelPortal(portalId: PortalId, file = loadTravelPortals()): TravelPortal | undefined {
  return file?.portals.find((p) => p.id === portalId);
}

export function resolveDefaultPortalId(file = loadTravelPortals()): PortalId {
  if (!file) return "rakuten-travel";
  return file.default_portal;
}

export function getReg008LodgingLimit(role: TravelRole = "executive"): number {
  return REG008_LODGING_LIMITS[role];
}

export function computeNights(checkIn: string, checkOut: string): number {
  const nights = daysBetween(checkIn, checkOut);
  if (nights <= 0) {
    throw new Error("check_out は check_in より後の日付にしてください");
  }
  return nights;
}

export function formatJapaneseWeekday(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return WEEKDAYS_JA[d.getDay()];
}

export function formatJapaneseDateWithWeekday(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  return `${y}年${m}月${day}日（${formatJapaneseWeekday(iso)}）`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "trip";
}

export function buildDraftSlug(destination: string, explicit?: string): string {
  return explicit ?? slugify(destination);
}

export function parseTravelRequestInput(raw: unknown): TravelBookingRequest {
  return travelBookingRequestSchema.parse(raw);
}

export function loadTravelRequestFromFile(path: string): TravelBookingRequest {
  return parseTravelRequestInput(readYamlFileRaw(path));
}

export function validateTravelIntake(input: Partial<TravelBookingRequest>): IntakeValidationResult {
  const missing: IntakeField[] = [];
  const errors: string[] = [];

  if (!input.portal_id) missing.push("portal_id");
  if (!input.destination?.trim()) missing.push("destination");
  if (!input.destination_area?.trim()) missing.push("destination_area");
  if (!input.check_in) missing.push("check_in");
  if (!input.check_out) missing.push("check_out");
  if (input.guests == null || input.guests < 1) missing.push("guests");

  if (missing.length) {
    return { ok: false, missing, errors };
  }

  try {
    const request = parseTravelRequestInput({
      portal_id: input.portal_id,
      trip_type: input.trip_type ?? "hotel",
      destination: input.destination,
      destination_area: input.destination_area,
      check_in: input.check_in,
      check_out: input.check_out,
      guests: input.guests ?? 1,
      budget_max: input.budget_max,
      trip_purpose: input.trip_purpose,
      room_preference: input.room_preference,
      traveler_role: input.traveler_role ?? "executive",
      status: input.status ?? "draft",
      slug: input.slug,
    });

    const nights = computeNights(request.check_in, request.check_out);
    if (nights > 30) {
      errors.push("泊数が 30 泊を超えています — 分割手配または段へ確認");
    }

    const portal = getTravelPortal(request.portal_id);
    if (!portal) {
      errors.push(`portal_id ${request.portal_id} が travel-portals にありません`);
    } else if (!portal.supported_trip_types.includes(request.trip_type)) {
      errors.push(`${portal.name} は trip_type=${request.trip_type} 非対応`);
    }

    if (errors.length) {
      return { ok: false, missing: [], errors, request };
    }

    return { ok: true, missing: [], errors: [], request };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { ok: false, missing: [], errors };
  }
}

export function checkReg008Compliance(opts: {
  role?: TravelRole;
  budgetMax?: number;
  tripType?: TravelBookingRequest["trip_type"];
  flightPreApproved?: boolean;
}): Reg008CheckResult {
  const role = opts.role ?? "executive";
  const lodgingLimit = getReg008LodgingLimit(role);
  const budgetMax = opts.budgetMax ?? lodgingLimit;
  const lodgingOk = budgetMax <= lodgingLimit;
  const needsApproval = !lodgingOk;
  const messages: string[] = [];

  if (needsApproval) {
    messages.push(`宿泊上限 ${lodgingLimit.toLocaleString()}円/泊を超過 — 要承認`);
  } else {
    messages.push(`宿泊上限 ${lodgingLimit.toLocaleString()}円/泊以内`);
  }

  if (opts.tripType === "flight" || opts.tripType === "package") {
    if (opts.flightPreApproved) {
      messages.push("航空機: 事前合意済");
    } else {
      messages.push("航空機: 事前合意要確認");
    }
  }

  return { lodgingLimit, budgetMax, lodgingOk, needsApproval, messages };
}

export function buildRakutenSearchUrl(opts: {
  checkIn: string;
  checkOut: string;
  guests?: number;
  budgetMax?: number;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}): string {
  const [ciY, ciM, ciD] = opts.checkIn.split("-");
  const [coY, coM, coD] = opts.checkOut.split("-");
  const params = new URLSearchParams({
    f_nen1: ciY,
    f_tuki1: String(Number(ciM)),
    f_hi1: String(Number(ciD)),
    f_nen2: coY,
    f_tuki2: String(Number(coM)),
    f_hi2: String(Number(coD)),
    f_otona_su: String(opts.guests ?? 1),
    f_tab: "list",
  });
  if (opts.budgetMax) params.set("f_kin", String(opts.budgetMax));
  if (opts.latitude != null && opts.longitude != null) {
    params.set("f_latitude", String(opts.latitude));
    params.set("f_longitude", String(opts.longitude));
    params.set("f_km", String(opts.radiusKm ?? 2.5));
  }
  return `https://search.travel.rakuten.co.jp/ds/vacant/searchVacant?${params.toString()}`;
}

export function formatIntakeReport(result: IntakeValidationResult): string {
  if (result.ok && result.request) {
    const r = result.request;
    const nights = computeNights(r.check_in, r.check_out);
    const reg = checkReg008Compliance({
      role: r.traveler_role,
      budgetMax: r.budget_max,
      tripType: r.trip_type,
    });
    const travelRegId = resolveCorporateCoreReg("travel");
    return [
      "✓ ヒアリング必須項目 — 確定",
      "",
      `portal_id: ${r.portal_id}`,
      `trip_type: ${r.trip_type}`,
      `destination: ${r.destination} · ${r.destination_area}`,
      `check_in: ${r.check_in} → check_out: ${r.check_out}（${nights} 泊）`,
      `guests: ${r.guests}`,
      `budget_max: ${(r.budget_max ?? reg.lodgingLimit).toLocaleString()}円/泊`,
      "",
      `${travelRegId}:`,
      ...reg.messages.map((m) => `- ${m}`),
      "",
      "→ browser 手順（travel_booking Skill Step 1）へ進行可",
    ].join("\n");
  }

  const lines = ["✗ ヒアリング未完了 — browser 禁止", ""];
  if (result.missing.length) {
    lines.push("不足項目:");
    for (const field of result.missing) {
      lines.push(`  - ${field}`);
    }
  }
  if (result.errors.length) {
    lines.push("", "エラー:");
    for (const err of result.errors) {
      lines.push(`  - ${err}`);
    }
  }
  lines.push("", "Step 0（travel_booking Skill）で 1 回にまとめて確認してください。");
  return lines.join("\n");
}

export function generateTravelDraftMarkdown(
  request: TravelBookingRequest,
  opts?: { intakeDate?: string; searchUrl?: string }
): string {
  const nights = computeNights(request.check_in, request.check_out);
  const reg = checkReg008Compliance({
    role: request.traveler_role,
    budgetMax: request.budget_max,
    tripType: request.trip_type,
    flightPreApproved: false,
  });
  const portal = getTravelPortal(request.portal_id);
  const budget = request.budget_max ?? reg.lodgingLimit;
  const intakeDate = opts?.intakeDate ?? currentDate();
  const lodgingFlag = reg.needsApproval ? "要承認" : "OK";
  const flightFlag =
    request.trip_type === "flight" || request.trip_type === "package" ? "要確認" : "—";
  const searchLine = opts?.searchUrl
    ? `- **検索一覧:** ${opts.searchUrl}`
    : "- **検索一覧:** （browser 手順で生成）";
  const travelRegId = resolveCorporateCoreReg("travel");

  return `# 旅行手配ドラフト — ${intakeDate}

**Status:** ${request.status as DraftStatus}  
**Portal:** ${request.portal_id}  
**Skill:** travel_booking · **Agent:** Operations  
**規程:** ${travelRegId} 旅費規程

---

## 依頼概要

| 項目 | 値 |
|------|-----|
| 出張者 | ${request.traveler_role === "executive" ? "代表取締役" : "従業員"} |
| 目的 | ${request.trip_purpose ?? "（業務目的 · 1 行）"} |
| 行先 | ${request.destination} · ${request.destination_area} |
| チェックイン | ${formatJapaneseDateWithWeekday(request.check_in)} |
| チェックアウト | ${formatJapaneseDateWithWeekday(request.check_out)} |
| 泊数 | ${nights} 泊 |
| 人数 | ${request.guests} |
| 予算上限 | ${budget.toLocaleString()}円/泊（REG-008 照合） |
| 部屋 | ${request.room_preference ?? "禁煙シングル"} |
| ヒアリング確定日 | ${intakeDate} |

## 規程適合（${travelRegId}）

| チェック | 結果 |
|---------|:----:|
| 宿泊上限 ${reg.lodgingLimit.toLocaleString()}円/泊（${request.traveler_role === "executive" ? "代表" : "従業員"}） | ${lodgingFlag} |
| 航空機（該当時） | ${flightFlag} |
| 出張定義（宿泊・50km+） | OK |

## 候補比較（最大 3 件）

| # | 施設・便名 | 料金（税込） | キャンセル | 規程 | 備考 |
|---|-----------|------------|-----------|:----:|------|
| 1 | | | | OK | |
| 2 | | | | OK | |
| 3 | | | | | |

**推奨:** 候補 # — （browser 手順後に記載）

## ブラウザ到達点

${searchLine}
- **ポータル:** ${portal?.name ?? request.portal_id}（${portal?.url ?? ""}）
- **スクリーンショット:** \`scratch/travel/\` またはチャット添付
- **停止理由:** 決済ボタン直前 · 段承認待ち

## 段のアクション（最大 3 件）

1. 候補 # を確認 · 問題なければブラウザで **決済・予約確定**（Agent は実行しない）
2. 完了後 Secretary へ「カレンダー登録」依頼（type: travel）
3. 帰着後 14 日以内 · 出張報告書（REG-008 第8条）

---

*生成: steward operations travel draft · travel_booking モジュール · L2 値禁止*
`;
}

export function travelDraftPath(slug: string, date = currentDate()): string {
  return resolveTenantPath(`${TRAVEL_DRAFTS_REL}/${date}-${slug}.md`);
}

export function writeTravelDraft(
  request: TravelBookingRequest,
  opts?: { intakeDate?: string; searchUrl?: string; dryRun?: boolean }
): { path: string; content: string; written: boolean } {
  const slug = buildDraftSlug(request.destination, request.slug);
  const content = generateTravelDraftMarkdown(request, opts);
  const path = travelDraftPath(slug, opts?.intakeDate ?? currentDate());

  if (opts?.dryRun) {
    return { path, content, written: false };
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
  return { path, content, written: true };
}
