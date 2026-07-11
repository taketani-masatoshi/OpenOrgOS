import { z } from "zod";

export const mailProviderSchema = z.enum(["smtp", "gmail_api", "dry_run"]);

export const mailConfigSchema = z.object({
  provider: mailProviderSchema.default("dry_run"),
  from: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  smtp: z
    .object({
      host: z.string().min(1),
      port: z.number().int().positive().default(587),
      secure: z.boolean().default(false),
    })
    .optional(),
  receive: z
    .object({
      /** IMAP/API 受信同期（docs/io/inbox · Wire protocol/inbox とは別） */
      sync: z.enum(["stub", "imap", "gmail_api"]).default("stub"),
      imap_host: z.string().optional(),
      imap_port: z.number().int().positive().optional(),
      imap_mailbox: z.string().default("INBOX"),
      gmail_label: z.string().optional(),
      /** ポーリング間隔（秒）— orgos mail intake sync --watch */
      poll_interval_sec: z.number().int().positive().default(300),
      /** 分類エンジン（初版: rules · llm/hybrid は将来拡張） */
      triage_mode: z.enum(["rules", "llm", "hybrid"]).default("rules"),
      /** CEO 直接確認 — inline=Today 短問 · consult=CONSULT MD（非推奨） */
      ceo_question_mode: z.enum(["inline", "consult"]).default("inline"),
      /** 受信解釈の複数 LLM 多数決 */
      interpret_ensemble: z.boolean().default(true),
      /** 解釈モデル（空なら ORGOS_MAIL_INTERPRET_MODELS / ORGOS_LLM_MODEL） */
      interpret_models: z.array(z.string()).default([]),
      /** 同期後に自動トリアージ */
      auto_triage: z.boolean().default(true),
      /** 同期後に Wire MIME を protocol inbox へ ingest（R5 Phase 2） */
      auto_wire_scan: z.boolean().optional(),
      /** p0/p1 または immediate/today で通知 */
      notify_high_priority: z.boolean().default(true),
    })
    .default({ sync: "stub" }),
  outbound: z
    .object({
      /** Secretary 送信時に既定 CC する oversight 宛先（CEO 等） */
      cc_defaults: z
        .array(
          z.object({
            email: z.string().email(),
            role: z.string().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  /** Wire protocol SMTP — separate from Secretary from address (R5). */
  wire_outbound: z
    .object({
      enabled: z.boolean().default(false),
      from: z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
      smtp: z
        .object({
          host: z.string().min(1),
          port: z.number().int().positive().default(587),
          secure: z.boolean().default(false),
        })
        .optional(),
      /** 1 時間あたりの email_wire 試行上限（Phase 3 · 0=無制限） */
      max_per_hour: z.number().int().nonnegative().default(0),
    })
    .optional(),
  notes: z.string().optional(),
});

export type MailConfig = z.output<typeof mailConfigSchema>;
