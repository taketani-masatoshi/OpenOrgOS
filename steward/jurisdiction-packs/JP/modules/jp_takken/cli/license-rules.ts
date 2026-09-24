import type {
  TakkenLicense,
  TakkenLicenseChange,
  TakkenLicensorKind,
  TakkenOffice,
  TakkenSecurity,
} from "../../../../../../schemas/jp-takken.js";
import type { TakkenCheckItem, TakkenVerdict as Verdict } from "./check-item.js";
import { addDays, daysBetween, periodEndByYears } from "./dates.js";

/** 宅地建物取引業法第3条第2項 — 免許の有効期間は5年 */
export const LICENSE_VALIDITY_YEARS = 5;
/** 宅地建物取引業法施行規則第3条 — 更新申請は有効期間満了の日の90日前から30日前まで */
export const RENEWAL_WINDOW_OPENS_DAYS_BEFORE = 90;
export const RENEWAL_WINDOW_CLOSES_DAYS_BEFORE = 30;
/** 宅地建物取引業法第9条 — 変更の届出は30日以内（民法第140条により初日不算入） */
export const CHANGE_NOTIFICATION_DAYS = 30;
/** 宅地建物取引業法施行令第2条の4 — 営業保証金: 主たる事務所1,000万円 · その他の事務所ごとに500万円 */
export const DEPOSIT_MAIN_OFFICE_YEN = 10_000_000;
export const DEPOSIT_BRANCH_OFFICE_YEN = 5_000_000;
/** 宅地建物取引業法施行令第7条 — 弁済業務保証金分担金: 主たる事務所60万円 · その他の事務所ごとに30万円 */
export const ASSOCIATION_MAIN_OFFICE_YEN = 600_000;
export const ASSOCIATION_BRANCH_OFFICE_YEN = 300_000;

const CHANGE_ITEM_LABELS: Record<TakkenLicenseChange["item"], string> = {
  trade_name: "商号又は名称（第4条第1項第1号）",
  officer: "役員・政令で定める使用人の氏名（同第2号）",
  office: "事務所の名称及び所在地（同第4号）",
  dedicated_takkenshi: "専任の宅地建物取引士の氏名（同第5号）",
  other: "その他",
};

export interface RenewalWindow {
  opens_on: string;
  closes_on: string;
}

export function renewalWindow(expiresOn: string): RenewalWindow {
  return {
    opens_on: addDays(expiresOn, -RENEWAL_WINDOW_OPENS_DAYS_BEFORE),
    closes_on: addDays(expiresOn, -RENEWAL_WINDOW_CLOSES_DAYS_BEFORE),
  };
}

/** 民法第143条 · 法第3条第5項 — 更新後の有効期間は従前の満了日の翌日から起算 */
export function expectedLicenseExpiry(validFrom: string): string {
  return periodEndByYears(validFrom, LICENSE_VALIDITY_YEARS);
}

export function evaluateLicenseValidityPeriod(license: TakkenLicense): TakkenCheckItem {
  const validFrom = license.valid_from ?? license.issued_on;
  const expected = expectedLicenseExpiry(validFrom);
  const consistent = expected === license.expires_on;
  return {
    id: "license-validity-period",
    label: "免許の有効期間（5年）",
    status: consistent ? "ok" : "needs_review",
    article: "法第3条第2項",
    detail: consistent
      ? `${validFrom} 〜 ${license.expires_on}`
      : `expires_on ${license.expires_on} ≠ 起算 ${validFrom} から5年 (${expected}) — 免許証を確認`,
  };
}

function appliedRenewalVerdict(appliedOn: string, window: RenewalWindow, expiresOn: string): Verdict {
  if (appliedOn > expiresOn) {
    return { status: "fail", detail: `満了日 ${expiresOn} 後の申請 (${appliedOn}) — 免許失効の可能性` };
  }
  if (appliedOn < window.opens_on) {
    return { status: "needs_review", detail: `受付期間開始 ${window.opens_on} より前の申請日 ${appliedOn} — 受理状況を確認` };
  }
  if (appliedOn > window.closes_on) {
    return { status: "fail", detail: `申請期限 ${window.closes_on} 経過後の申請 (${appliedOn})` };
  }
  return {
    status: "ok",
    detail: `申請済 ${appliedOn}（期間内）— 満了日までに処分がない場合は処分まで従前の免許が有効（法第3条第4項）`,
  };
}

