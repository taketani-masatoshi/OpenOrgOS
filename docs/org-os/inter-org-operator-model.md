# Inter-org · Operator Model（人間承認ゲート）

**Parent:** [inter-org-two-org-demo.md](inter-org-two-org-demo.md) · [openorgos-core-philosophy.md](openorgos-core-philosophy.md)

## 原則

| 主体 | 役割 | 組織間 wire |
|------|------|-------------|
| **Steward Agent** | **自組織内**の SoT · 下書き · 整合チェック | **送らない** |
| **Org オペレータ / Secretary** | 通知案の作成 · `notice draft` | propose のみ |
| **承認者（CEO 等）** | REG-004 に基づく送信許可 | approve で初めて outbox へ |
| **相手 Org オペレータ** | 受信記録 · 受諾確認 | inbound / ack |

## Notice ワークフロー（全 outbound wire 共通）

| `transaction_type` | propose 必須 |
|--------------------|--------------|
| `contract.execution.notice` | `--contract CTR-*` |
| `obligation.acknowledged` | `--correlation-event <uuid>` |
| `invoice.issued` | `--invoice <id>` |
| `payment.instructed` | `--broker-instruction` · `--amount` |

**`bridge*`** → `PendingNotice` 起案のみ（approve 必須）。

## CLI（抜粋）

```bash
# Secretary 起案
npm run steward -- --tenant mal protocol notice draft \
  --peer PEER-001 --contract CTR-012

# 承認者確認
npm run steward -- --tenant mal protocol approvers

# CEO 承認 → 署名付き outbox · peer へ deliver（webhook URL 設定時）
npm run steward -- --tenant mal protocol notice approve \
  --id NOTICE-* --approver "段燕燕"

# 相手 peer 登録（identity から公開鍵）
npm run steward -- --tenant southwood protocol peer register \
  --name "株式会社MAL" --jurisdiction JP \
  --org-uri steward://tenant/mal \
  --identity-file tenants/mal/docs/protocol/outbox/01-mal-identity-presented.json \
  --webhook-url http://127.0.0.1:9473/steward/webhook
```

## REG-004（法域別）

正本: `steward/platform/protocol/approval-thresholds.yaml` · 承認者: `data/company.yaml` 代表取締役 / directors

| Tier (JP) | 金額 | approve |
|-----------|------|---------|
| A | ≤ 100,000 JPY | `--approver` |
| B | ≤ 1,000,000 JPY | `--approver` + `--co-approver` |
| C | > 1,000,000 JPY | CLI 不可 |

## Transport · 信頼

| 機能 | パス |
|------|------|
| HTTP ingest | `webhook serve` · `strict_verification: true` |
| Inbox mirror | `docs/protocol/inbox/{event_id}.json` |
| 署名 | `data/protocol/signing-key.pem` · identity に `protocol_public_key` |
| 配送 | `protocol deliver` · peer `inbound_webhook_url` |
| **Witness プール** | `data/protocol/witness-pool.yaml` · fan-out · [witness-hub-requirements.md](witness-hub-requirements.md) |

## 実装

- `notice-workflow.ts` · `approval-policy.ts` · `approver-registry.ts`
- `signing.ts` · `inbound-verify.ts` · `transport.ts`
- Skill: `steward/core/skills/inter_org_notice_draft.md`
