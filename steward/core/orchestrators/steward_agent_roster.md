# Steward Agent — 全 Agent 特性カタログ（オーケストレーター用）

**読者:** Steward Agent（経営統括）· COO · 人間 CEO  
**版:** 2026-07-11 · **生成元・正本:** [registry.yaml](../agents/registry.yaml)
テナントごとの有効化は `data/operator/agents.yaml`（`orgos agent roster show`）。本書は説明用ミラー。

Steward Agent は **正データを編集せず**、本カタログに従い **委譲 · Work Order · 要約統合** する。各 Agent の「特性」= **得意 · 禁止 · 人間承認 · 報告線**。

---

## 1. オーケストレーション原則

| 原則 | 内容 |
|------|------|
| **要約経由** | Steward は `agent-summaries/` · dashboard のみ原則読取 |
| **一本化** | 日次実務指揮は **COO** → Growth/PM/総務 |
| **報告チェーン** | **全現場 Agent**（コア 5 + 拡張）→ **COO 中継** → **Executive Steward** · 正本: [chain-policy.yaml](../reporting/chain-policy.yaml) · CLI: `orgos agent order` · `report` · `relay` |
| **財務三角** | **Finance**（予実/計画）→ **Accounting**（実務）→ **Tax**（申告） |
| **法務三角** | **Legal**（レビュー）→ **Contract**（台帳 SoT）→ **Compliance**（規程/ISO） |
| **人間ゲート** | 契約締結 · 振込 · 登記提出 · 採用決定 · 公開投稿 · 開示 |

**委譲 CLI:** `npm run orgos -- escalate plan` · `route match` · [delegate_growth_team.md](delegate_growth_team.md)

---

## 2. コア Agent（6 · 常時）

| id | 特性（Steward 向け） | いつ委譲するか | 触れないもの | 人間承認 |
|----|---------------------|---------------|-------------|---------|
| **executive_steward** | 統合判断 · KPI · P0 整理。**自分は実装しない** | （自分 — 委譲のみ） | `data/**` 直編 | 最終決定すべて |
| **secretary** | 社長時間 · 社外窓口 · 1-on-1。**財務数値を出さない** | 予定 · 社外メール · 招集日程 | finance/contracts 詳細 | メール送信 |
| **finance** | 予実 · CF · 決算 **数値 SoT**。経理実務は Accounting へ | ランウェイ · 予算 · 計画 YAML | 規程改定 · inbox 路由 | 投資 · 返済方針 |
| **contract** | **契約台帳 SoT** · 期限。条項レビューは Legal | CTR 更新 · 期限アラート | 規程 · 定款条文 | 新規締結 |
| **compliance** | 規程 · ISO · 許認可 INDEX · 個情テンプレ | 届出期限 · ISO ギャップ | 契約金額編集 | 規程改定施行 |
| **operations** | inbox/outbox **路由のみ**。内容判断は専門 Agent | スキャン滞留 · travel 手配 | finance YAML · 契約条項 | 決済 · 印刷提出 |

---

## 3. Growth ライン（14 · AI カンパニー）

| id | 特性 | 報告 | 人間承認 |
|----|------|------|---------|
| **coo** | **Work Order 中枢**。進捗追跡 · 割当。正データ不触 | executive_steward | — |
| **cto** | 技術方針 · アーキ。実装は engineering | coo | 技術選定最終 |
| **engineering** | コード · テスト · PR | cto | 本番デプロイ |
| **design_lead** | ブランド一貫 · UI 方針 | cto | 公開デザイン |
| **design** | 素材 · モック下書き | design_lead | 同左 |
| **sales_lead** | パイプライン · 見積方針 | coo | 値引 · 受注 |
| **sales_outbound** | コールド · リスト · 初回下書き | sales_lead | メール送信 |
| **sales_inbound** | 問合せ · 提携 | sales_lead | 条件確約 |
| **customer_success** | 既存関係 · 解約防止 | coo | 契約変更 |
| **marketing_lead** | 施策 · コンテンツ計画 | coo | キャンペーン公開 |
| **social_media** | SNS **下書きのみ** | marketing_lead | 投稿公開 |
| **personal_finance** | **法人と分離** · gitignore 推奨 | executive_steward | 個人振込 |
| **legal** | 契約レビュー · **定款/登記ドラフト** | executive_steward | 登記 · 認証 |
| **security** | 分類境界 · インシデント初動 | executive_steward | credential ローテ |

