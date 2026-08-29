# OrgOS Ledger — 製品層（Product Layer）

**SKU:** OrgOS Ledger  
**ターゲット:** 日本法人（株式会社・合同会社）  
**ホスティング:** マネージド単一テナント（1 顧客 = 1 workspace + 1 コンテナ）  
**Core との関係:** [ADR 0058](../adr/0058-orgos-ledger-product-layer.md)

## 含まれるもの（P1 完了 · P2–P4 進行中）

| 領域 | 内容 |
|------|------|
| 帳簿 | GL · 試算表 · BS/PL · 前期比較 · **銀行 CSV 取込 UI** · 消込 · 期間ロック |
| 通年デモ | `orgos ledger product seed-demo-year`（provision 既定は空仕訳） |
| 電子帳簿 | 基本要件 · **優良（TSA）は別 SKU** `dencho-premium` |
| 二重防止 | invoice / JE-MPL は **property 単位** · 重複は validate error |
| UI | Workbench · HTTP CSV export · **セルフサインアップ** `/signup` · **税務** `/?tax=1` · **アカウント** `/?account=1`（設定からも） |
| 課金 | Stripe Checkout · Customer Portal · `product/subscription.yaml` |
| 顧客 admin | オペレーター招待 · **税理士ゲスト（期限付き readonly）** · 利用上限表示 |
| 法定準備 | 消費税 assessment · 納付期限 · 給与 accrual/payment |
| 運用 | Runbook · **フリート health / backup** · readiness スコア |

## 別モジュール（会計と分離）

| モジュール | 内容 |
|-----------|------|
| **税務** `/?tax=1` · `orgos tax package` | 法人税 XML 正本 · 顧問 handoff ZIP · **e-Tax 提出は人間のみ（ADR 0052）** |
| 給与・賞与・年末調整 | `jp_payroll` · `/chat/v1/tax/bonus-draft` · YEA skeleton（完全自動化は Phase 4+） |

## ドキュメント一覧

| 文書 | 用途 |
|------|------|
| [managed-single-tenant-runbook.md](managed-single-tenant-runbook.md) | プロビジョン〜本番 |
| [security-overview.md](security-overview.md) | 顧客向けセキュリティ概要 |
| [pricing.md](pricing.md) | プラン案（法人） |
| [legal/terms-of-service-draft.md](legal/terms-of-service-draft.md) | 利用規約正本 |
| [legal/dpa-draft.md](legal/dpa-draft.md) | DPA 正本 |
| [sla.md](sla.md) | SLA（P2） |
| [customer-admin.md](customer-admin.md) | 顧客 admin |
| [fleet-operations.md](fleet-operations.md) | 5 社フリート運用 |
| [onboarding.md](onboarding.md) | オンボーディングチェックリスト |
| [control-plane.md](control-plane.md) | 共有コントロールプレーン（P3） |
| [deploy/product/stripe.md](../../deploy/product/stripe.md) | Stripe 設定 |

## 製品性スコア目標

製品層・課金運用・**経理商用**は独立ゲートです。

| ゲート | CLI | 意味 |
|--------|-----|------|
| **製品** | `orgos ledger product readiness` | 製品層 P0–P4（実装・パイロット骨格） |
| **課金運用 commercial** | `orgos ledger product readiness --commercial` | 有料顧客受入 C0–C3（課金 live・復旧 drill・監視等）。`legal-signed` は人手 |
| **経理商用** | `orgos ledger product readiness --accounting` | 通年帳簿・銀行消込・月次締め・電帳法基本・税務 handoff（e-Tax 提出なし） |

| フェーズ | 目標 | ゲート |
|----------|------|--------|
| **P0** | 58 | 契約付きパイロット 1 社をプロビジョン可能 |
| **P1** | 72 | Stripe · セルフサインアップ · プロビジョン CLI |
| **P2** | 85 | 5 社運用 · SLA · 顧客 admin · バックアップ |
| **P3** | 93 | 共有コントロールプレーン · 50 テナント隔離 · テナント別レート制限 |
| **P4** | 100 | 電帳法 · チャネル · ポータビリティ · 申告 XML 正本 |

### 経理商用スコア（A0–A3）

| ゲート | 目標 | 主な必須 |
|--------|------|----------|
| **A0** | 70 | `--accounting` 可視化 · seed/COA 整合 · fleet active healthy（drill 除外） |
| **A1** | 85 | 通年 validate 緑 · 銀行 E2E · 月次ロック/比較 |
| **A2** | 95 | 初回仕訳フォールバック · tax package 一貫 · ゲスト経理閲覧 |
| **A3** | **100** | 賞与→仕訳骨格 · 月次クローズ CL · dencho premium 文言一貫 |

### 進捗確認

```bash
orgos ledger product readiness --customer-ux # 顧客商用体験（初心者・WebUI・AIA）
orgos ledger product readiness              # 製品チェックリスト（コード・パイロット）
orgos ledger product readiness --commercial # 商用ゲート（課金・復旧・運用）
orgos ledger product readiness --accounting # 経理商用ゲート（帳簿・消込・締め・handoff）
orgos ledger product fleet-health           # 全 ledger テナント validate（active · drill 除外）
orgos ledger product billing-issues         # past_due / 解約 / unhealthy
orgos ledger product monitor --fail-on-unhealthy
orgos ledger product stripe-status
./scripts/backup-ledger-fleet.sh
./scripts/drill-ledger-restore.sh <tenant> <archive.tar.gz>
```

| スコア | 意味 |
|--------|------|
| `readiness --customer-ux` | 顧客体験 6 軸（オンボ・日常記帳・月次・WebUI・AIA・契約招待） |
| `readiness` | 製品層 P0–P4（実装・パイロット骨格） |
| `readiness --commercial` | 有料顧客受入ゲート C0–C3（課金 live・復旧 drill・監視等） |
| `readiness --accounting` | 経理実務受入ゲート A0–A3（通年帳簿・銀行・締め・税務 handoff） |
