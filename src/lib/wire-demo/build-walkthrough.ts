/**
 * Compose Wire Demo Walkthrough for Operator Console `/wire/demo/`.
 * Path: src/lib/wire-demo/build-walkthrough.ts
 * ADR: docs/adr/0075-wire-demo-walkthrough.md
 *
 * Read-only L1 surface — does not run seed-inter-org-demo (mutates protocol scratch).
 */
import {
  wireDemoWalkthroughSchema,
  type WireDemoStep,
  type WireDemoWalkthrough,
} from "../../../schemas/wire-demo-walkthrough.js";
import { listOrgApprovals } from "../org/approval/reject.js";
import {
  loadPeersRegistry,
  peerHasDeliveryPath,
} from "../protocol/peers.js";
import { listWirePending } from "../protocol/wire-queue.js";
import { getTenantId } from "../tenant.js";
import { currentDate } from "../utils.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getTenantDir } from "../tenant.js";

const SOUTHWOOD_MARKERS = ["southwood", "サウスウッド", "PEER-001"];

function isSouthwoodPeer(peer: {
  peer_id: string;
  display_name: string;
  org_uri?: string;
}): boolean {
  const blob = `${peer.peer_id} ${peer.display_name} ${peer.org_uri ?? ""}`.toLowerCase();
  return SOUTHWOOD_MARKERS.some((m) => blob.includes(m.toLowerCase()));
}

function protocolFilePresent(rel: string): boolean {
  return existsSync(join(getTenantDir(), "data", "protocol", rel));
}

export function buildWireDemoWalkthrough(): WireDemoWalkthrough {
  const tenant = getTenantId();
  let peersRaw: ReturnType<typeof loadPeersRegistry>["peers"] = [];
  try {
    peersRaw = loadPeersRegistry().peers;
  } catch {
    peersRaw = [];
  }

  const peers = peersRaw.map((p) => ({
    peer_id: p.peer_id,
    display_name: p.display_name,
    org_uri: p.org_uri,
    has_delivery_path: peerHasDeliveryPath(p),
  }));

  const southwood = peers.find((p) => isSouthwoodPeer(p));
  const counterparty = southwood?.display_name ?? "Southwood（未登録）";

  let wirePending = 0;
  try {
    wirePending = listWirePending().length;
  } catch {
    wirePending = 0;
  }

  let approvalsPending = 0;
  try {
    approvalsPending = listOrgApprovals({
      scope: "wire",
      status: "pending_approval",
    }).length;
  } catch {
    approvalsPending = 0;
  }

  const hasPeersFile = protocolFilePresent("peers.yaml");
  const hasGateway = protocolFilePresent("wire-gateway.yaml");
  const hasWitness = protocolFilePresent("witness-pool.yaml");

  const steps: WireDemoStep[] = [
    {
      id: "peer",
      title: "1. 相手組織（Southwood）を peers に載せる",
      summary: southwood
        ? `${southwood.display_name}（${southwood.peer_id}）が登録済み`
        : "peers.yaml に Southwood 相当の peer が無い",
      status: southwood
        ? southwood.has_delivery_path
          ? "ready"
          : "pending"
        : hasPeersFile
          ? "missing"
          : "missing",
      href: "/wire/demo/",
      detail: southwood
        ? southwood.has_delivery_path
          ? "配送パスあり"
          : "peer はあるが inbound 配送パスが無い"
        : "CLI: orgos protocol peers または seed-inter-org-demo",
    },
    {
      id: "propose",
      title: "2. 組織間通知を起案する",
      summary: "契約・請求などの notice を Wire で propose",
      status: hasGateway ? "ready" : "missing",
      href: "/wire/",
      detail: hasGateway
        ? "wire-gateway.yaml あり — Console の Wire から起案"
        : "wire-gateway.yaml が無い",
    },
    {
      id: "approve",
      title: "3. 人間が承認する",
      summary:
        approvalsPending > 0
          ? `Wire 承認待ち ${approvalsPending} 件`
          : "いま Wire 承認待ちは無い（起案後ここに出る）",
      status: approvalsPending > 0 ? "pending" : "info",
      href: "/approvals/",
      detail: "承認キュー /approvals/（scope=wire）",
    },
    {
      id: "deliver",
      title: "4. 配送・受信（MAL → Southwood）",
      summary:
        wirePending > 0
          ? `wire-pending ${wirePending} 件`
          : "pending 無し — flush 済みか未起案",
      status: wirePending > 0 ? "pending" : southwood ? "info" : "missing",
      href: "/wire/",
      detail: "POST /chat/v1/wire/flush または Wire Console",
    },
    {
      id: "ack",
      title: "5. 相手側 ack / 証跡",
      summary: hasWitness
        ? "witness-pool 設定あり — 証跡レーン準備済み"
        : "witness-pool.yaml が無い",
      status: hasWitness ? "ready" : "pending",
      href: "/wire/",
      detail: "フル E2E は scripts/seed-inter-org-demo.ts（テスト用・状態を書き換える）",
    },
  ];

  return wireDemoWalkthroughSchema.parse({
    ok: true as const,
    tenant,
    report_date: currentDate(),
    story_title: "MAL ↔ Southwood — 請求通知の一本道",
    story_lead:
      "起案 → 承認 → 配送 → 受信 ack → 証跡。Wire 全機能ではなく、この1本だけを Console で追う。",
    counterparty,
    peers,
    steps,
    wire_pending_count: wirePending,
    approvals_pending_count: approvalsPending,
    cli_hint:
      "フル再生（破壊的）: npx tsx scripts/seed-inter-org-demo.ts — CI / ローカル検証用。本番テナントでは使わない。",
    wire_console_href: "/wire/",
    approvals_href: "/approvals/",
  });
}
