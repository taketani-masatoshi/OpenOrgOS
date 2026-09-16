export type ViewId = "modules" | "workspace" | "runtime" | "agents";

export type NodeKind =
  | "workspace"
  | "product"
  | "extract"
  | "app"
  | "agent"
  | "module"
  | "iso"
  | "reg"
  | "data"
  | "human";

export type NodeStatus = "on" | "off" | "excluded" | "extract" | "generated" | "canonical";

export type EdgeKind = "owns" | "uses" | "binds" | "handoff" | "auth" | "alias" | "ssot" | "mirror";

export interface SpecNode {
  id: string;
  label: string;
  kind: NodeKind;
  status: NodeStatus;
  subtitle: string;
  detail: string;
}

export interface SpecEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label: string;
}

export interface GraphSpec {
  direction: "LR" | "TB";
  nodes: SpecNode[];
  edges: SpecEdge[];
}

export const VIEW_LABEL: Record<ViewId, string> = {
  modules: "モジュール結合",
  workspace: "ワークスペース",
  runtime: "ランタイム",
  agents: "オペレーター層",
};

export const EDGE_KIND_JA: Record<EdgeKind, string> = {
  owns: "所有 / 包含",
  uses: "利用",
  binds: "binds_to",
  handoff: "ハンドオフ",
  auth: "認証",
  alias: "エイリアス",
  ssot: "状態の正本",
  mirror: "生成ミラー",
};

export const KIND_JA: Record<NodeKind, string> = {
  workspace: "傘",
  product: "プロダクト",
  extract: "extract",
  app: "実行面",
  agent: "Agent",
  module: "モジュール",
  iso: "ISO",
  reg: "規程",
  data: "データ",
  human: "人間",
};

function node(
  id: string,
  label: string,
  kind: NodeKind,
  status: NodeStatus,
  subtitle: string,
  detail: string,
): SpecNode {
  return { id, label, kind, status, subtitle, detail };
}

function edge(from: string, to: string, kind: EdgeKind, label: string): SpecEdge {
  return { from, to, kind, label };
}

const MAL_ENABLED = [
  "rental",
  "hospitality",
  "professional_services",
  "investor_relations",
  "travel_booking",
  "jp_corporate_registration",
  "jp_medical_device",
  "jp_bank_corporate",
  "jp_tax_corporate",
  "jp_tax_consumption",
  "jp_invoice_qualified",
  "jp_withholding_statutory",
  "sales",
  "customer_success",
  "language_bridge",
  "jp_carbon_neutral_2050",
  "jp_certification",
  "jp_jsox",
  "jp_inspection",
  "jp_minpaku",
  "jp_permit_application",
  "jp_permit_registry",
  "jp_privacy_policy",
  "jp_trademark_application",
  "jp_women_empowerment",
] as const;

const MAL_DISABLED = [
  "venture_capital",
  "saas_subscription",
  "event_space",
  "ecommerce",
  "restaurant",
  "retail_store",
  "clinic",
  "logistics",
  "staffing",
  "construction",
  "education",
  "property_management",
  "membership",
  "jp_social_insurance",
] as const;

const MODULE_AGENT: Record<string, string> = {
  rental: "operations",
  hospitality: "operations",
  professional_services: "operations",
  travel_booking: "operations",
  investor_relations: "investor_relations",
  sales: "sales_lead",
  customer_success: "customer_success",
  language_bridge: "secretary",
  jp_corporate_registration: "secretary",
  jp_bank_corporate: "finance",
  jp_tax_corporate: "tax",
  jp_tax_consumption: "tax",
  jp_invoice_qualified: "tax",
  jp_withholding_statutory: "tax",
  jp_medical_device: "medical_device_regulatory",
  jp_jsox: "internal_audit",
  jp_permit_registry: "compliance",
  jp_permit_application: "compliance",
  jp_minpaku: "compliance",
  jp_certification: "compliance",
  jp_inspection: "compliance",
  jp_privacy_policy: "compliance",
  jp_carbon_neutral_2050: "compliance",
  jp_trademark_application: "compliance",
  jp_women_empowerment: "compliance",
  venture_capital: "finance",
  saas_subscription: "finance",
  event_space: "operations",
  ecommerce: "finance",
  restaurant: "operations",
  retail_store: "finance",
  clinic: "operations",
  logistics: "operations",
  staffing: "operations",
  construction: "operations",
  education: "operations",
  membership: "finance",
  property_management: "operations",
  jp_social_insurance: "human_resources",
};

