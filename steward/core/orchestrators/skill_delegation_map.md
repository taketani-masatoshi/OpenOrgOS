# Skill → Agent 委譲マップ（オーケストレーター用）

**読者:** Steward Agent · COO · 人間オペレータ  
**版:** 2026-07-12 · **実行正本:** `src/lib/skill-execution-mode.ts` · **Skill 索引:** `npm run orgos -- skills list`

> 人数・Skill 一覧・routing 対応・実行 override は **生成セクション**（`npm run agent:docs:sync`）を正とする。手書き表は持たない。

---

## 1. オーケストレーターの動き方

| 主体 | Skill 指定時の役割 |
|------|-------------------|
| **Steward Agent** | 自分用 Skill は **CLI 実行** · 他 Skill は **authority 確認後** direct または **Work Order** |
| **COO** | Steward から降ろされた IMP に **skill id · agent id** を付与 · 進捗追跡 |
| **人間 CEO** | `protocol notice approve` · 振込 · 契約締結 · 公開のみ |

### 委譲手順

```bash
# 1) Skill id またはキーワードで route 確認
npm run orgos -- route match --text "月次締め"

# 2) authority 不一致なら Work Order（executing agent は生成表の override 参照）
npm run orgos -- escalate plan --text "**件名:** 月次締め **実装要件:** monthly_close Skill 実行"

# 3) authority 一致なら direct（auto モード）
npm run orgos -- route dispatch --mode auto --handoff <id>

# 4) 担当 Agent スレッドで Skill 実行
npm run orgos -- skills run monthly-close
# runtime: agent の場合: agent.md + skill ファイルを @（Work Order 経由）
```

**Handoff** に `skill` · `route_id` が付く（`escalate run`）。担当 Agent は **Primary Folders 内のみ** 編集。

---

## 2. 生成インデックス（正本ミラー）

