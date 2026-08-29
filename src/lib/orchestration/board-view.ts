import type { Handoff, HandoffStatus } from "../../../schemas/routing.js";
import type { WorkKind } from "../../../schemas/dispatch-tower.js";
import { listHandoffs } from "../routing.js";
import {
  buildPlanGraph,
  retryableFailedWorkOrders,
  syncDependencyStatuses,
} from "./plan-graph.js";
import {
  getWorkOrderDispatch,
  isClosedWorkOrder,
} from "./work-order-state.js";

export type BoardColumn = "todo" | "waiting" | "active" | "attention" | "done";

export const BOARD_COLUMNS: BoardColumn[] = [
  "attention",
  "todo",
  "waiting",
  "active",
  "done",
];

export function statusToBoardColumn(status: HandoffStatus | string): BoardColumn {
  switch (status) {
    case "pending":
      return "todo";
    case "waiting":
      return "waiting";
    case "dispatched":
    case "running":
      return "active";
    case "failed":
    case "blocked":
      return "attention";
    case "completed":
      return "done";
    default:
      return "todo";
  }
}

export function resolveWorkOrderTitle(handoff: Pick<Handoff, "id" | "subject" | "context">): string {
  const subject = handoff.subject?.trim();
  if (subject) return subject;
  const text = handoff.context?.text?.trim();
  if (text) {
    const line = text.split(/\r?\n/)[0]?.trim();
    if (line) {
      return line.length > 80 ? `${line.slice(0, 77)}…` : line;
    }
  }
  return handoff.id;
}

export interface BoardCardDependency {
  id: string;
  title: string;
}

export interface BoardCard {
  id: string;
  rootId: string;
  title: string;
  column: BoardColumn;
  status: HandoffStatus;
  agent: string;
  work_kind: WorkKind | null;
  due_date?: string;
  assignee?: string;
  blocked_on?: string;
  depends_on: BoardCardDependency[];
  wave: number;
  retryable: boolean;
  cancellable: boolean;
  closed: boolean;
  finished_at?: string;
}

export interface BoardPlanCounts {
  total: number;
  done: number;
  attention: number;
  running: number;
}

export interface BoardPlanSummary {
  id: string;
  title: string;
  status: "active" | "completed";
  counts: BoardPlanCounts;
  cards: BoardCard[];
}

function isLeafWorkOrder(node: Handoff): boolean {
  return node.task_type === "implement" && !(node.child_ids?.length);
}

function buildCardFromNode(
  node: Handoff,
  rootId: string,
  graph: ReturnType<typeof buildPlanGraph>,
  waveIndex: number,
  retryableIds: Set<string>,
): BoardCard {
  const dispatch = getWorkOrderDispatch(node);
  return {
    id: node.id,
    rootId,
    title: resolveWorkOrderTitle(node),
    column: statusToBoardColumn(node.status),
    status: node.status,
    agent: node.to_agent,
    work_kind: node.work_kind ?? null,
    due_date: node.due_date,
    assignee: node.assignee_operator_id ?? node.assignee_employee_id,
    blocked_on: node.blocked_on,
    depends_on: node.depends_on.map((depId) => {
      const dep = graph.nodes.get(depId);
      return {
        id: depId,
        title: dep ? resolveWorkOrderTitle(dep) : depId,
      };
    }),
    wave: waveIndex + 1,
    retryable: retryableIds.has(node.id),
    cancellable: node.status === "pending" || node.status === "waiting",
    closed: isClosedWorkOrder(node),
    finished_at: dispatch.finished_at,
  };
}

export function buildBoardPlanSummary(rootId: string): BoardPlanSummary {
  const graph = buildPlanGraph(rootId);
  syncDependencyStatuses(graph);
  const retryableIds = new Set(retryableFailedWorkOrders(graph).map((n) => n.id));
  const root = graph.nodes.get(rootId);
  if (!root) {
    throw new Error(`Work order not found: ${rootId}`);
  }

  const cards: BoardCard[] = [];
  graph.waves.forEach((wave, waveIndex) => {
    for (const nodeId of wave) {
      const node = graph.nodes.get(nodeId);
      if (!node || !isLeafWorkOrder(node)) continue;
      cards.push(buildCardFromNode(node, rootId, graph, waveIndex, retryableIds));
    }
  });

  if (cards.length === 0 && isLeafWorkOrder(root)) {
    cards.push(buildCardFromNode(root, rootId, graph, 0, retryableIds));
  }

  const counts: BoardPlanCounts = {
    total: cards.length,
    done: cards.filter((c) => c.closed).length,
    attention: cards.filter((c) => c.column === "attention" && !c.closed).length,
    running: cards.filter((c) => c.column === "active").length,
  };

  const openCards = cards.filter((c) => !c.closed);
  const status: "active" | "completed" =
    openCards.length === 0 && cards.length > 0 ? "completed" : "active";

  return {
    id: rootId,
    title: resolveWorkOrderTitle(root),
    status,
    counts,
    cards,
  };
}

