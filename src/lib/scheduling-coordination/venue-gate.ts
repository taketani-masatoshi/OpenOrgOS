import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { findVenueReservation } from "../venue-booking/store.js";

/** CEO 中間ゲート — 店舗名未確定（提案/確定前） */
export const SCHEDULE_VENUE_PENDING = "schedule_venue_pending";

/** 確定通知前 — VR 予約番号（external_ref）未記録 */
export const SCHEDULE_VENUE_RESERVATION_PENDING = "schedule_venue_reservation_pending";

const AREA_ONLY =
  /^(京都|東京|大阪|名古屋|福岡|札幌|横浜|神戸|銀座|渋谷|新宿|梅田|難波|名古屋駅|京都駅|東京駅|エリア|周辺|付近)/;
const VENUE_MARKERS =
  /(店|亭|屋|館|楼|庵|厨|飯店|ホテル|Hotel|レストラン|Restaurant|Dining|Bistro|Cafe|Café|Bar|焼肉|寿司|鮨|天ぷら|うどん|そば|ラーメン|割烹|料亭)/i;
const AREA_HINT = /周辺|付近|エリア|近辺|市内|区内|周辺で|near\b|area\b/i;

/**
 * 店名比較用正規化（全角半角・空白・括弧注釈を除去）。
 */
export function normalizeVenueName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s　・･.．,，、]+/g, "")
    .toLowerCase();
}

/** 第一候補と案 A/B/C の表記ゆれを許容して一致判定 */
export function venueNamesMatch(a: string, b: string): boolean {
  const na = normalizeVenueName(a);
  const nb = normalizeVenueName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // 短い側が3文字以上なら部分一致を許す（「花遊膳」vs「北大路 花遊膳」）
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 3 && longer.includes(shorter);
}

/**
 * location に店舗レベルの固有名があるか。
 * エリアのみ・「追って連絡」・空は未確定扱い。
 */
export function hasNamedVenue(location: string | undefined): boolean {
  const value = location?.trim() ?? "";
  if (!value) return false;
  if (/追って/.test(value)) return false;
  if (/^(未定|TBD|tbd|未設定)$/i.test(value)) return false;
  if (/^(ご相談|相談|任意)$/.test(value)) return false;

  // 英語エリアのみ（Ginza / Tokyo area）
  if (/^(ginza|tokyo|osaka|kyoto|shibuya|shinjuku)(\s+area)?$/i.test(value)) {
    return false;
  }

  // エリアのみ（周辺・付近・市内 等で短文）は店舗名なしとみなす
  if (AREA_ONLY.test(value) && value.length <= 14 && !VENUE_MARKERS.test(value)) {
    return false;
  }
  if (AREA_HINT.test(value) && !VENUE_MARKERS.test(value) && value.length <= 20) {
    return false;
  }

  // ラテン店名（3文字以上 · スペース可）は店舗扱い
  if (/^[A-Za-z0-9][A-Za-z0-9 &'’-]{2,}$/.test(value) && !AREA_HINT.test(value)) {
    return true;
  }

  return value.length >= 2 && (!AREA_ONLY.test(value) || VENUE_MARKERS.test(value) || value.length > 14);
}

/**
 * 対面かつ店舗名未確定で、社外提案送信または確定に進む前に CEO / Venue ゲートが必要か。
 */
export function caseNeedsVenueResolution(
  caseRow: Pick<
    SchedulingCase,
    | "meeting_format"
    | "location"
    | "status"
    | "pending_slot_id"
    | "proposed_slots"
    | "exception_reason"
  >
): boolean {
  if (caseRow.meeting_format !== "in_person") return false;
  if (caseRow.status === "cancelled" || caseRow.status === "closed") return false;
  if (hasNamedVenue(caseRow.location)) return false;

  // 確定〜通知
  if (caseRow.status === "confirmed" || caseRow.status === "notifying") {
    return true;
  }

  // 既に会場ゲート中、または枠仮確定後の確定フロー
  if (caseRow.status === "awaiting_ceo") {
    if (caseRow.exception_reason === SCHEDULE_VENUE_PENDING) return true;
    if (caseRow.pending_slot_id) return true;
    return false;
  }

  // 候補が出たあとの初回提案送信前 — 「追って連絡」だけでは send 不可
  if (
    caseRow.proposed_slots.length > 0 &&
    (caseRow.status === "open" || caseRow.status === "proposing")
  ) {
    return true;
  }

  return false;
}

/** 対面 · 確定通知前に VR が confirmed + external_ref 必須（本番相当） */
export function caseNeedsVenueReservationForConfirm(
  caseRow: Pick<
    SchedulingCase,
    "meeting_format" | "status" | "venue_reservation_id" | "location"
  >
): boolean {
  if (caseRow.meeting_format !== "in_person") return false;
  if (caseRow.status !== "confirmed" && caseRow.status !== "notifying") return false;
  if (!hasNamedVenue(caseRow.location)) return false;
  if (!caseRow.venue_reservation_id) return true;
  const vr = findVenueReservation(caseRow.venue_reservation_id);
  if (!vr) return true;
  return vr.status !== "confirmed" || !vr.external_ref?.trim();
}

/** 会場案メモ（notes）に A/B/C が揃っているか（先読み 3 案 · レガシー） */
export function hasVenueOptionTrio(notes: string | undefined): boolean {
  const text = notes ?? "";
  return (
    /会場案\s*A[:：]/i.test(text) &&
    /会場案\s*B[:：]/i.test(text) &&
    /会場案\s*C[:：]/i.test(text)
  );
}
