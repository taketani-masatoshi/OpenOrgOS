import { listCooRelayInbox, listStewardInbox } from "./mission-store.js";

export function formatReportingInboxMarkdown(): string {
  const coo = listCooRelayInbox().slice(0, 10);
  const steward = listStewardInbox().slice(0, 10);
  const lines = [
    "## Agent 報告チェーン",
    "",
    `**COO 中継待ち:** ${listCooRelayInbox().length} 件 · **Steward inbox:** ${listStewardInbox().length} 件`,
    "",
    "### COO relay",
    "",
  ];

  if (coo.length === 0) {
    lines.push("（なし）");
  } else {
    for (const m of coo) {
      lines.push(
        `- **${m.id}** · ${m.field_agent} · ${m.subject}${m.report ? " · 報告あり" : " · 依頼追跡"}`
      );
    }
  }

  lines.push("", "### Steward inbox", "");
  if (steward.length === 0) {
    lines.push("（なし）");
  } else {
    for (const m of steward) {
      lines.push(`- **${m.id}** · ${m.field_agent} · ${m.subject}`);
    }
  }

  lines.push(
    "",
    "```bash",
    "npm run orgos -- agent relay list --role coo",
    "npm run orgos -- agent relay ack --mission MS-... --role steward",
    "```",
    ""
  );

  return lines.join("\n");
}