function pendingRenewalVerdict(asOf: string, window: RenewalWindow, expiresOn: string): Verdict {
  if (asOf > expiresOn) {
    return { status: "fail", detail: `有効期間満了 ${expiresOn} · 更新申請記録なし — 免許失効の可能性` };
  }
  if (asOf > window.closes_on) {
    return { status: "fail", detail: `更新申請期限 ${window.closes_on} 経過 · 未申請（満了 ${expiresOn}）` };
  }
  if (asOf >= window.opens_on) {
    const remaining = daysBetween(asOf, window.closes_on);
    return { status: "warn", detail: `更新申請期間中 — 締切 ${window.closes_on}（残 ${remaining} 日）` };
  }
  const untilOpen = daysBetween(asOf, window.opens_on);
  return { status: "ok", detail: `更新申請期間 ${window.opens_on} 〜 ${window.closes_on}（開始まで ${untilOpen} 日）` };
}

export function evaluateLicenseRenewal(license: TakkenLicense, asOf: string): TakkenCheckItem {
  const window = renewalWindow(license.expires_on);
  const verdict = license.renewal_applied_on
    ? appliedRenewalVerdict(license.renewal_applied_on, window, license.expires_on)
    : pendingRenewalVerdict(asOf, window, license.expires_on);
  return {
    id: "license-renewal",
    label: "免許の更新申請（満了90日前〜30日前）",
    article: "法第3条第3項 · 施行規則第3条",
    ...verdict,
  };
}

export function requiredLicensorKind(offices: readonly TakkenOffice[]): TakkenLicensorKind {
  const prefectures = new Set(offices.map((office) => office.prefecture));
  return prefectures.size > 1 ? "minister" : "governor";
}

function licensorScopeVerdict(license: TakkenLicense, offices: readonly TakkenOffice[]): Verdict {
  if (offices.length === 0) return { status: "needs_review", detail: "offices.yaml に事務所がない" };
  const prefectures = [...new Set(offices.map((office) => office.prefecture))];
  const required = requiredLicensorKind(offices);
  if (required !== license.licensor_kind) {
    const target = required === "minister" ? "国土交通大臣免許" : "都道府県知事免許";
    return { status: "fail", detail: `事務所 ${prefectures.join("・")} → ${target} が必要（免許換え 法第7条）` };
  }
  if (license.licensor_kind === "minister") return { status: "ok", detail: `国土交通大臣 · ${prefectures.join("・")}` };
  if (!license.licensor_prefecture) {
    return { status: "needs_review", detail: "知事免許の licensor_prefecture が未設定" };
  }
  if (license.licensor_prefecture !== prefectures[0]) {
    return {
      status: "fail",
      detail: `免許権者 ${license.licensor_prefecture} ≠ 事務所所在 ${prefectures[0]}（免許換え 法第7条第1項第2号）`,
    };
  }
  return { status: "ok", detail: `${license.licensor_prefecture}知事 · 事務所 ${offices.length} か所` };
}

export function evaluateLicensorScope(license: TakkenLicense, offices: readonly TakkenOffice[]): TakkenCheckItem {
  return {
    id: "licensor-scope",
    label: "免許権者（2以上の都道府県に事務所 → 大臣）",
    article: "法第3条第1項",
    ...licensorScopeVerdict(license, offices),
  };
}

export function changeNotificationDeadline(changedOn: string): string {
  return addDays(changedOn, CHANGE_NOTIFICATION_DAYS);
}

function changeVerdict(change: TakkenLicenseChange, asOf: string): Verdict {
  if (change.item === "other") {
    return { status: "needs_review", detail: "第9条の届出対象（第4条第1項第1号〜第5号）か確認" };
  }
  const deadline = changeNotificationDeadline(change.changed_on);
  if (change.notified_on) {
    return change.notified_on <= deadline
      ? { status: "ok", detail: `届出 ${change.notified_on}（期限 ${deadline}）` }
      : { status: "fail", detail: `届出 ${change.notified_on} — 期限 ${deadline} 超過` };
  }
  if (asOf <= deadline) {
    return { status: "warn", detail: `未届出 — 期限 ${deadline}（残 ${daysBetween(asOf, deadline)} 日）` };
  }
  return { status: "fail", detail: `未届出 — 期限 ${deadline} 超過` };
}