---

## 4. 一般企業 P0（全法人ほぼ必須）

| id | 特性 | Steward への報告内容 | よくある混同 | 人間承認 |
|----|------|---------------------|-------------|---------|
| **human_resources** | 労務 · 社保 · 就業規則。**給与 SoT は Finance と協調** | 採用進捗 · 36協定 · 社保届ドラフト | Operations の HR テンプレ | 解雇 · 採用決定 |
| **corporate_governance** | 株総 · 取締役会 · 議事録 · 招集 | 開催期限 · 議案ドラフト | Secretary（日程のみ） | 決議 · 公告 |
| **accounting** | **請求 · 支払 · 仕訳 · インボイス実務** | 未請求 · 未払 · 月次実務 | Finance（予実） | 振込実行 |
| **tax** | 法人税 · 消費税 · **申告サイクル** | 申告期限 · 添付不足 | Finance（数値） | e-Tax 提出 |

**Steward 向け早見:** 数値の「意味」を聞く → **finance** · 請求書を出す → **accounting** · 申告書 → **tax** · 株総準備 → **corporate_governance**

---

## 5. 一般企業 P1（中堅・成長）

| id | 特性 | 委譲トリガー | 人間承認 |
|----|------|-------------|---------|
| **procurement** | ベンダー · 発注 · **REG-004 稟議** | 調達 · 見積比較 | 発注 · 契約 |
| **government_affairs** | 補助金 · 認定 · 行政書類 | 補助金 · 交付金 | 申請提出 |
| **intellectual_property** | 商標 · 特許 · ライセンス | 出願 · 侵害初動 | 出願 · 訴訟 |
| **general_affairs** | 備品 · 庶務 · 社内通知 | オフィス · 備品 | 高額購買 |
| **project_management** | 案件 WBS · 進捗 · クライアント報告 | 受託 · SI · 工事 | スコープ変更 |
| **product_management** | PRD · ロードマップ · 優先度 | 機能要件 · SaaS | 価格 · リリース |
| **recruiting** | JD · パイプライン（**HR 配下**） | 採用活動 | 内定 |
| **risk_insurance** | 損保 · BCP · 更新 | 保険満了 | 契約締結 |
| **data_analytics** | dashboard **補完** · 深掘り分析 | KPI なぜ | —（Read 中心） |
| **devops** | CI/CD · infra（**product engineering と分離**） | 障害 · リリース手順 | prod 変更 |

---

## 6. 一般企業 P2（規模・業種依存）

| id | 特性 | 報告線 | 人間承認 |
|----|------|--------|---------|
| **investor_relations** | 株主 · VC 向け資料 · **未公開情報厳禁** | executive_steward | 開示 · 説明会 |
| **esg_sustainability** | ESG · カーボン非財務 | compliance | 報告公開 |
| **internal_audit** | 監査独立性 · Compliance と役割分離 | executive_steward | 監査報告 |
| **privacy_officer** | DPIA · 越境 · REG-010 専任 | compliance | ポリシー公開 |
| **treasury** | 資金繰り · FX · 多口座 | finance | 借入 · FX 実行 |
| **customer_support** | Tier1 FAQ · チケット（**CS 配下**） | customer_success | 返金 |
| **pr_communications** | プレス · **危機広報** | marketing_lead | プレス公開 |
| **learning_development** | 研修 · オンボ教材 | human_resources | — |
| **corporate_development** | M&A · 提携 DD メモ | executive_steward | 買収 · 提携 |
| **quality_assurance** | ISO 9001 運用 · 不適合 | coo | 出荷停止 |
| **medical_device_regulatory** | ISO 13485 · QMS · GVP · 薬事台帳 | compliance | PMDA 届出 |

---

## 7. 業務モジュール Agent（テナント ON/OFF）

| 種別 | 特性 | Steward の扱い |
|------|------|---------------|
| `rental` · `hospitality` 等 | 業種 SoT · `modules.yaml` で有効時のみ | 要約 `summary_dir` 経由 · 無効は **読まない** |
| `jp_corporate_registration` | Legal が proxy · 定款 CLI | 登記は人間 |
| `jp_subsidy_application` | government_affairs が proxy | 申請は人間 |

---

## 8. 委譲決定木（Steward 用）

