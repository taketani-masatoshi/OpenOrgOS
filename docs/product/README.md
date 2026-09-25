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
| [pricing.md](pricing.md) | 公開価格（法人・招待制契約） |
| [legal/terms-of-service.md](legal/terms-of-service.md) | 利用規約正本 |
| [legal/dpa.md](legal/dpa.md) | DPA 正本 |
| [sla.md](sla.md) | SLA（P2） |
| [customer-admin.md](customer-admin.md) | 顧客 admin |
| [fleet-operations.md](fleet-operations.md) | 5 社フリート運用 |
| [onboarding.md](onboarding.md) | オンボーディングチェックリスト |
| [customer-journey-evidence.md](customer-journey-evidence.md) | 顧客業務の完走経路と証跡区分 |
| [customer-pilot-measurement.md](customer-pilot-measurement.md) | 完走率・作業時間・支援負担・訂正の測定と集計 |
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

### 経理スコープ限定スコア（A0–A3）

100点は、隔離テナントで通年仕訳・銀行消込・12か月締め・年度決算が完走し、実運用テナントの健全性とUI契約を確認できた状態を示す。法人税等の確定仕訳、法定申告書の完成、e-Tax / eLTAX提出、税理士・代表者の最終確認は分母外であり、会計・税務業務全体の完了を意味しない。

| ゲート | 目標 | 主な必須 |
|--------|------|----------|
| **A0** | 70 | 隔離テナントの通年仕訳・銀行消込・12か月締め・年度決算が完走 |
| **A1** | 85 | A0 + active fleet・pilot validate・電帳法基本の実データ確認 |
| **A2** | 95 | A1 + 税理士 handoff と法定申告除外範囲の契約確認 |
| **A3** | **100** | A2 + 月次締め API/UI 契約を確認。法定申告・電子提出は対象外 |

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

### 証拠の読み方

readiness のスコアは実装・自動検証の成熟度を示すもので、本番実証や顧客継続利用を意味しません。顧客業務の完走状況は [customer-journey-evidence.md](customer-journey-evidence.md) の区分で確認します。

- [消込トランザクションの障害復旧](reconciliation-recovery.md): 承認者認証、復旧記録、失敗後の再実行。