| セクション | 内容 |
|-----------|------|
| [Agent 表示名 → id](#orgosgeneratedagent-label-indexstart) | catalog から導出 |
| [実行 Agent override](#orgosgeneratedexecuting-agent-overridesstart) | `EXECUTING_AGENT_OVERRIDES` |
| [Steward 自実行 Skill](#orgosgeneratedsteward-self-executestart) | `STEWARD_SELF_EXECUTE_SKILLS` |
| [routing ↔ skill](#orgosgeneratedrouting-skill-indexstart) | `steward/core/routing/registry.yaml` |
| [委譲決定木](#orgosgeneratedexecution-decision-treestart) | `resolveSkillExecutionMode` |
| [全 Skill registry](#orgosgeneratedskill-registry-indexstart) | core + modules |
| [runtime 注記](#orgosgeneratedskill-runtime-notestart) | cli / agent |

---

## 3. 多 Agent 衝突時（Steward）

| 依頼 | 優先 Skill / Agent |
|------|-------------------|
| 定款 + 登記 CLI | `legal` + `jp_registry_change` |
| 補助金 + 予算 | `government_affairs` + `finance`（2 IMP 可） |
| 契約期限 + 許認可 | `contract` + `compliance` |
| 月次 + 税務 | `finance`/`accounting` + `tax` |

`escalate plan` は最大 3 Agent（`maxAgents`）。

---

## 関連

- [steward_agent_roster.md](steward_agent_roster.md) — Agent 特性
- [delegate_growth_team.md](delegate_growth_team.md) — COO 委譲雛形
- [../routing/registry.yaml](../routing/registry.yaml)
- [../skills/registry.yaml](../skills/registry.yaml)

<!-- orgos:generated:agent-label-index:start -->
| 表示名 | Agent id |
|--------|----------|
| 経理実務 | `accounting` |
| コンプライアンス | `compliance` |
| 契約管理 | `contract` |
| 統括執行 | `coo` |
| 経企 | `corporate_development` |
| コーポレートガバナンス | `corporate_governance` |
| 技術統括 | `cto` |
| カスタマーサクセス | `customer_success` |
| サポート | `customer_support` |
| データ分析 | `data_analytics` |
| デザイナー | `design` |
| デザイン統括 | `design_lead` |
| DevOps | `devops` |
| エンジニア | `engineering` |
| ESG | `esg_sustainability` |
| ステュワード（経営統括） | `executive_steward` |
| 財務・計画 | `finance` |
| 総務 | `general_affairs` |
| 行政・公的制度 | `government_affairs` |
| 人事・労務 | `human_resources` |
| 統合 | `integration` |
| 知財 | `intellectual_property` |
| 内部監査 | `internal_audit` |
| IR | `investor_relations` |
| 研修 | `learning_development` |
| 法務 | `legal` |
| メール取込 | `mail_intake` |
| メール送信 | `mail_outbound` |
| マーケティング統括 | `marketing_lead` |
| 医療機器薬事 | `medical_device_regulatory` |
| 業務運用 | `operations` |
| 個人財務 | `personal_finance` |
| プラットフォーム実装ガイド | `platform_guide` |
| 広報 | `pr_communications` |
| 個情管理責任者 | `privacy_officer` |
| 購買・調達 | `procurement` |
| プロダクト | `product_management` |
| PMO | `project_management` |
| 品質保証 | `quality_assurance` |
| 記録監査 | `records_audit` |
| 採用 | `recruiting` |
| リスク・保険 | `risk_insurance` |
| 新規開拓（インバウンド） | `sales_inbound` |
| 営業統括 | `sales_lead` |
| 新規開拓（アウトバウンド） | `sales_outbound` |
| 秘書 | `secretary` |
| セキュリティ統括 | `security` |
| 初期設定 | `setup` |
| SNS 担当 | `social_media` |
| 税務 | `tax` |
| 資金・FX | `treasury` |
<!-- orgos:generated:agent-label-index:end -->

<!-- orgos:generated:executing-agent-overrides:start -->
| Skill id | registry agent_id | executing agent_id |
|----------|-------------------|-------------------|
| `jp_company_incorporation` | `secretary` | `legal` |
| `jp_registry_change` | `secretary` | `legal` |
| `jp_subsidy_draft` | `finance` | `government_affairs` |
| `jp_subsidy_eligibility` | `finance` | `government_affairs` |
| `jp_subsidy_labor_cost` | `finance` | `government_affairs` |
| `jp_trademark_checklist` | `compliance` | `intellectual_property` |
| `jp_trademark_draft` | `compliance` | `intellectual_property` |
| `tax_filing_prep` | `tax` | `tax` |
<!-- orgos:generated:executing-agent-overrides:end -->

<!-- orgos:generated:steward-self-execute:start -->
| Skill id | executing agent | Steward の動き |
|----------|-----------------|--------------|
| `daily_ops` | `executive_steward` | Steward **自実行**（CLI）→ 要約読取 |
| `executive_dashboard` | `executive_steward` | Steward **自実行**（CLI）→ 要約読取 |
| `p0_closing` | `executive_steward` | Steward **自実行**（CLI）→ 要約読取 |
<!-- orgos:generated:steward-self-execute:end -->

<!-- orgos:generated:routing-skill-index:start -->
| route id | agent id | skill id |
|----------|----------|----------|
| agent-pulse | `executive_steward` | `agent_pulse_summary` |
| broker-transfer-gate | `finance` | `broker_transfer_gate` |
| cashflow-forecast | `finance` | `cashflow_forecast` |
| company-events-chain-audit | `records_audit` | `company_events_chain_verify` |
| company-events-monthly-audit | `records_audit` | `company_events_monthly_audit` |
| company-events-weekly-attest | `records_audit` | `company_events_weekly_attest` |
| compliance-controls | `compliance` | `iso_control_review` |
| compliance-permit | `compliance` | `permit_expiry_check` |
| contract-expiry | `contract` | `contract_expiry_check` |
| contract-register | `contract` | `contract_register` |
| data-analytics | `data_analytics` | `analytics_kpi_scorecard` |
| deps-check | `operations` | `deps_check` |
| escalate-work-order | `executive_steward` | `escalate_work_order` |
| executive-daily | `executive_steward` | `daily_ops` |
| executive-dashboard | `executive_steward` | `executive_dashboard` |
| finance-variance | `finance` | `variance_analysis` |
| hr-headcount | `human_resources` | `hr_headcount` |
| integration-brief | `integration` | `integration_brief` |
| integrations-status | `setup` | `integrations_status` |
| internal-audit-scope | `internal_audit` | `internal_audit_scope` |
| mail-intake-handoff | `mail_intake` | `mail_intake_triage` |
| mail-outbound-correspondence | `mail_outbound` | `correspondence_draft` |
| monthly-close | `finance` | `monthly_close` |
| orchestration-status | `executive_steward` | `orchestration_status` |
| org-approval-gate | `executive_steward` | `org_approval_gate` |
| p0-closing | `executive_steward` | `p0_closing` |
| secretary-correspondence | `mail_outbound` | `external_correspondence` |
| secretary-one-on-one | `secretary` | `one_on_one_prep` |
| secretary-schedule | `secretary` | `schedule_management` |
| secretary-schedule-coordination | `secretary` | `schedule_coordination` |
| tax-filing | `tax` | `tax_filing_prep` |
| tenant-config-propose | `executive_steward` | `tenant_config_propose` |
| tenant-setup | `setup` | `tenant_integrations_setup` |
| travel-booking | `operations` | `travel_booking` |
| wire-send-gate | `secretary` | `wire_send_gate` |
| workspace-doctor | `executive_steward` | `workspace_doctor` |
| workspace-validate | `executive_steward` | `workspace_validate` |
<!-- orgos:generated:routing-skill-index:end -->

<!-- orgos:generated:execution-decision-tree:start -->
```
Skill id / CLI が指定された
│
├─ resolveSkillExecutionMode()  （src/lib/skill-execution-mode.ts）
│
├─ direct_auto + resolution ready
│     → orgos route dispatch --mode auto（authority 一致 · CLI 直実行）
│
├─ delegate_work_order / agent_interactive / escalate
│     → Work Order（executing agent id へ IMP）
│
├─ deferred
│     → 必須 argv / parent command 不足 — 手動 dispatch
│
├─ human_approval
│     → wire · approval · broker — CEO ゲート
│
└─ skill 不明
      → orgos route match --text · orgos escalate plan
```
<!-- orgos:generated:execution-decision-tree:end -->

<!-- orgos:generated:skill-registry-index:start -->
| Skill id | runtime | agent_id | CLI | module |
|----------|---------|----------|-----|--------|
| `agent_pulse_summary` | cli | `executive_steward` | `agent-pulse` | core |
| `analytics_data_quality` | cli | `data_analytics` | `analytics-quality` | core |
| `analytics_kpi_scorecard` | cli | `data_analytics` | `analytics-kpi` | core |
| `analytics_metric_catalog` | cli | `data_analytics` | `analytics-metrics` | core |
| `analytics_metrics_review` | agent | `data_analytics` | — | core |
| `broker_transfer_gate` | cli | `finance` | `broker-transfer` | core |
| `capex_planning` | cli | `finance` | `capex-planning` | core |
| `cashflow_forecast` | cli | `finance` | `forecast` | core |
| `company_events_chain_verify` | cli | `records_audit` | `company-events-chain-verify` | core |
| `company_events_monthly_audit` | cli | `records_audit` | `company-events-monthly-audit` | core |
| `company_events_weekly_attest` | cli | `records_audit` | `company-events-weekly-attest` | core |
| `contract_expiry_check` | cli | `contract` | `contract-expiry` | core |
| `contract_register` | cli | `contract` | `contract-register` | core |
| `coo_routing_review` | cli | `coo` | `routing-queue` | core |
| `coo_work_order_triage` | cli | `coo` | `escalate` | core |
| `corpdev_ma_screen` | agent | `corporate_development` | — | core |
| `corpdev_partnership_brief` | agent | `corporate_development` | — | core |
| `correspondence_draft` | cli | `mail_outbound` | `correspondence-draft` | core |
| `correspondence_send` | cli | `mail_outbound` | `correspondence-send` | core |
| `cs_health_check` | agent | `customer_success` | — | core |
| `cs_renewal_risk` | agent | `customer_success` | — | core |
| `cto_architecture_review` | agent | `cto` | — | core |
| `cto_tech_radar` | agent | `cto` | — | core |
| `daily_ops` | cli | `executive_steward` | `daily` | core |
| `deps_check` | cli | `operations` | `deps-check` | core |
| `design_asset_inventory` | agent | `design` | — | core |
| `design_lead_review` | agent | `design_lead` | — | core |
| `design_system_audit` | agent | `design_lead` | — | core |
| `design_ui_spec_draft` | agent | `design` | — | core |
| `devops_deploy_checklist` | agent | `devops` | — | core |
| `devops_infra_health` | agent | `devops` | — | core |
| `ecommerce_ops` | agent | `operations` | — | ecommerce |
| `engineering_code_review` | agent | `engineering` | — | core |
| `engineering_standards_check` | agent | `engineering` | — | core |
| `escalate_work_order` | cli | `executive_steward` | `escalate-run` | core |
| `esg_metrics_review` | agent | `esg_sustainability` | — | core |
| `esg_report_prep` | agent | `esg_sustainability` | — | core |
| `event_operations_ops` | agent | `operations` | — | event_operations |
| `executive_dashboard` | cli | `executive_steward` | `dashboard` | core |
| `expense_claim_ops` | cli | `accounting` | `expense-claim` | core |
| `external_correspondence` | agent | `mail_outbound` | — | core |
| `ga_office_ops_check` | agent | `general_affairs` | — | core |
| `ga_vendor_contract_review` | agent | `general_affairs` | — | core |
| `gov_regulatory_watch` | agent | `government_affairs` | — | core |
| `gov_subsidy_eligibility` | cli | `government_affairs` | `operations subsidy` | core |
| `governance_meeting_prep` | agent | `corporate_governance` | — | core |
| `governance_register_review` | agent | `corporate_governance` | — | core |
| `hr_headcount` | cli | `human_resources` | `hr-headcount` | core |
| `hr_labor_compliance` | agent | `human_resources` | — | core |
| `hr_policy_review` | agent | `human_resources` | — | core |
| `integration_brief` | cli | `integration` | `integration-brief` | core |
| `integrations_status` | cli | `setup` | `integrations-status` | core |
| `internal_audit_scope` | cli | `internal_audit` | `internal-audit-scope` | core |
| `ip_portfolio_review` | cli | `intellectual_property` | `operations trademark` | core |
| `ip_trademark_status` | agent | `intellectual_property` | — | core |
| `ir_materials_prep` | agent | `investor_relations` | — | core |
| `ir_shareholder_comm` | agent | `investor_relations` | — | core |
| `iso_control_review` | cli | `compliance` | `iso-control-review` | core |
| `jp_company_incorporation` | cli | `secretary` | `operations corporate` | jp_corporate_registration |
| `jp_medical_device_gvp` | cli | `medical_device_regulatory` | `operations medical-device gvp` | jp_medical_device |
| `jp_medical_device_ledgers` | cli | `medical_device_regulatory` | `operations medical-device ledger` | jp_medical_device |
| `jp_medical_device_qms` | cli | `medical_device_regulatory` | `operations medical-device qms` | jp_medical_device |
| `jp_permit_application_ops` | cli | `compliance` | `operations permit-app create` | jp_permit_application |
| `jp_permit_gap` | cli | `compliance` | `operations permit gap` | jp_permit_registry |
| `jp_permit_obligations` | cli | `compliance` | `operations permit obligations` | jp_permit_registry |
| `jp_registry_change` | cli | `secretary` | `operations corporate` | jp_corporate_registration |
| `jp_subsidy_draft` | cli | `finance` | `operations subsidy draft` | jp_subsidy_application |
| `jp_subsidy_eligibility` | cli | `finance` | `operations subsidy eligibility` | jp_subsidy_application |
| `jp_subsidy_labor_cost` | cli | `finance` | `operations subsidy labor-cost` | jp_subsidy_application |
| `jp_trademark_checklist` | cli | `compliance` | `operations trademark checklist` | jp_trademark_application |
| `jp_trademark_draft` | cli | `compliance` | `operations trademark draft` | jp_trademark_application |
| `jp-cashflow-schedule` | cli | `finance` | `jp bank cashflow generate` | jp_bank_corporate |
| `jp-treasury-position` | cli | `finance` | `jp bank position show` | jp_bank_corporate |
| `language_bridge` | agent | `secretary` | — | language_bridge |
| `ld_competency_gap` | agent | `learning_development` | — | core |
| `ld_training_plan` | agent | `learning_development` | — | core |
| `legal_clause_check` | agent | `legal` | — | core |
| `legal_register_review` | agent | `legal` | — | core |
| `mail_intake_triage` | cli | `mail_intake` | `mail-intake-triage` | core |
| `marketing_campaign_brief` | agent | `marketing_lead` | — | core |
| `marketing_content_calendar` | agent | `marketing_lead` | — | core |
| `membership_ops` | agent | `operations` | — | membership |
| `monthly_close` | cli | `finance` | `monthly-close` | core |
| `noi_analysis` | agent | `property_rental` | — | rental |
| `one_on_one_prep` | cli | `secretary` | `one-on-one` | core |
| `operations_records` | cli | `operations` | `records-check` | hospitality |
| `operations_records_review` | cli | `operations` | `document-io` | core |
| `operations_travel_booking` | cli | `operations` | `operations travel` | core |
| `orchestration_status` | cli | `executive_steward` | `orchestration-status` | core |
| `org_approval_gate` | cli | `executive_steward` | `org-approval-approve` | core |
| `p0_closing` | cli | `executive_steward` | `p0` | core |
| `permit_expiry_check` | cli | `compliance` | `permit-expiry` | core |
| `personal_budget_review` | agent | `personal_finance` | — | core |
| `personal_expense_categorize` | agent | `personal_finance` | — | core |
| `platform_implement_guide` | cli | `platform_guide` | `platform-implement-guide` | core |
| `pm_feature_prioritization` | agent | `product_management` | — | core |
| `pm_milestone_tracking` | agent | `project_management` | — | core |
| `pm_roadmap_review` | agent | `product_management` | — | core |
| `pm_status_review` | agent | `project_management` | — | core |
| `pr_media_monitoring` | agent | `pr_communications` | — | core |
| `pr_press_release_draft` | agent | `pr_communications` | — | core |
| `privacy_data_inventory` | agent | `privacy_officer` | — | core |
| `privacy_impact_review` | agent | `privacy_officer` | — | core |
| `procurement_order_review` | agent | `procurement` | — | core |
| `procurement_vendor_eval` | agent | `procurement` | — | core |
| `professional_services_ops` | agent | `operations` | — | professional_services |
| `property_management_ops` | agent | `operations` | — | property_management |
| `qa_iso9001_controls` | agent | `quality_assurance` | — | core |
| `qa_nonconformance_triage` | cli | `quality_assurance` | `controls gap` | core |
| `real_estate_brokerage_ops` | agent | `operations` | — | real_estate_brokerage |
| `recruiting_interview_prep` | agent | `recruiting` | — | core |
| `recruiting_pipeline_review` | agent | `recruiting` | — | core |
| `revpar_analysis` | cli | `hospitality` | `revpar` | hospitality |
| `risk_insurance_renewal` | agent | `risk_insurance` | — | core |
| `risk_register_review` | agent | `risk_insurance` | — | core |
| `saas_subscription_ops` | agent | `operations` | — | saas_subscription |
| `sales_forecast_prep` | agent | `sales_lead` | — | core |
| `sales_inbound_triage` | agent | `sales_inbound` | — | core |
| `sales_inquiry_response` | agent | `sales_inbound` | — | core |
| `sales_outbound_list_review` | agent | `sales_outbound` | — | core |
| `sales_outreach_draft` | agent | `sales_outbound` | — | core |
| `sales_pipeline_review` | agent | `sales_lead` | — | core |
| `schedule_coordination` | cli | `secretary` | `schedule-coordination` | core |
| `schedule_management` | cli | `secretary` | `schedule` | core |
| `security_classification_audit` | agent | `security` | — | core |
| `security_control_review` | agent | `security` | — | core |
| `slack_notify` | cli | `mail_outbound` | `slack-notify` | core |
| `social_calendar` | agent | `social_media` | — | core |
| `social_post_draft` | agent | `social_media` | — | core |
| `software_outsourcing_ops` | agent | `operations` | — | software_outsourcing |
| `staffing_ops` | agent | `operations` | — | staffing |
| `support_sla_check` | agent | `customer_support` | — | core |
| `support_ticket_triage` | agent | `customer_support` | — | core |
| `tax_filing_prep` | cli | `tax` | `tax-filing-prep` | core |
| `tenant_config_propose` | cli | `executive_steward` | `tenant-config-propose` | core |
| `tenant_integrations_setup` | cli | `setup` | `tenant-integrations-setup` | core |
| `travel_booking` | agent | `operations` | — | travel_booking |
| `treasury_cash_position` | cli | `treasury` | `jp-treasury-position` | core |
| `treasury_liquidity_forecast` | cli | `treasury` | `jp-treasury-liquidity` | core |
| `variance_analysis` | cli | `finance` | `variance` | core |
| `venture_capital_ops` | agent | `operations` | — | venture_capital |
| `wire_send_gate` | cli | `secretary` | `wire-send` | core |
| `workspace_doctor` | cli | `executive_steward` | `doctor` | core |
| `workspace_validate` | cli | `executive_steward` | `validate` | core |
<!-- orgos:generated:skill-registry-index:end -->

<!-- orgos:generated:skill-runtime-note:start -->
- `runtime: agent` — LLM + Skill 定義添付（旧 `cursor-only` と同義）
- `runtime: cli` — `orgos skills run` で決定論実行
- 実行 Agent の override は `src/lib/skill-execution-mode.ts` が正本
- 標準経路: `resolveSkillExecutionMode` → `orgos route dispatch --mode auto`（authority 一致時のみ direct）
<!-- orgos:generated:skill-runtime-note:end -->