export function evaluateChangeNotification(change: TakkenLicenseChange, asOf: string): TakkenCheckItem {
  return {
    id: `change-${change.id}`,
    label: `変更の届出 — ${CHANGE_ITEM_LABELS[change.item]}`,
    article: "法第9条",
    ...changeVerdict(change, asOf),
  };
}

export function requiredSecurityYen(method: TakkenSecurity["method"], offices: readonly TakkenOffice[]): number {
  const mainCount = offices.filter((office) => office.kind === "main").length;
  const branchCount = offices.filter((office) => office.kind === "branch").length;
  if (method === "deposit") return mainCount * DEPOSIT_MAIN_OFFICE_YEN + branchCount * DEPOSIT_BRANCH_OFFICE_YEN;
  return mainCount * ASSOCIATION_MAIN_OFFICE_YEN + branchCount * ASSOCIATION_BRANCH_OFFICE_YEN;
}

function securityArticle(method: TakkenSecurity["method"]): string {
  return method === "deposit" ? "法第25条 · 第26条 · 施行令第2条の4" : "法第64条の9 · 第64条の13 · 施行令第7条";
}

function securityAmountVerdict(security: TakkenSecurity, offices: readonly TakkenOffice[]): Verdict {
  const required = requiredSecurityYen(security.method, offices);
  if (security.amount_yen === undefined) {
    return { status: "needs_review", detail: `amount_yen 未記録 — 必要額 ${required.toLocaleString("ja-JP")} 円` };
  }
  if (security.amount_yen < required) {
    return {
      status: "fail",
      detail: `${security.amount_yen.toLocaleString("ja-JP")} 円 < 必要額 ${required.toLocaleString("ja-JP")} 円（事務所増設時の追加を確認）`,
    };
  }
  return { status: "ok", detail: `${security.amount_yen.toLocaleString("ja-JP")} 円 ≥ 必要額 ${required.toLocaleString("ja-JP")} 円` };
}

function securityTimingVerdict(security: TakkenSecurity): Verdict {
  if (!security.completed_on) {
    return { status: "fail", detail: "供託届出 / 保証協会加入日の記録なし — 事業開始前に必要" };
  }
  if (security.business_started_on && security.business_started_on < security.completed_on) {
    return { status: "fail", detail: `事業開始 ${security.business_started_on} が ${security.completed_on} より前` };
  }
  return { status: "ok", detail: `完了 ${security.completed_on}${security.provider_name ? ` · ${security.provider_name}` : ""}` };
}

export function evaluateSecurity(
  security: TakkenSecurity | undefined,
  offices: readonly TakkenOffice[]
): TakkenCheckItem[] {
  if (!security) {
    return [
      {
        id: "security-timing",
        label: "営業保証金の供託届出 / 保証協会への加入",
        status: "fail",
        article: "法第25条第5項 · 第64条の13",
        detail: "license.yaml に security の記録なし",
      },
    ];
  }
  const method = security.method === "deposit" ? "営業保証金" : "弁済業務保証金分担金";
  const article = securityArticle(security.method);
  return [
    { id: "security-amount", label: `${method}の額`, article, ...securityAmountVerdict(security, offices) },
    { id: "security-timing", label: `${method} — 事業開始前の完了`, article, ...securityTimingVerdict(security) },
  ];
}

export function evaluateLicenseChecks(input: {
  license: TakkenLicense;
  changes: readonly TakkenLicenseChange[];
  security: TakkenSecurity | undefined;
  offices: readonly TakkenOffice[];
  asOf: string;
}): TakkenCheckItem[] {
  return [
    evaluateLicenseValidityPeriod(input.license),
    evaluateLicenseRenewal(input.license, input.asOf),
    evaluateLicensorScope(input.license, input.offices),
    ...input.changes.map((change) => evaluateChangeNotification(change, input.asOf)),
    ...evaluateSecurity(input.security, input.offices),
  ];
}