const MODULE_LABEL: Record<string, string> = {
  rental: "賃貸",
  hospitality: "宿泊",
  professional_services: "受託",
  investor_relations: "IR",
  travel_booking: "旅費",
  sales: "営業",
  customer_success: "CS",
  language_bridge: "言語橋",
  jp_corporate_registration: "登記",
  jp_medical_device: "医療機器",
  jp_bank_corporate: "法人口座",
  jp_tax_corporate: "法人税",
  jp_tax_consumption: "消費税",
  jp_invoice_qualified: "インボイス",
  jp_withholding_statutory: "源泉",
  jp_carbon_neutral_2050: "CN2050",
  jp_certification: "認証",
  jp_jsox: "J-SOX",
  jp_inspection: "検査",
  jp_minpaku: "民泊",
  jp_permit_application: "許認可申請",
  jp_permit_registry: "許認可台帳",
  jp_privacy_policy: "プライバシー方針",
  jp_trademark_application: "商標",
  jp_women_empowerment: "女性活躍",
  venture_capital: "VC",
  saas_subscription: "SaaS",
  event_space: "イベント会場",
  ecommerce: "EC",
  restaurant: "飲食",
  retail_store: "小売",
  clinic: "診療",
  logistics: "物流",
  staffing: "派遣",
  construction: "建設",
  education: "教育",
  membership: "会員",
  property_management: "PM",
  jp_social_insurance: "社保",
};

const AGENT_LABEL: Record<string, string> = {
  operations: "Operations",
  finance: "Finance",
  tax: "Tax",
  secretary: "Secretary",
  sales_lead: "Sales",
  customer_success: "CS Agent",
  investor_relations: "IR Agent",
  compliance: "Compliance",
  medical_device_regulatory: "MD 規制",
  internal_audit: "内部監査",
  human_resources: "HR",
};

function workspaceGraph(): GraphSpec {
  return {
    direction: "TB",
    nodes: [
      node("ooo", "OOO", "workspace", "canonical", "kind: workspace", "傘リポジトリ。編集は edit_paths のみ。"),
      node("core", "Core", "product", "canonical", "OpenOrgOS", "業務 OS 正本。CLI · モジュール · テナント · コンソール。"),
      node("community", "Community", "product", "canonical", "OS_Community", "community.oorgos.org と Community SSO。"),
      node("web", "Web", "product", "canonical", "oorgos.org", "静的概要サイト。日次編集の正本。"),
      node("extract-console", "extracts/console", "extract", "extract", "非正本", "Console の見本コピー。"),
      node("steward-chat", "Operator Console", "app", "on", "apps/steward-chat", "経営コンソール本体。"),
      node("wire-console", "Wire Console", "app", "on", "apps/wire-console", "組織間 Wire。"),
      node("cli", "orgos CLI", "app", "on", "src/cli.ts", "validate · modules · change。"),
      node("mcp", "MCP", "app", "on", "Today / Ask / Witness", "読み取り中心。承認ツールなし。"),
      node("catalog", "モジュールカタログ", "data", "canonical", "51 id", "定義。ランタイム状態は書かない。"),
      node("tenant-mal", "tenants/mal", "data", "on", "ライブ名簿", "MAL の modules.yaml。GitHub には載せない。"),
      node("sso", "Community SSO", "app", "on", "本鍵", "Operator Console ログインの本鍵。"),
    ],
    edges: [
      edge("ooo", "core", "owns", "product"),
      edge("ooo", "community", "owns", "product"),
      edge("ooo", "web", "owns", "product"),
      edge("ooo", "extract-console", "mirror", "extract"),
      edge("core", "steward-chat", "owns", "アプリ"),
      edge("core", "wire-console", "owns", "アプリ"),
      edge("core", "cli", "owns", "CLI"),
      edge("core", "mcp", "owns", "MCP"),
      edge("core", "catalog", "owns", "定義"),
      edge("core", "tenant-mal", "owns", "ライブデータ"),
      edge("community", "sso", "owns", "認証"),
      edge("sso", "steward-chat", "auth", "本鍵"),
      edge("steward-chat", "wire-console", "uses", "/wire 統合"),
      edge("catalog", "tenant-mal", "uses", "roster"),
      edge("cli", "tenant-mal", "uses", "validate"),
      edge("steward-chat", "tenant-mal", "uses", "Today"),
    ],
  };
}

