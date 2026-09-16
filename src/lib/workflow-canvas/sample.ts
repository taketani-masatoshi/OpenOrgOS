import type { WorkflowDocument } from "../../../schemas/workflow-canvas.js";
import { annotateDependencies } from "./serialize.js";

/**
 * System composition: AIA agents plus Steward Chat / hospitality / Wire.
 * L0/L1 labels only — no tenant secrets.
 */
const SYSTEM_MAP_NODES = [
  {
    id: "aia-executive-steward",
    type: "aia_agent" as const,
    label: "Executive Steward",
    description: "経営要約と指示のハブ",
    position: { x: 80, y: 160 },
    data: { agent_id: "executive_steward", role: "executive", status: "active" as const },
  },
  {
    id: "aia-secretary",
    type: "aia_agent" as const,
    label: "Secretary",
    description: "受信・下書き・日程の一次対応",
    position: { x: 80, y: 360 },
    data: { agent_id: "secretary", role: "secretary", status: "active" as const },
  },
  {
    id: "aia-finance",
    type: "aia_agent" as const,
    label: "Finance",
    description: "帳簿と入出金の照会",
    position: { x: 420, y: 80 },
    data: { agent_id: "finance", role: "finance", status: "idle" as const },
  },
  {
    id: "mod-steward-chat",
    type: "system_module" as const,
    label: "Steward Chat",
    description: "Operator Console / 対話面",
    position: { x: 420, y: 260 },
    data: { module_id: "steward-chat", status: "active" as const },
  },
  {
    id: "mod-hospitality",
    type: "system_module" as const,
    label: "Hospitality",
    description: "宿泊オペレーション台帳",
    position: { x: 760, y: 260 },
    data: { module_id: "hospitality", status: "active" as const },
  },
  {
    id: "mod-wire",
    type: "system_module" as const,
    label: "Wire",
    description: "組織間通知ゲートウェイ",
    position: { x: 760, y: 80 },
    data: { module_id: "wire", status: "idle" as const },
  },
  {
    id: "task-guest-register",
    type: "business_task" as const,
    label: "宿泊者名簿の点検",
    description: "滞在台帳と許可条件の突合",
    position: { x: 760, y: 440 },
    data: { status: "blocked" as const },
  },
];

const SYSTEM_MAP_EDGES = [
  {
    id: "e-steward-chat",
    source: "aia-executive-steward",
    target: "mod-steward-chat",
    label: "指示",
    kind: "invoke" as const,
  },
  {
    id: "e-secretary-chat",
    source: "aia-secretary",
    target: "mod-steward-chat",
    label: "下書き",
    kind: "handoff" as const,
  },
  {
    id: "e-chat-hospitality",
    source: "mod-steward-chat",
    target: "mod-hospitality",
    label: "台帳照会",
    kind: "data" as const,
  },
  {
    id: "e-steward-finance",
    source: "aia-executive-steward",
    target: "aia-finance",
    label: "照会",
    kind: "invoke" as const,
  },
  {
    id: "e-finance-wire",
    source: "aia-finance",
    target: "mod-wire",
    label: "承認後送信",
    kind: "approval" as const,
  },
  {
    id: "e-hospitality-register",
    source: "mod-hospitality",
    target: "task-guest-register",
    label: "点検依頼",
    kind: "handoff" as const,
  },
  {
    id: "e-secretary-register",
    source: "aia-secretary",
    target: "task-guest-register",
    label: "一次確認",
    kind: "handoff" as const,
  },
];

export const SYSTEM_MAP_SAMPLE: WorkflowDocument = {
  version: 1,
  kind: "system_map",
  title: "OpenOrgOS システム構成",
  description: "AIA 同士と Steward Chat / モジュールの連携面。",
  nodes: annotateDependencies(SYSTEM_MAP_NODES, SYSTEM_MAP_EDGES).sort((a, b) =>
    a.id.localeCompare(b.id),
  ),
  edges: [...SYSTEM_MAP_EDGES].sort((a, b) => a.id.localeCompare(b.id)),
};

const BOOKING_NODES = [
  {
    id: "task-receive-booking",
    type: "business_task" as const,
    label: "予約受付",
    description: "チャネルからの新規予約",
    position: { x: 60, y: 200 },
    data: { status: "done" as const },
  },
  {
    id: "aia-secretary",
    type: "aia_agent" as const,
    label: "Secretary",
    description: "不足情報の確認と下書き",
    position: { x: 360, y: 80 },
    data: { agent_id: "secretary", role: "secretary", status: "active" as const },
  },
  {
    id: "mod-hospitality",
    type: "system_module" as const,
    label: "Hospitality",
    description: "在庫・名簿・許可条件",
    position: { x: 360, y: 320 },
    data: { module_id: "hospitality", status: "active" as const },
  },
  {
    id: "task-confirm-stay",
    type: "business_task" as const,
    label: "滞在確定",
    description: "名簿登録と案内文",
    position: { x: 660, y: 200 },
    data: { status: "active" as const },
  },
  {
    id: "aia-finance",
    type: "aia_agent" as const,
    label: "Finance",
    description: "請求・入金の記録",
    position: { x: 960, y: 200 },
    data: { agent_id: "finance", role: "finance", status: "idle" as const },
  },
];

const BOOKING_EDGES = [
  {
    id: "e-booking-secretary",
    source: "task-receive-booking",
    target: "aia-secretary",
    label: "不足確認",
    kind: "handoff" as const,
  },
  {
    id: "e-booking-hospitality",
    source: "task-receive-booking",
    target: "mod-hospitality",
    label: "在庫照会",
    kind: "data" as const,
  },
  {
    id: "e-secretary-confirm",
    source: "aia-secretary",
    target: "task-confirm-stay",
    label: "案内下書き",
    kind: "handoff" as const,
  },
  {
    id: "e-hospitality-confirm",
    source: "mod-hospitality",
    target: "task-confirm-stay",
    label: "名簿反映",
    kind: "data" as const,
  },
  {
    id: "e-confirm-finance",
    source: "task-confirm-stay",
    target: "aia-finance",
    label: "請求",
    kind: "invoke" as const,
  },
];

export const BUSINESS_WORKFLOW_SAMPLE: WorkflowDocument = {
  version: 1,
  kind: "business_workflow",
  title: "予約から滞在確定",
  description: "自然言語の業務フローを nodes / edges に落とした例。",
  nodes: annotateDependencies(BOOKING_NODES, BOOKING_EDGES).sort((a, b) =>
    a.id.localeCompare(b.id),
  ),
  edges: [...BOOKING_EDGES].sort((a, b) => a.id.localeCompare(b.id)),
};