```
依頼が来た
├─ 社長の予定・社外？ → secretary
├─ 実務が多く割当が必要？ → coo
├─ 数値・予算・CF？ → finance（実務請求は accounting）
├─ 税務申告？ → tax
├─ 契約台帳・期限？ → contract（レビューは legal）
├─ 規程・ISO・許認可？ → compliance（個情専任は privacy_officer）
├─ 書類スキャン・travel？ → operations
├─ 営業・マーケ・CS？ → sales_lead / marketing_lead / customer_success
├─ コード・インフラ？ → cto → engineering / devops
├─ 人事・株総？ → human_resources / corporate_governance
├─ 補助金・知財？ → government_affairs / intellectual_property
└─ 判断材料が足りない？ → data_analytics（Read）→ CEO へ質問
```

---

## 9. Agent 間の衝突回避

| 境界 | 正しい分担 |
|------|-----------|
| Finance vs Accounting | 予実/計画 vs 請求/支払/仕訳 |
| Finance vs Tax | 数値 SoT vs 申告書・添付 |
| Legal vs Contract | レビュー vs 台帳 CTR |
| Legal vs Compliance | 契約/登記 vs 規程/ISO |
| Compliance vs Privacy Officer | 規程全体 vs 個情/DPIA 専任 |
| Compliance vs Internal Audit | 規程維持 vs 独立監査 |
| Customer Success vs Support | 関係/KPI vs Tier1 問合せ |
| Marketing vs PR | 施策/SNS vs プレス/危機 |
| Engineering vs DevOps | アプリ vs CI/infra |
| Secretary vs Corporate Governance | 日程 vs 議事録・決議 |
| HR vs Recruiting vs L&D | 労務 vs パイプライン vs 研修 |
| COO vs Operations | Work Order vs inbox 路由 |

---

## 10. 要約の読み方

Steward が daily で見るパス:

```
docs/reports/dashboard/
docs/reports/agent-summaries/{finance,contract,compliance,operations,...}/
docs/reports/executive-notes/
docs/reports/routing-queue/   ← COO · Work Order
```

Growth/一般企業 Agent の要約は **Phase 2 で dashboard 自動連携**（registry gaps）。現状は Work Order 完了時に各 Agent が `agent-summaries/{id}/` へ書く想定。

---

## Catalog index（generated · registry.yaml）