function runtimeGraph(): GraphSpec {
  return {
    direction: "TB",
    nodes: [
      node("ceo", "CEO", "human", "canonical", "判断 · 承認", "最終決定は人間。"),
      node("sso", "Community SSO", "app", "on", "本鍵", "会社ドメインメール。"),
      node("console", "Operator Console", "app", "on", "steward-chat", "Today · 秘書台 · 台帳。"),
      node("wire", "Wire Console", "app", "on", "組織間", "notice 送信は承認者。"),
      node("cli", "orgos CLI", "app", "on", "同一コマンド", "GUI と同じ Application 層。"),
      node("mcp", "MCP", "app", "on", "read", "Today / Ask / Witness。"),
      node("change", "change plan/apply", "app", "on", "等級 A/B/C", "YAML 直書きしない。C は apply 禁止。"),
      node("yaml", "tenant YAML", "data", "on", "SSOT", "data/**/*.yaml が正本。"),
      node("approval", "人間承認ゲート", "human", "canonical", "ceo / approver", "自己承認禁止。"),
    ],
    edges: [
      edge("ceo", "console", "uses", "操作"),
      edge("ceo", "cli", "uses", "操作"),
      edge("sso", "console", "auth", "本鍵"),
      edge("console", "yaml", "uses", "読取 / 提案"),
      edge("cli", "yaml", "uses", "validate"),
      edge("cli", "change", "uses", "変更ゲート"),
      edge("mcp", "yaml", "uses", "read"),
      edge("console", "wire", "uses", "/wire"),
      edge("change", "approval", "binds", "apply 確認"),
      edge("approval", "yaml", "uses", "書き込み許可"),
      edge("ceo", "approval", "owns", "名義"),
    ],
  };
}

function agentsGraph(): GraphSpec {
  return {
    direction: "TB",
    nodes: [
      node("ceo", "CEO", "human", "canonical", "判断のみ", "4層の頂点。"),
      node("agent:executive_steward", "Executive Steward", "agent", "on", "core", "dashboard / summaries のみ。"),
      node("agent:coo", "COO", "agent", "on", "統括", "秘書 · 財務 · 契約 · コンプラ · オペの上位。"),
      node("agent:secretary", "Secretary", "agent", "on", "core", "スケジュール · 対外下書き。"),
      node("agent:finance", "Finance", "agent", "on", "core", "資金 · 台帳。"),
      node("agent:contract", "Contract", "agent", "on", "core", "契約台帳。"),
      node("agent:compliance", "Compliance", "agent", "on", "core", "ISO · 許認可 · 規程。"),
      node("agent:operations", "Operations", "agent", "on", "core", "宿泊 · 賃貸はエイリアスでここに解決。"),
      node("agent:tax", "Tax", "agent", "on", "finance 配下", "法人税 · 消費税 · インボイス。"),
      node("agent:sales_lead", "Sales", "agent", "on", "商談", "sales モジュール。"),
      node("agent:customer_success", "Customer Success", "agent", "on", "既存客", "ヘルス · QBR · 解約。"),
      node("skill-cli", "Skill + CLI", "app", "on", "決定論", "runtime: cli 優先。"),
      node("data", "Data YAML/MD", "data", "canonical", "SSOT", "テナント data/ が正本。"),
    ],
    edges: [
      edge("ceo", "agent:executive_steward", "uses", "要約を読む"),
      edge("agent:executive_steward", "agent:coo", "owns", "reports_to"),
      edge("agent:coo", "agent:secretary", "owns", "reports_to"),
      edge("agent:coo", "agent:finance", "owns", "reports_to"),
      edge("agent:coo", "agent:contract", "owns", "reports_to"),
      edge("agent:coo", "agent:compliance", "owns", "reports_to"),
      edge("agent:coo", "agent:operations", "owns", "reports_to"),
      edge("agent:coo", "agent:sales_lead", "owns", "reports_to"),
      edge("agent:coo", "agent:customer_success", "owns", "reports_to"),
      edge("agent:finance", "agent:tax", "owns", "reports_to"),
      edge("agent:operations", "skill-cli", "uses", "dispatch"),
      edge("agent:finance", "skill-cli", "uses", "dispatch"),
      edge("agent:compliance", "skill-cli", "uses", "dispatch"),
      edge("skill-cli", "data", "uses", "YAML I/O"),
    ],
  };
}

