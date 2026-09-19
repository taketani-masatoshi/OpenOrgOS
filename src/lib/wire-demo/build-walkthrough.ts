/**
 * Compose Wire Demo Walkthrough for Operator Console `/wire/demo/`.
 * Path: src/lib/wire-demo/build-walkthrough.ts
 * ADR: docs/adr/0075-wire-demo-walkthrough.md
 *
 * Read-only L1 surface — does not run seed-inter-org-demo (mutates protocol scratch).
 * Step titles/summaries are neutral English keys for console i18n.
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
import { getTenantId, getTenantDir } from "../tenant.js";
import { currentDate } from "../utils.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SOUTHWOOD_MARKERS = ["southwood", "サウスウッド"];

export function isSouthwoodPeer(peer: {
  peer_id: string;
  display_name: string;
  org_uri?: string;
}): boolean {
  const blob = `${peer.display_name} ${peer.org_uri ?? ""}`.toLowerCase();
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
  const counterparty = southwood?.display_name ?? "Southwood (not registered)";

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

  const hasGateway = protocolFilePresent("wire-gateway.yaml");
  const hasWitness = protocolFilePresent("witness-pool.yaml");

  const steps: WireDemoStep[] = [
    {
      id: "peer",
      title: "step.peer.title",
      summary: southwood
        ? `registered:${southwood.display_name}:${southwood.peer_id}`
        : "missing_peer",
      status: southwood
        ? southwood.has_delivery_path
          ? "ready"
          : "pending"
        : "missing",
      href: "/wire/",
      detail: southwood
        ? southwood.has_delivery_path
          ? "delivery_ok"
          : "delivery_missing"
        : "peer_cli_hint",
    },
    {
      id: "propose",
      title: "step.propose.title",
      summary: hasGateway ? "gateway_ready" : "gateway_missing",
      status: hasGateway ? "ready" : "missing",
      href: "/secretary/workbench/",
      detail: hasGateway ? "propose_via_secretary" : "need_gateway",
    },
    {
      id: "approve",
      title: "step.approve.title",
      summary:
        approvalsPending > 0
          ? `approvals_pending:${approvalsPending}`
          : "approvals_idle",
      status: approvalsPending > 0 ? "pending" : "info",
      href: "/approvals/",
      detail: "approvals_wire_scope",
    },
    {
      id: "deliver",
      title: "step.deliver.title",
      summary:
        wirePending > 0 ? `wire_pending:${wirePending}` : "wire_idle",
      status: wirePending > 0 ? "pending" : southwood ? "info" : "missing",
      href: "/wire/",
      detail: "flush_via_wire",
    },
    {
      id: "ack",
      title: "step.ack.title",
      summary: hasWitness ? "witness_ready" : "witness_missing",
      status: hasWitness ? "ready" : "pending",
      href: "/wire/",
      detail: "seed_cli_destructive",
    },
  ];

  return wireDemoWalkthroughSchema.parse({
    ok: true as const,
    tenant,
    report_date: currentDate(),
    story_title: "story.title",
    story_lead: "story.lead",
    counterparty,
    peers,
    steps,
    wire_pending_count: wirePending,
    approvals_pending_count: approvalsPending,
    cli_hint: "cli.hint",
    wire_console_href: "/wire/",
    approvals_href: "/approvals/",
  });
}
