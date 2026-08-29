/**
 * Sales pipeline stage transitions — pure functions.
 */
import type { SalesDeal, SalesDealStage, SalesLostReason } from "../../schemas/sales.js";
import { OPEN_SALES_STAGES } from "../../schemas/sales.js";

const STAGE_ORDER: Record<(typeof OPEN_SALES_STAGES)[number], number> = {
  lead: 0,
  qualify: 1,
  proposal: 2,
  negotiation: 3,
};

export const DEFAULT_FOLLOW_UP_DAYS: Partial<Record<SalesDealStage, number>> = {
  qualify: 7,
  proposal: 5,
  negotiation: 3,
};

export interface StageTransitionInput {
  deal: SalesDeal;
  toStage: SalesDealStage;
  lostReason?: SalesLostReason;
  lostNotes?: string;
  reopen?: boolean;
  asOf?: string;
}

export interface StageTransitionResult {
  deal: SalesDeal;
  from_stage: SalesDealStage;
  to_stage: SalesDealStage;
}

export class SalesStageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesStageError";
  }
}

function isTerminal(stage: SalesDealStage): boolean {
  return stage === "won" || stage === "lost";
}

function isOpen(stage: SalesDealStage): boolean {
  return (OPEN_SALES_STAGES as readonly string[]).includes(stage);
}

export function canTransitionStage(
  from: SalesDealStage,
  to: SalesDealStage,
  opts?: { reopen?: boolean },
): boolean {
  if (from === to) return true;
  if (isTerminal(from)) {
    return Boolean(opts?.reopen) && isOpen(to);
  }
  if (isTerminal(to)) return true;
  if (!isOpen(from) || !isOpen(to)) return false;
  type OpenStage = (typeof OPEN_SALES_STAGES)[number];
  return STAGE_ORDER[to as OpenStage] >= STAGE_ORDER[from as OpenStage];
}

export function applyStageTransition(input: StageTransitionInput): StageTransitionResult {
  const { deal, toStage, lostReason, lostNotes, reopen, asOf } = input;
  const from = deal.stage;

  if (!canTransitionStage(from, toStage, { reopen })) {
    throw new SalesStageError(
      `illegal transition ${from} → ${toStage}${isTerminal(from) ? " (use reopen)" : ""}`,
    );
  }

  if (toStage === "lost" && !lostReason) {
    throw new SalesStageError("lost_reason is required when stage is lost");
  }
  if (toStage === "won" && deal.amount_man == null) {
    throw new SalesStageError("amount_man is required when stage is won");
  }

  const next: SalesDeal = {
    ...deal,
    stage: toStage,
    stage_entered_on: toStage !== from ? (asOf ?? deal.stage_entered_on) : deal.stage_entered_on,
    lost_reason: toStage === "lost" ? lostReason : toStage === "won" ? undefined : deal.lost_reason,
    lost_notes: toStage === "lost" ? lostNotes : toStage === "won" ? undefined : deal.lost_notes,
  };

  if (toStage !== from && isOpen(toStage) && !next.next_action_due) {
    const days = DEFAULT_FOLLOW_UP_DAYS[toStage];
    if (days != null && asOf) {
      const d = new Date(`${asOf}T12:00:00`);
      d.setDate(d.getDate() + days);
      next.next_action_due = d.toISOString().slice(0, 10);
    }
  }

  return { deal: next, from_stage: from, to_stage: toStage };
}

export function defaultProbabilityForStage(stage: SalesDealStage): number {
  switch (stage) {
    case "lead":
      return 10;
    case "qualify":
      return 25;
    case "proposal":
      return 40;
    case "negotiation":
      return 60;
    case "won":
      return 100;
    case "lost":
      return 0;
    default:
      return 0;
  }
}