function modulesGraph(showDisabled: boolean): GraphSpec {
  const enabled = [...MAL_ENABLED];
  const moduleIds = showDisabled ? [...enabled, ...MAL_DISABLED] : enabled;
  const agentIds = [...new Set(moduleIds.map((id) => MODULE_AGENT[id]).filter(Boolean))];
  const enabledSet = new Set<string>(enabled);

  const nodes: SpecNode[] = [
    ...agentIds.map((id) =>
      node(`agent:${id}`, AGENT_LABEL[id] ?? id, "agent", "on", "分類先", "MODULE_TO_CLASSIFICATION_AGENT。hospitality / rental は operations。"),
    ),
    ...moduleIds.map((id) =>
      node(
        `module:${id}`,
        MODULE_LABEL[id] ?? id,
        "module",
        enabledSet.has(id) ? "on" : "off",
        id,
        enabledSet.has(id)
          ? `MAL roster enabled。分類エージェントは ${MODULE_AGENT[id]}。`
          : "MAL roster に載っているが enabled: false。",
      ),
    ),
    node("reg:REG-012", "REG-012", "reg", "on", "宿泊運営", "binds_to hospitality · ISO-21401。"),
    node("reg:REG-008", "REG-008", "reg", "on", "旅費", "travel_booking の optional_regulations。"),
    node("reg:REG-010", "REG-010", "reg", "on", "個人情報", "jp_privacy_policy と整合。"),
    node("reg:REG-014", "REG-014", "reg", "on", "環境エネルギー", "ISO-21401 経由で有効。"),
    node("reg:REG-016", "REG-016", "reg", "on", "内部監査", "jp_permit_registry が参照。"),
    node("reg:REG-025", "REG-025", "reg", "on", "医療機器 QMS", "binds_to jp_medical_device。"),
    node("reg:REG-026", "REG-026", "reg", "on", "医療機器 GVP", "binds_to jp_medical_device。"),
    node("iso:ISO-21401", "ISO-21401", "iso", "on", "適合スコープ", "サステナブル宿泊。MAL の適用評価対象。"),
    node("iso:ISO-37000", "ISO-37000", "iso", "on", "適合スコープ", "組織ガバナンス Guidance。"),
    node("iso:ISO-13485", "ISO-13485", "iso", "excluded", "参照のみ", "enabled だが applicability: excluded。"),
  ];

  const edges: SpecEdge[] = [];
  for (const id of moduleIds) {
    const agent = MODULE_AGENT[id];
    if (!agent) continue;
    const kind: EdgeKind = id === "rental" || id === "hospitality" ? "alias" : "owns";
    edges.push(edge(`agent:${agent}`, `module:${id}`, kind, kind === "alias" ? "alias → operations" : "分類"));
  }

  edges.push(
    edge("module:hospitality", "reg:REG-012", "binds", "optional_regulations"),
    edge("reg:REG-012", "iso:ISO-21401", "binds", "iso_ids"),
    edge("module:hospitality", "iso:ISO-21401", "uses", "宿泊運用"),
    edge("module:hospitality", "module:jp_permit_registry", "ssot", "required-compliance 状態"),
    edge("module:jp_minpaku", "module:jp_permit_application", "uses", "届出"),
    edge("module:jp_minpaku", "module:jp_permit_registry", "ssot", "台帳"),
    edge("module:jp_minpaku", "reg:REG-012", "binds", "optional_regulations"),
    edge("module:jp_permit_application", "module:jp_permit_registry", "handoff", "approve → PER"),
    edge("module:jp_permit_registry", "reg:REG-016", "binds", "optional_regulations"),
    edge("module:travel_booking", "reg:REG-008", "binds", "optional_regulations"),
    edge("module:jp_privacy_policy", "reg:REG-010", "binds", "整合"),
    edge("module:jp_carbon_neutral_2050", "reg:REG-014", "binds", "optional_regulations"),
    edge("reg:REG-014", "iso:ISO-21401", "binds", "iso_any"),
    edge("module:jp_medical_device", "reg:REG-025", "binds", "QMS"),
    edge("module:jp_medical_device", "reg:REG-026", "binds", "GVP"),
    edge("reg:REG-025", "iso:ISO-13485", "binds", "iso_ids"),
    edge("reg:REG-026", "iso:ISO-13485", "binds", "iso_ids"),
    edge("module:sales", "module:customer_success", "handoff", "handoff-won"),
    edge("agent:compliance", "iso:ISO-37000", "uses", "ガバナンス参照"),
  );

  const idSet = new Set(nodes.map((item) => item.id));
  return {
    direction: "LR",
    nodes,
    edges: edges.filter((item) => idSet.has(item.from) && idSet.has(item.to)),
  };
}

