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
| [0027](0027-budget-envelope-governance.md) | 予算執行枠ガバナンス（計画ロック · 調整帯 · 取締役会） | Accepted |
| [0032](0032-amount-free-receipt-wire-claim.md) | QR 領収書 Wire claim は amount-free | Accepted |
| [0033](0033-deterministic-fact-provider-registry.md) | 決定論 Fact Provider Registry（HR headcount 含む） | Accepted |
| [0034](0034-llm-worker-pool-routing.md) | LLM Worker Pool（ローカル優先 + クラウド昇格） | Accepted |
| [0035](0035-chat-command-router.md) | Chat Command Router（依頼→CLI 決定論実行） | Accepted |
| [0036](0036-tenant-config-approval.md) | テナント設定変更の承認付き適用（modules/standards） | Accepted |
| [0037](0037-dual-passkey-settlement-stepup.md) | Dual PassKey（ログイン / 決済 step-up） | Accepted · [実装計画](../org-os/passkey-iphone-qr-implementation-plan.md) |
| [0038](0038-human-approval-context.md) | 全最終承認の HumanApprovalContext | Accepted |
| [0039](0039-agent-fs-guard.md) | Agent 正本書込ゲート（Ed25519 · 署名付き grant） | Accepted |
| [0040](0040-aia-parallel-runtime.md) | AIA 並行ランタイム（10/20/30 · 隔離 · Integration） | Accepted |
| [0041](0041-passkey-bootstrap-token.md) | Passkey bootstrap token（本番初回登録） | Accepted |
| [0042](0042-webauthn-challenge-file-store.md) | WebAuthn challenge file store（複数プロセス） | Accepted |
| [0043](0043-pmo-portfolio-ssot.md) | PMO ポートフォリオ SSOT（COO WO · モジュール案件の三角） | Accepted |
| [0044](0044-work-order-dag-orchestration.md) | Work Order DAG orchestration（状態機械 · depends_on · orchestrate CLI） | Accepted |
| [0045](0045-company-events-chain-trust-anchor.md) | 会社イベントチェーン内部トラストアンカー（records_audit hardening） | Accepted |
| [0046](0046-tax-obligation-rhythm-engine.md) | 税務 obligation rhythm エンジン · 概算金額方針 | Accepted |
| [0051](0051-jp-tax-skills-cli-only.md) | JP tax skill CLI-only · tax readiness 指標分離 | Accepted |
| [0052](0052-tax-filing-phase5-deferred.md) | e-Tax / XML / 宿泊税 ledger — Phase 5 defer ロードマップ | Proposed |
| [0046](0046-analytics-metric-catalog-ssot.md) | Analytics メトリクス Catalog SSOT（resolver · KPI 定義） | Accepted |
| [0047](0047-sales-line-deterministic-stack.md) | 営業ライン決定論スタック（pipeline CLI · fact provider · validate） | Accepted |
| [0048](0048-investor-relations-ssot.md) | 自社 IR SSOT（cap table · 開示カレンダー · investor_relations モジュール） | Accepted |
| [0049](0049-inbound-inquiry-intake.md) | インバウンド問合せメール intake（routing sales_inbound · inquiries 起票） | Accepted |
| [0050](0050-customer-success-deterministic-stack.md) | カスタマーサクセス決定論スタック（health score · モジュール · fact provider） | Accepted |
| [0053](0053-module-readiness-score.md) | Module Readiness Score（公式 7 軸 · `orgos modules readiness`） | Accepted |
| [0056](0056-consumption-tax-assessment-vs-refund.md) | 消費税は集計（Assessment）と還付手続（Fulfilment）を分ける | Accepted |
| [0058](0058-orgos-ledger-product-layer.md) | OrgOS Ledger 製品層（マネージド単一テナント · 電子帳簿必須 · e-Tax 別） | Accepted |
| [0059](0059-chat-answer-memory.md) | Chat answer memory（クラウド回答をローカル LLM の参考注入） | Accepted |
| [0060](0060-local-llm-change-gates.md) | ローカル LLM 変更ゲート（plan/apply · 等級 A/B/C） | Accepted |
| [0061](0061-local-llm-error-fallback.md) | ローカル LLM ERROR フォールバック（`ERROR: <理由>` 1行） | Accepted |

## 新規 ADR

1. 次の番号で `docs/adr/NNNN-title.md` を作成
2. 本 README の一覧表を更新
3. 関連する `steward/rules/` または `docs/spec/` からリンク