<!-- orgos:generated:catalog-index:start -->
| id | tier | class | activation | reports_to | definition |
|----|------|-------|------------|------------|------------|
| `platform_guide` | advisor | advisor | developer_explicit | cto | [platform_guide_agent.md](platform_guide_agent.md) |
| `compliance` | core | operational | always | coo | [compliance_agent.md](compliance_agent.md) |
| `contract` | core | operational | always | coo | [contract_agent.md](contract_agent.md) |
| `executive_steward` | core | operational | always | — | [executive_steward_agent.md](executive_steward_agent.md) |
| `finance` | core | operational | always | coo | [finance_agent.md](finance_agent.md) |
| `operations` | core | operational | always | coo | [operations_agent.md](operations_agent.md) |
| `secretary` | core | operational | always | coo | [secretary_agent.md](secretary_agent.md) |
| `setup` | core | operational | always | — | [setup_agent.md](setup_agent.md) |
| `accounting` | extension | operational | always | finance | [accounting_agent.md](accounting_agent.md) |
| `coo` | extension | operational | always | executive_steward | [coo_agent.md](coo_agent.md) |
| `corporate_development` | extension | operational | always | executive_steward | [corporate_development_agent.md](corporate_development_agent.md) |
| `corporate_governance` | extension | operational | always | executive_steward | [corporate_governance_agent.md](corporate_governance_agent.md) |
| `cto` | extension | operational | always | coo | [cto_agent.md](cto_agent.md) |
| `customer_success` | extension | operational | always | coo | [customer_success_agent.md](customer_success_agent.md) |
| `customer_support` | extension | operational | always | customer_success | [customer_support_agent.md](customer_support_agent.md) |
| `data_analytics` | extension | operational | always | executive_steward | [data_analytics_agent.md](data_analytics_agent.md) |
| `design` | extension | operational | always | design_lead | [design_agent.md](design_agent.md) |
| `design_lead` | extension | operational | always | cto | [design_lead_agent.md](design_lead_agent.md) |
| `devops` | extension | operational | always | cto | [devops_agent.md](devops_agent.md) |
| `engineering` | extension | operational | always | cto | [engineering_agent.md](engineering_agent.md) |
| `esg_sustainability` | extension | operational | always | compliance | [esg_sustainability_agent.md](esg_sustainability_agent.md) |
| `general_affairs` | extension | operational | always | coo | [general_affairs_agent.md](general_affairs_agent.md) |
| `government_affairs` | extension | operational | always | executive_steward | [government_affairs_agent.md](government_affairs_agent.md) |
| `human_resources` | extension | operational | always | executive_steward | [human_resources_agent.md](human_resources_agent.md) |
| `intellectual_property` | extension | operational | always | legal | [intellectual_property_agent.md](intellectual_property_agent.md) |
| `internal_audit` | extension | operational | always | executive_steward | [internal_audit_agent.md](internal_audit_agent.md) |
| `investor_relations` | extension | operational | always | executive_steward | [investor_relations_agent.md](investor_relations_agent.md) |
| `learning_development` | extension | operational | always | human_resources | [learning_development_agent.md](learning_development_agent.md) |
| `legal` | extension | operational | always | executive_steward | [legal_agent.md](legal_agent.md) |
| `mail_intake` | extension | operational | always | secretary | [mail_intake_agent.md](mail_intake_agent.md) |
| `mail_outbound` | extension | operational | always | secretary | [mail_outbound_agent.md](mail_outbound_agent.md) |
| `marketing_lead` | extension | operational | always | coo | [marketing_lead_agent.md](marketing_lead_agent.md) |
| `medical_device_regulatory` | extension | operational | always | compliance | [medical_device_regulatory_agent.md](medical_device_regulatory_agent.md) |
| `personal_finance` | extension | operational | always | executive_steward | [personal_finance_agent.md](personal_finance_agent.md) |
| `pr_communications` | extension | operational | always | marketing_lead | [pr_communications_agent.md](pr_communications_agent.md) |
| `privacy_officer` | extension | operational | always | compliance | [privacy_officer_agent.md](privacy_officer_agent.md) |
| `procurement` | extension | operational | always | coo | [procurement_agent.md](procurement_agent.md) |
| `product_management` | extension | operational | always | cto | [product_management_agent.md](product_management_agent.md) |
| `project_management` | extension | operational | always | coo | [project_management_agent.md](project_management_agent.md) |
| `quality_assurance` | extension | operational | always | coo | [quality_assurance_agent.md](quality_assurance_agent.md) |
| `records_audit` | extension | operational | always | executive_steward | [records_audit_agent.md](records_audit_agent.md) |
| `recruiting` | extension | operational | always | human_resources | [recruiting_agent.md](recruiting_agent.md) |
| `risk_insurance` | extension | operational | always | executive_steward | [risk_insurance_agent.md](risk_insurance_agent.md) |
| `sales_inbound` | extension | operational | always | sales_lead | [sales_inbound_agent.md](sales_inbound_agent.md) |
| `sales_lead` | extension | operational | always | coo | [sales_lead_agent.md](sales_lead_agent.md) |
| `sales_outbound` | extension | operational | always | sales_lead | [sales_outbound_agent.md](sales_outbound_agent.md) |
| `security` | extension | operational | always | executive_steward | [security_agent.md](security_agent.md) |
| `social_media` | extension | operational | always | marketing_lead | [social_media_agent.md](social_media_agent.md) |
| `tax` | extension | operational | always | finance | [tax_agent.md](tax_agent.md) |
| `treasury` | extension | operational | always | finance | [treasury_agent.md](treasury_agent.md) |
<!-- orgos:generated:catalog-index:end -->

## 関連

- [org-chart.md](../agents/org-chart.md)
- [executive_steward_agent.md](../agents/executive_steward_agent.md)
- [delegate_growth_team.md](delegate_growth_team.md)
- [secretary_escalation.md](secretary_escalation.md)

<!-- orgos:generated:catalog-stats:start -->
| 指標 | 値 | 正本 |
|------|-----|------|
| catalog agents | 50 | `steward/core/agents/registry.yaml` |
| active agents | 49 | registry `status: active` |
| skills (registry) | 127 | `steward/core/skills/registry.yaml` + modules |
| runtime: cli | 48 | registry |
| runtime: agent | 79 | registry（旧 cursor-only 含む） |
| テナント有効化 | `orgos agent roster show` | `data/operator/agents.yaml` |
| pulse 対象 | active roster のみ | `orgos agent pulse --all` |
<!-- orgos:generated:catalog-stats:end -->
