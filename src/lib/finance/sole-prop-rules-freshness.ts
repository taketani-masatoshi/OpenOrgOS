/**
 * Jurisdiction pack rule freshness for sole-prop blue return (review debt signal).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { getInstallRoot } from "../tenant.js";

export type RulesFreshnessIssue = {
  level: "error" | "warning";
  file: string;
  message: string;
};

type FreshnessDoc = {
  reviewed_on?: string;
  review_interval_months?: number;
  notes?: string;
};

const REL =
  "steward/jurisdiction-packs/JP/modules/jp_sole_proprietor_blue_return/rules-freshness.yaml";

export function assessRulesFreshness(asOf = new Date()): RulesFreshnessIssue[] {
  const path = join(getInstallRoot(), REL);
  if (!existsSync(path)) {
    return [
      {
        level: "warning",
        file: REL,
        message: "rules-freshness.yaml 未配置（法令レビュー日付の追跡なし）",
      },
    ];
  }
  const doc = YAML.parse(readFileSync(path, "utf-8")) as FreshnessDoc;
  if (!doc.reviewed_on || !/^\d{4}-\d{2}-\d{2}$/.test(doc.reviewed_on)) {
    return [
      {
        level: "warning",
        file: REL,
        message: "reviewed_on 未設定 — 年次で税務ルールを見直すこと",
      },
    ];
  }
  const months = doc.review_interval_months ?? 18;
  const reviewed = new Date(`${doc.reviewed_on}T00:00:00Z`);
  const due = new Date(reviewed);
  due.setUTCMonth(due.getUTCMonth() + months);
  if (asOf.getTime() > due.getTime()) {
    return [
      {
        level: "warning",
        file: REL,
        message: `法令レビュー期限超過（reviewed_on=${doc.reviewed_on} · 間隔 ${months} か月）`,
      },
    ];
  }
  return [];
}
