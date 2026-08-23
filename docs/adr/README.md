# Architecture Decision Records (ADR)

OpenOrgOS の **主要なアーキテクチャ判断** を記録する。正本は本ディレクトリ。

**憲章:** [steward/rules/openorgos-engineering-constitution.md](../../steward/rules/openorgos-engineering-constitution.md) §9

## 形式

| 項目 | 内容 |
|------|------|
| **番号** | `NNNN-kebab-title.md`（4 桁ゼロ埋め · 昇順） |
| **状態** | Proposed · Accepted · Deprecated · Superseded |
| **必須セクション** | Context · Decision · Consequences |

## 一覧

| ADR | タイトル | 状態 |
|-----|---------|------|
| [0001](0001-adopt-engineering-constitution.md) | Engineering Constitution の採用 | Accepted |
| [0002](0002-engineering-rules-split.md) | Engineering Rules の分割構成 | Accepted |
| [0003](0003-constitution-code-compliance-roadmap.md) | 憲章とコード準拠ロードマップ | Accepted |
| [0004](0004-gmail-deferred-opt-in-gate.md) | Gmail / tenant-mail deferred · opt-in 本番ゲート | Accepted |
| [0032](0032-amount-free-receipt-wire-claim.md) | QR 領収書 Wire claim は amount-free | Accepted |
| [0033](0033-deterministic-fact-provider-registry.md) | 決定論 Fact Provider Registry（HR headcount 含む） | Accepted |
| [0034](0034-llm-worker-pool-routing.md) | LLM Worker Pool（ローカル優先 + クラウド昇格） | Accepted |
| [0035](0035-chat-command-router.md) | Chat Command Router（依頼→CLI 決定論実行） | Accepted |
| [0036](0036-tenant-config-approval.md) | テナント設定変更の承認付き適用（modules/standards） | Accepted |
| [0037](0037-dual-passkey-settlement-stepup.md) | Dual PassKey（ログイン / 決済 step-up） | Accepted · [実装計画](../org-os/passkey-iphone-qr-implementation-plan.md) |
| [0038](0038-human-approval-context.md) | 全最終承認の HumanApprovalContext | Accepted |

## 新規 ADR

1. 次の番号で `docs/adr/NNNN-title.md` を作成
2. 本 README の一覧表を更新
3. 関連する `steward/rules/` または `docs/spec/` からリンク