export function graphFor(view: ViewId, showDisabled: boolean): GraphSpec {
  if (view === "workspace") return workspaceGraph();
  if (view === "runtime") return runtimeGraph();
  if (view === "agents") return agentsGraph();
  return modulesGraph(showDisabled);
}

const NODE_WIDTH = 188;
const NODE_HEIGHT = 58;
const RANK_GAP = 96;
const NODE_GAP = 16;
const MAX_RANK_STACK = 8;

function wrapIndex(index: number): { col: number; row: number } {
  return {
    col: Math.floor(index / MAX_RANK_STACK),
    row: index % MAX_RANK_STACK,
  };
}

export interface LaidOutNode extends SpecNode {
  x: number;
  y: number;
}

export interface LaidOutGraph {
  direction: "LR" | "TB";
  nodes: LaidOutNode[];
  edges: SpecEdge[];
}

export function layoutGraph(spec: GraphSpec): LaidOutGraph {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const item of spec.nodes) {
    incoming.set(item.id, 0);
    outgoing.set(item.id, []);
  }
  for (const item of spec.edges) {
    if (!incoming.has(item.from) || !incoming.has(item.to)) continue;
    incoming.set(item.to, (incoming.get(item.to) ?? 0) + 1);
    outgoing.get(item.from)?.push(item.to);
  }

  const rank = new Map<string, number>();
  const remaining = new Map(incoming);
  const queue = spec.nodes.filter((item) => (incoming.get(item.id) ?? 0) === 0).map((item) => item.id);
  for (const id of queue) rank.set(id, 0);

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    const current = rank.get(id) ?? 0;
    for (const to of outgoing.get(id) ?? []) {
      rank.set(to, Math.max(rank.get(to) ?? 0, current + 1));
      const left = (remaining.get(to) ?? 1) - 1;
      remaining.set(to, left);
      if (left === 0) queue.push(to);
    }
  }

  for (const item of spec.nodes) {
    if (!rank.has(item.id)) rank.set(item.id, 0);
  }

  const groups = new Map<number, SpecNode[]>();
  for (const item of spec.nodes) {
    const r = rank.get(item.id) ?? 0;
    const list = groups.get(r) ?? [];
    list.push(item);
    groups.set(r, list);
  }

  const ranks = [...groups.keys()].sort((a, b) => a - b);
  const nodes: LaidOutNode[] = [];
  let cursor = 0;
  for (const r of ranks) {
    const list = groups.get(r) ?? [];
    const cols = Math.max(1, Math.ceil(list.length / MAX_RANK_STACK));
    list.forEach((item, index) => {
      const packed = wrapIndex(index);
      if (spec.direction === "LR") {
        nodes.push({
          ...item,
          x: cursor + packed.col * (NODE_WIDTH + NODE_GAP),
          y: packed.row * (NODE_HEIGHT + NODE_GAP),
        });
      } else {
        nodes.push({
          ...item,
          x: packed.row * (NODE_WIDTH + NODE_GAP),
          y: cursor + packed.col * (NODE_HEIGHT + NODE_GAP),
        });
      }
    });
    const span =
      spec.direction === "LR"
        ? cols * NODE_WIDTH + (cols - 1) * NODE_GAP
        : cols * NODE_HEIGHT + (cols - 1) * NODE_GAP;
    cursor += span + RANK_GAP;
  }

  return { direction: spec.direction, nodes, edges: spec.edges };
}
