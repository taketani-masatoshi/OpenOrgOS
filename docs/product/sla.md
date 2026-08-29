# OrgOS Ledger — SLA

**対象:** Business / Accountant プラン · マネージド単一テナント  
**版:** 1.0 · **地位:** 公開正本（顧客送付可）

## 可用性

| 指標 | 目標 |
|------|------|
| 月間稼働率 | **99.5%**（メンテナンス除く） |
| 計画メンテナンス | 月 1 回 · 日曜 02:00–04:00 JST · 事前 7 日通知（[status.md](status.md)） |

## サポート応答

| 重大度 | 定義 | 初動 | 暫定対応 |
|--------|------|------|----------|
| **P1** | 帳簿参照・計上不可 | 4 営業時間 | 24 時間 |
| **P2** | 機能制限・export 不可 | 1 営業日 | 3 営業日 |
| **P3** | 軽微 UI / 質問 | 2 営業日 | 次回リリース |

Business 以上は P1 初動 **2 営業時間**。

## バックアップ・RPO/RTO

| 項目 | 目標 |
|------|------|
| RPO（データ損失許容） | 24 時間（日次 snapshot） |
| RTO（復旧時間） | 8 営業時間 |

## 除外

- 顧客側ネットワーク · Passkey 端末障害
- e-Tax / 国税庁システム障害（別モジュール SLA）
- 不可抗力

## 計測方法（運用）

| 指標 | 手段 | 頻度 |
|------|------|------|
| 稼働率 | `orgos ledger product monitor --fail-on-unhealthy`（cron / launchd） | 5 分 |
| アラート | `product-fleet/support.yaml` の `escalation_webhook` | unhealthy / past_due 時 |
| 復旧ドリル | restore drill（連続成功 2 回品質ゲート） | 四半期以上 |
| 商用ゲート | `orgos ledger product readiness --commercial` | 対外宣言前 |

## 関連

- [status.md](status.md)
- [security-overview.md](security-overview.md)
- [managed-single-tenant-runbook.md](managed-single-tenant-runbook.md)
