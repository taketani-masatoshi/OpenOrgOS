#!/usr/bin/env node
/**
 * Wire Console — Proposal 3 · MAL 送信 · southwood 受信 · AIAC Org C（1通）
 */

import { setTenantId } from "../src/lib/tenant.js";
import { writeYamlFile } from "../src/lib/utils.js";
import { getWireConsoleScenarioPath } from "../src/lib/org/paths.js";
import type { WireConsoleScenario } from "../schemas/org/wire-console-scenario.js";
import {
  AIAC_TENANT,
  DEMO_EVENT_ID,
  MAL_TENANT,
  VENDOR_TENANT,
  runWireConsoleThreeRoleDemo,
} from "./seed-inter-org-demo.js";

function writeScenario(tenantId: string, scenario: WireConsoleScenario): void {
  setTenantId(tenantId);
  writeYamlFile(getWireConsoleScenarioPath(), scenario);
}

function writeAllScenarios(): void {
  const asOf = new Date().toISOString().slice(0, 10);

  writeScenario(MAL_TENANT, {
    as_of: asOf,
    scenario_id: "three-org-one-message",
    title: "オフィス賃貸借 — 履行通知を送信",
    org_role: "sender",
    org_role_ja: "送信側",
    counterparty_label: "株式会社サウスウッド",
    contract_id: "CTR-012",
    flow_steps: [
      "① 本社から履行通知を Org C relay 経由で 1 通送信",
      "② 相手（サウスウッド）が relay から受信 · 公証は AIAC（Org C）",
    ],
    anchors: { inter_org_event_id: DEMO_EVENT_ID },
    mail_hints: {
      outbox: "「履行通知（オフィス賃貸借）」— この組織の唯一の送信",
      inbox: "（送信側 — 受信はサウスウッドのタブ）",
    },
  });

  writeScenario(VENDOR_TENANT, {
    as_of: asOf,
    scenario_id: "three-org-one-message",
    title: "オフィス賃貸借 — 履行通知を受信",
    org_role: "receiver",
    org_role_ja: "受信側",
    counterparty_label: "株式会社MAL",
    contract_id: "CTR-012",
    flow_steps: [
      "① MAL から Org C relay 経由で 1 通届く",
      "② 返信なし · trust bundle で Hub を pin",
    ],
    anchors: { inter_org_event_id: DEMO_EVENT_ID },
    mail_hints: {
      inbox: "「履行通知（オフィス賃貸借）」— この組織の唯一の受信",
      outbox: "（本デモでは返信なし）",
    },
  });

  writeScenario(AIAC_TENANT, {
    as_of: asOf,
    scenario_id: "three-org-one-message",
    title: "Org C — 中立 relay · trust bundle · 公証",
    org_role: "witness",
    org_role_ja: "Org C（中立）",
    counterparty_label: "MAL ↔ サウスウッド（当事者外 · relay 運用）",
    contract_id: "CTR-012",
    flow_steps: [
      "① trust bundle で HUB-A/B を認定",
      "② relay API で MAL → southwood 配送",
      "③ 確認待ち 1 件 — 公証機関 A へ登録",
    ],
    anchors: { inter_org_event_id: DEMO_EVENT_ID },
    mail_hints: {
      witness: "確認待ち 1 件 — trust bundle 経由の Hub 公証",
      inbox: "（当事者ではない — 受信は空）",
      outbox: "（当事者ではない — 送信は空）",
      threads: "同一の取引で mal / southwood と対応",
    },
    witness: {
      anchor_event_id: DEMO_EVENT_ID,
      hub_ids: ["HUB-A", "HUB-B"],
      this_org_side: "none",
      note: "Org C relay + trust bundle 正本 · メッセージから公証を登録",
    },
  });
}

export async function runWireConsoleThreeOrgDemo(): Promise<void> {
  await runWireConsoleThreeRoleDemo();
  writeAllScenarios();
  console.log("\n--- Wire Console ---");
  console.log("  npm run wire-console:build && npm run orgos -- wire console start");
  console.log("  → http://127.0.0.1:9470");
  console.log("  mal=送信 · southwood=受信 · aiac=Org C");
}

runWireConsoleThreeOrgDemo().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
