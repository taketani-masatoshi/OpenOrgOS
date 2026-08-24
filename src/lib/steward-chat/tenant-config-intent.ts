/**
 * Deterministic Steward Chat propose for tenant.config (modules / standards toggles).
 */
import {
  proposeTenantConfigChange,
  type TenantConfigTarget,
} from "../org/tenant-config-change.js";

const ENABLE =
  /有効化|有効に|オンに|ONに|enable|turn\s*on|をオン/iu;
const DISABLE =
  /無効化|無効に|オフに|OFFに|disable|turn\s*off|をオフ/iu;

/** Map common aliases → ISO id */
const ISO_ALIASES: Array<{ re: RegExp; id: string }> = [
  { re: /\bISO-?27001\b|ISMS|情報セキュリティ(?:マネジメント)?/iu, id: "ISO-27001" },
  { re: /\bISO-?9001\b|品質マネジメント/iu, id: "ISO-9001" },
  { re: /\bISO-?21401\b/iu, id: "ISO-21401" },
  { re: /\bISO-?13485\b/iu, id: "ISO-13485" },
  { re: /\bISO-?22301\b/iu, id: "ISO-22301" },
  { re: /\bISO-?45001\b/iu, id: "ISO-45001" },
  { re: /\bISO-?14001\b/iu, id: "ISO-14001" },
];

const MODULE_ALIASES: Array<{ re: RegExp; id: string }> = [
  { re: /レンタル|rental/iu, id: "rental" },
  { re: /ホスピタリティ|hospitality|宿泊/iu, id: "hospitality" },
  { re: /プロフェッショナル|professional_services/iu, id: "professional_services" },
];

export interface TenantConfigChatParse {
  target: TenantConfigTarget;
  targetId: string;
  enabled: boolean;
}

export function parseTenantConfigProposeIntent(
  message: string
): TenantConfigChatParse | null {
  const n = message.normalize("NFKC").trim();
  const enable = ENABLE.test(n);
  const disable = DISABLE.test(n);
  if (!enable && !disable) return null;
  if (enable && disable) return null;

  for (const alias of ISO_ALIASES) {
    if (alias.re.test(n)) {
      return { target: "standards", targetId: alias.id, enabled: enable };
    }
  }

  const isoId = n.match(/\b(ISO-\d{4,5})\b/i)?.[1]?.toUpperCase();
  if (isoId && /標準|ISO|規格|スタンダード/i.test(n)) {
    return { target: "standards", targetId: isoId, enabled: enable };
  }
  if (isoId && (enable || disable)) {
    // bare ISO-NNNN with enable/disable verb
    return { target: "standards", targetId: isoId, enabled: enable };
  }

  if (/モジュール|module/i.test(n) || MODULE_ALIASES.some((a) => a.re.test(n))) {
    for (const alias of MODULE_ALIASES) {
      if (alias.re.test(n)) {
        return { target: "modules", targetId: alias.id, enabled: enable };
      }
    }
    const modId = n.match(
      /\b([a-z][a-z0-9_]{2,})\b/i
    )?.[1]?.toLowerCase();
    if (modId && modId !== "module" && modId !== "iso") {
      return { target: "modules", targetId: modId, enabled: enable };
    }
  }

  return null;
}

export function isTenantConfigProposeIntent(message: string): boolean {
  return parseTenantConfigProposeIntent(message) !== null;
}

export interface TenantConfigChatResult {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  change_id?: string;
  approval_id?: string;
}

export function handleTenantConfigProposeChatMessage(
  message: string,
  opts: { proposedBy: string }
): TenantConfigChatResult {
  const parsed = parseTenantConfigProposeIntent(message);
  if (!parsed) return { handled: false };

  try {
    const result = proposeTenantConfigChange({
      target: parsed.target,
      targetId: parsed.targetId,
      enabled: parsed.enabled,
      proposedBy: opts.proposedBy,
    });
    return {
      handled: true,
      ok: true,
      change_id: result.change.change_id,
      approval_id: result.approval_id,
      reply: [
        `設定変更を提案しました（承認待ち）。`,
        ``,
        `- ${result.change.target} **${result.change.target_id}**: ${result.change.from_enabled} → ${result.change.to_enabled}`,
        `- 変更票: \`${result.change.change_id}\``,
        `- 承認: \`${result.approval_id}\``,
        ``,
        `CEO は Steward Chat の「設定変更の承認」から差分を確認し、承認してください。`,
      ].join("\n"),
    };
  } catch (err) {
    return {
      handled: true,
      ok: false,
      reply: `提案できません: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
