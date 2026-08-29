/**
 * CEO projection over every recurring compliance obligation (L1).
 *
 * Permit obligations live in the jp_permit_registry ledgers; medical-device
 * QMS and GVP coverage is derived from their own portfolios. This merges both
 * so the owner sees one list instead of per-module screens.
 */
import {
  permitObligationInstancesFileSchema,
  permitObligationsCatalogFileSchema,
} from "../../../schemas/jp-permit-registry.js";
import { CEO_ATTENTION_CANVAS_DEFAULTS } from "../attention/index.js";
import { buildGvpPortfolio } from "../medical-device/gvp-portfolio.js";
import { buildQmsPortfolio } from "../medical-device/qms-portfolio.js";
import { loadModuleDataFile } from "../module-business-data.js";
import { currentDate } from "../utils.js";

const PERMIT_REGISTRY_MODULE = "jp_permit_registry";

export type ObligationSource = "permit" | "qms" | "gvp";

export type ObligationPortfolioRow = {
  id: string;
  source: ObligationSource;
  /** Permit id for permit rows; the compliance type id for qms/gvp rows. */
  permit_id: string;
  title: string;
  status: string;
  due?: string;
  next_action: string;
  attention_score: number;
};

export type ObligationsPortfolio = {
  as_of: string;
  rows: ObligationPortfolioRow[];
  stats: {
    permit_open: number;
    permit_overdue: number;
    qms_missing: number;
    gvp_missing: number;
  };
};

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(to) - Date.parse(from);
  return Math.round(ms / 86_400_000);
}

function permitRows(today: string): {
  rows: ObligationPortfolioRow[];
  open: number;
  overdue: number;
} {
  const catalog = loadModuleDataFile(
    PERMIT_REGISTRY_MODULE,
    "obligations-catalog.yaml",
    permitObligationsCatalogFileSchema
  );
  const instances = loadModuleDataFile(
    PERMIT_REGISTRY_MODULE,
    "obligation-instances.yaml",
    permitObligationInstancesFileSchema
  );
  if (!instances) return { rows: [], open: 0, overdue: 0 };

  const titles = new Map(
    (catalog?.data.obligations ?? []).map((o) => [o.id, o.title])
  );
  const rows: ObligationPortfolioRow[] = [];
  let open = 0;
  let overdue = 0;
  for (const inst of instances.data.instances) {
    if (inst.status === "fulfilled" || inst.status === "waived") continue;
    open++;
    const daysLeft = inst.next_due ? daysBetween(today, inst.next_due) : undefined;
    const isOverdue = daysLeft !== undefined && daysLeft < 0;
    if (isOverdue) overdue++;
    rows.push({
      id: inst.id,
      source: "permit",
      permit_id: inst.permit_id,
      title: titles.get(inst.obligation_id) ?? inst.obligation_id,
      status: isOverdue ? "期限超過" : inst.status,
      due: inst.next_due,
      next_action: `operations permit obligations --permit ${inst.permit_id}`,
      attention_score: isOverdue ? 70 : daysLeft !== undefined && daysLeft <= 30 ? 50 : 30,
    });
  }
  return { rows, open, overdue };
}

export function buildObligationsPortfolio(opts?: { today?: string }): ObligationsPortfolio {
  const today = opts?.today?.trim() || currentDate();
  const permits = permitRows(today);
  const qms = buildQmsPortfolio({ today });
  const gvp = buildGvpPortfolio({ today });

  const rows = [...permits.rows];
  for (const row of qms.rows) {
    rows.push({
      id: row.id,
      source: "qms",
      permit_id: "md-qms",
      title: row.title,
      status: row.status,
      next_action: row.next_action,
      attention_score: row.attention_score,
    });
  }
  for (const row of gvp.rows) {
    rows.push({
      id: row.id,
      source: "gvp",
      permit_id: "md-gvp",
      title: row.title,
      status: row.status,
      next_action: row.next_action,
      attention_score: row.attention_score,
    });
  }
  rows.sort((a, b) => b.attention_score - a.attention_score);

  return {
    as_of: today,
    rows: rows.slice(0, CEO_ATTENTION_CANVAS_DEFAULTS.maxRows),
    stats: {
      permit_open: permits.open,
      permit_overdue: permits.overdue,
      qms_missing: qms.stats.missing,
      gvp_missing: gvp.stats.missing,
    },
  };
}