export function listPlanRoots(includeCompleted: boolean): {
  active_roots: string[];
  completed_roots: string[];
} {
  const implement = listHandoffs().filter((h) => h.task_type === "implement" && !h.parent_id);
  const active_roots = [...new Set(implement.filter((h) => h.status !== "completed").map((h) => h.id))].sort();
  const completed_roots = includeCompleted
    ? [...new Set(implement.filter((h) => h.status === "completed").map((h) => h.id))].sort()
    : [];
  return { active_roots, completed_roots };
}

export type BoardListView = "incomplete" | "completed" | "all";

export interface BoardListOptions {
  includeCompleted?: boolean;
  view?: BoardListView;
  /** ISO date — when set, completed cards before this date are omitted (completed view). */
  completedSince?: string;
}

export const DEFAULT_COMPLETED_SINCE_DAYS = 14;

export function defaultCompletedSinceIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - DEFAULT_COMPLETED_SINCE_DAYS);
  return d.toISOString();
}

function cardMatchesView(card: BoardCard, view: BoardListView, completedSince?: string): boolean {
  if (view === "all") return true;
  if (view === "incomplete") return !card.closed;
  if (!card.closed) return false;
  if (card.status !== "completed") return true;
  if (!completedSince || !card.finished_at) return true;
  return card.finished_at >= completedSince;
}

function filterPlanCards(plan: BoardPlanSummary, options: BoardListOptions): BoardPlanSummary {
  const view = options.view ?? "incomplete";
  const completedSince =
    view === "completed" && !options.completedSince && options.includeCompleted
      ? defaultCompletedSinceIso()
      : options.completedSince;

  const cards = plan.cards.filter((c) => cardMatchesView(c, view, completedSince));
  const openCards = cards.filter((c) => !c.closed);
  return {
    ...plan,
    status: openCards.length === 0 && cards.length > 0 ? "completed" : "active",
    counts: {
      total: cards.length,
      done: cards.filter((c) => c.closed).length,
      attention: cards.filter((c) => c.column === "attention" && !c.closed).length,
      running: cards.filter((c) => c.column === "active").length,
    },
    cards,
  };
}

export function buildOrchestrationBoardList(
  options: BoardListOptions | boolean = {},
): {
  plans: BoardPlanSummary[];
  active_roots: string[];
  completed_roots: string[];
  count: number;
} {
  const opts: BoardListOptions =
    typeof options === "boolean" ? { includeCompleted: options } : options;
  const includeCompleted = opts.includeCompleted ?? false;
  const view = opts.view ?? "incomplete";

  const { active_roots, completed_roots } = listPlanRoots(includeCompleted || view !== "incomplete");
  const rootIds =
    includeCompleted || view !== "incomplete"
      ? [...new Set([...active_roots, ...completed_roots])].sort()
      : active_roots;

  const plans: BoardPlanSummary[] = [];
  for (const id of rootIds) {
    try {
      const filtered = filterPlanCards(buildBoardPlanSummary(id), opts);
      if (filtered.cards.length === 0) continue;
      if (view === "incomplete" && filtered.status === "completed") continue;
      plans.push(filtered);
    } catch {
      /* skip broken graphs — active_roots still lists the id for CLI compat */
    }
  }
  return {
    plans,
    active_roots,
    completed_roots,
    count: plans.filter((p) => p.status === "active").length,
  };
}

export function enrichHandoffDisplayFields(node: Handoff): {
  title: string;
  column: BoardColumn;
  work_kind: WorkKind | null;
  due_date?: string;
  assignee?: string;
  blocked_on?: string;
} {
  return {
    title: resolveWorkOrderTitle(node),
    column: statusToBoardColumn(node.status),
    work_kind: node.work_kind ?? null,
    due_date: node.due_date,
    assignee: node.assignee_operator_id ?? node.assignee_employee_id,
    blocked_on: node.blocked_on,
  };
}
