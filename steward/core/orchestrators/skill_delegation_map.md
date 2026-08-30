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
| accounting-ops | `accounting` | `expense_claim_ops` |
| agent-pulse | `executive_steward` | `agent_pulse_summary` |
| analytics-data-quality | `data_analytics` | `analytics_data_quality` |
| analytics-metric-catalog | `data_analytics` | `analytics_metric_catalog` |
| broker-transfer-gate | `finance` | `broker_transfer_gate` |
| cashflow-forecast | `finance` | `cashflow_forecast` |
| change-apply | `operations` | `change_apply` |
| change-plan | `operations` | `change_plan` |
| company-events-chain-audit | `records_audit` | `company_events_chain_verify` |
| company-events-monthly-audit | `records_audit` | `company_events_monthly_audit` |
| company-events-weekly-attest | `records_audit` | `company_events_weekly_attest` |
| compliance-controls | `compliance` | `iso_control_review` |
| compliance-permit | `compliance` | `permit_expiry_check` |
| contract-expiry | `contract` | `contract_expiry_check` |
| contract-register | `contract` | `contract_register` |
| customer-success-health | `customer_success` | `cs_health_check` |
| customer-success-renewal | `customer_success` | `cs_renewal_risk` |
| data-analytics | `data_analytics` | `analytics_kpi_scorecard` |
| deps-check | `operations` | `deps_check` |
| escalate-work-order | `executive_steward` | `escalate_work_order` |
| executive-daily | `executive_steward` | `daily_ops` |
| executive-dashboard | `executive_steward` | `executive_dashboard` |
| finance-noi | `finance` | `noi_analysis` |
| finance-variance | `finance` | `variance_analysis` |
| hospitality-sync-derived | `hospitality` | `hospitality_sync_derived` |
| hr-headcount | `human_resources` | `hr_headcount` |
| integration-brief | `integration` | `integration_brief` |
| integrations-status | `setup` | `integrations_status` |
| internal-audit-scope | `internal_audit` | `internal_audit_scope` |
| iso-audit-brief | `internal_audit` | `iso_audit_brief` |
| iso-audit-follow-up | `internal_audit` | `iso_audit_follow_up` |
| iso-internal-audit-report | `internal_audit` | `iso_internal_audit_report` |
| iso-internal-audit-run | `internal_audit` | `iso_internal_audit_run` |
| jp-consumption-tax | `tax` | `jp_consumption_tax_return` |
| jp-corporate-tax | `tax` | `jp_corporate_tax_return` |
| jp-invoice-registration | `tax` | `jp_invoice_registration` |
| jp-qualified-invoice | `tax` | `jp_qualified_invoice_issue` |
| jp-withholding-payment | `tax` | `jp_withholding_payment` |
| jsox-evaluate | `internal_audit` | `jsox_evaluate` |
| jsox-gaps | `internal_audit` | `jsox_gaps` |
| jsox-scope | `internal_audit` | `jsox_scope` |
| mail-intake-handoff | `mail_intake` | `mail_intake_triage` |
| mail-outbound-correspondence | `mail_outbound` | `correspondence_draft` |
| mail-outbound-correspondence-send | `mail_outbound` | `correspondence_send` |
| monthly-close | `finance` | `monthly_close` |
| orchestration-status | `executive_steward` | `orchestration_status` |
| org-approval-gate | `executive_steward` | `org_approval_gate` |
| p0-closing | `executive_steward` | `p0_closing` |
| pmo-milestones | `project_management` | `pm_milestone_tracking` |
| pmo-project | `project_management` | `pmo_portfolio` |
| pmo-risks | `project_management` | `pmo_risks` |
| pmo-show | `project_management` | `pmo_show` |
| sales-forecast | `sales_lead` | `sales_forecast_prep` |
| sales-outbound | `sales_outbound` | `sales_outbound_list_review` |
| sales-pipeline | `sales_lead` | `sales_pipeline_review` |
| secretary-correspondence | `mail_outbound` | `external_correspondence` |
| secretary-one-on-one | `secretary` | `one_on_one_prep` |
| secretary-schedule | `secretary` | `schedule_management` |
| secretary-schedule-coordination | `secretary` | `schedule_coordination` |
| tax-filing | `tax` | `tax_filing_prep` |
| tenant-config-propose | `executive_steward` | `tenant_config_propose` |
| tenant-setup | `setup` | `tenant_integrations_setup` |
| travel-booking | `operations` | `travel_booking` |
| venue-booking | `operations` | `venue_booking` |
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
| `annual_close` | cli | `accounting` | `annual-close` | core |
| `broker_transfer_gate` | cli | `finance` | `broker-transfer` | core |
| `capex_planning` | cli | `finance` | `capex-planning` | core |
| `cashflow_forecast` | cli | `finance` | `forecast` | core |
| `change_apply` | cli | `operations` | `change-apply` | core |
| `change_plan` | cli | `operations` | `change-plan` | core |
| `clinic_appointments` | cli | `operations` | `clinic-appointments` | clinic |
| `clinic_show` | cli | `operations` | `clinic-show` | clinic |
| `company_events_chain_verify` | cli | `records_audit` | `company-events-chain-verify` | core |
| `company_events_monthly_audit` | cli | `records_audit` | `company-events-monthly-audit` | core |
| `company_events_weekly_attest` | cli | `records_audit` | `company-events-weekly-attest` | core |
| `construction_show` | cli | `operations` | `construction-show` | construction |
| `construction_site_progress` | cli | `operations` | `construction-site-progress` | construction |
| `consumption_tax_calc` | cli | `tax` | `consumption-tax-calc` | core |
| `contract_expiry_check` | cli | `contract` | `contract-expiry` | core |
| `contract_register` | cli | `contract` | `contract-register` | core |
| `coo_routing_review` | cli | `coo` | `routing-queue` | core |
| `coo_work_order_triage` | cli | `coo` | `escalate` | core |
| `corpdev_ma_screen` | agent | `corporate_development` | — | core |
| `corpdev_partnership_brief` | agent | `corporate_development` | — | core |
| `correspondence_compose` | cli | `mail_outbound` | `correspondence-compose` | core |
| `correspondence_draft` | cli | `mail_outbound` | `correspondence-draft` | core |
| `correspondence_send` | cli | `mail_outbound` | `correspondence-send` | core |
| `cs_health_check` | cli | `customer_success` | `cs-health` | core |
| `cs_nps_analysis` | cli | `customer_success` | `cs-nps-analysis` | customer_success |
| `cs_onboarding_review` | cli | `customer_success` | `cs-onboarding-review` | customer_success |
| `cs_qbr_prep` | agent | `customer_success` | — | customer_success |
| `cs_renewal_risk` | cli | `customer_success` | `cs-renewal` | core |
| `cto_architecture_review` | agent | `cto` | — | core |
| `cto_tech_radar` | cli | `cto` | `cto-tech-radar` | core |
| `daily_ops` | cli | `executive_steward` | `daily` | core |
| `depreciation_run` | cli | `accounting` | `depreciation-run` | core |
| `deps_check` | cli | `operations` | `deps-check` | core |
| `design_asset_inventory` | agent | `design` | — | core |
| `design_lead_review` | agent | `design_lead` | — | core |
| `design_system_audit` | agent | `design_lead` | — | core |
| `design_ui_spec_draft` | agent | `design` | — | core |
| `devops_deploy_checklist` | agent | `devops` | — | core |
| `devops_infra_health` | agent | `devops` | — | core |
| `ecommerce_ops` | cli | `operations` | `ecommerce-show` | ecommerce |
| `ecommerce_validate` | cli | `operations` | `ecommerce-validate` | ecommerce |
| `education_enrollment` | cli | `operations` | `education-enrollment` | education |
| `education_show` | cli | `operations` | `education-show` | education |
| `engineering_code_review` | agent | `engineering` | — | core |
| `engineering_standards_check` | cli | `engineering` | `platform-registry-verify` | core |
| `escalate_work_order` | cli | `executive_steward` | `escalate-run` | core |
| `esg_metrics_review` | agent | `esg_sustainability` | — | core |
| `esg_report_prep` | agent | `esg_sustainability` | — | core |
| `event_operations_ops` | cli | `operations` | `events-show` | event_operations |
| `event_operations_validate` | cli | `operations` | `events-validate` | event_operations |
| `event_space_show` | cli | `operations` | `event-space-show` | event_space |
| `event_space_utilization` | cli | `operations` | `event-space-utilization` | event_space |
| `executive_dashboard` | cli | `executive_steward` | `dashboard` | core |
| `expense_claim_ops` | cli | `accounting` | `expense-claim` | core |
| `external_correspondence` | agent | `mail_outbound` | — | core |
| `ga_office_ops_check` | agent | `general_affairs` | — | core |
| `ga_vendor_contract_review` | agent | `general_affairs` | — | core |
| `gov_regulatory_watch` | agent | `government_affairs` | — | core |
| `gov_subsidy_eligibility` | cli | `government_affairs` | `operations subsidy` | core |
| `governance_meeting_prep` | cli | `corporate_governance` | `governance-meeting-prep` | core |
| `governance_register_review` | cli | `corporate_governance` | `governance-register-review` | core |
| `hospitality_sync_derived` | cli | `hospitality` | `hospitality-sync-derived` | hospitality |
| `hr_headcount` | cli | `human_resources` | `hr-headcount` | core |
| `hr_labor_compliance` | agent | `human_resources` | — | core |
| `hr_policy_review` | agent | `human_resources` | — | core |
| `integration_brief` | cli | `integration` | `integration-brief` | core |
| `integrations_status` | cli | `setup` | `integrations-status` | core |
| `internal_audit_scope` | cli | `internal_audit` | `internal-audit-scope` | core |
| `ip_portfolio_review` | cli | `intellectual_property` | `operations trademark` | core |
| `ip_trademark_status` | agent | `intellectual_property` | — | core |
| `ir_cap_table_review` | cli | `investor_relations` | `operations ir cap-table-review` | investor_relations |
| `ir_disclosure_calendar` | cli | `investor_relations` | `operations ir disclosure-calendar` | investor_relations |
| `ir_materials_prep` | agent | `investor_relations` | — | core |
| `ir_shareholder_comm` | agent | `investor_relations` | — | core |
| `iso_audit_brief` | cli | `internal_audit` | `iso-audit-brief` | core |
| `iso_audit_follow_up` | cli | `internal_audit` | `iso-audit-follow-up` | core |
| `iso_control_review` | cli | `compliance` | `iso-control-review` | core |
| `iso_internal_audit_report` | cli | `internal_audit` | `iso-internal-audit-report` | core |
| `iso_internal_audit_run` | cli | `internal_audit` | `iso-internal-audit-run` | core |
| `journal_export_csv` | cli | `accounting` | `journal-export-csv` | core |
| `journal_post` | cli | `accounting` | `journal-post` | core |
| `jp_carbon_neutral_show` | cli | `compliance` | `jp-carbon-neutral-show` | jp_carbon_neutral_2050 |
| `jp_carbon_neutral_targets` | cli | `compliance` | `jp-carbon-neutral-targets` | jp_carbon_neutral_2050 |
| `jp_certification_list` | cli | `compliance` | `jp-certification-list` | jp_certification |
| `jp_certification_types` | cli | `compliance` | `jp-certification-types` | jp_certification |
| `jp_company_incorporation` | cli | `secretary` | `operations corporate` | jp_corporate_registration |
| `jp_consumption_refund_eligibility` | cli | `tax` | `jp-consumption-refund-eligibility` | jp_consumption_refund |
| `jp_consumption_refund_show` | cli | `tax` | `jp-consumption-refund-show` | jp_consumption_refund |
| `jp_consumption_tax_return` | cli | `tax` | `jp-consumption-tax-return` | jp_tax_consumption |
| `jp_corporate_tax_return` | cli | `tax` | `jp-corporate-tax-return` | jp_tax_corporate |
| `jp_inspection_list` | cli | `compliance` | `jp-inspection-list` | jp_inspection |
| `jp_inspection_types` | cli | `compliance` | `jp-inspection-types` | jp_inspection |
| `jp_invoice_registration` | cli | `tax` | `jp-invoice-registration` | jp_invoice_qualified |
| `jp_medical_device_gvp` | cli | `medical_device_regulatory` | `operations medical-device gvp` | jp_medical_device |
| `jp_medical_device_ledgers` | cli | `medical_device_regulatory` | `operations medical-device ledger` | jp_medical_device |
| `jp_medical_device_qms` | cli | `medical_device_regulatory` | `operations medical-device qms` | jp_medical_device |
| `jp_minpaku_gate` | cli | `compliance` | `jp-minpaku-gate-check` | jp_minpaku |
| `jp_minpaku_ops` | cli | `compliance` | `jp-minpaku-gate` | jp_minpaku |
| `jp_payroll_run` | cli | `human_resources` | `jp-payroll-run` | jp_payroll |
| `jp_permit_application_ops` | cli | `compliance` | `operations permit-app create` | jp_permit_application |
| `jp_permit_gap` | cli | `compliance` | `operations permit gap` | jp_permit_registry |
| `jp_permit_obligations` | cli | `compliance` | `operations permit obligations` | jp_permit_registry |
| `jp_privacy_policy_show` | cli | `compliance` | `jp-privacy-policy-show` | jp_privacy_policy |
| `jp_privacy_policy_status` | cli | `compliance` | `jp-privacy-policy-status` | jp_privacy_policy |
| `jp_qualified_invoice_issue` | cli | `tax` | `jp-qualified-invoice-issue` | jp_invoice_qualified |
| `jp_registry_change` | cli | `secretary` | `operations corporate` | jp_corporate_registration |
| `jp_social_insurance_prep` | cli | `human_resources` | `jp-social-insurance-prep` | jp_social_insurance |
| `jp_subsidy_draft` | cli | `finance` | `operations subsidy draft` | jp_subsidy_application |
| `jp_subsidy_eligibility` | cli | `finance` | `operations subsidy eligibility` | jp_subsidy_application |
| `jp_subsidy_labor_cost` | cli | `finance` | `operations subsidy labor-cost` | jp_subsidy_application |
| `jp_trademark_checklist` | cli | `compliance` | `operations trademark checklist` | jp_trademark_application |
| `jp_trademark_draft` | cli | `compliance` | `operations trademark draft` | jp_trademark_application |
| `jp_withholding_payment` | cli | `tax` | `jp-withholding-payment` | jp_withholding_statutory |
| `jp_women_empowerment_kpi` | cli | `compliance` | `jp-women-empowerment-kpi` | jp_women_empowerment |
| `jp_women_empowerment_show` | cli | `compliance` | `jp-women-empowerment-show` | jp_women_empowerment |
| `jp-cashflow-schedule` | cli | `finance` | `jp bank cashflow generate` | jp_bank_corporate |
| `jp-treasury-position` | cli | `finance` | `jp bank position show` | jp_bank_corporate |
| `jsox_evaluate` | cli | `internal_audit` | `jsox-evaluate` | jp_jsox |
| `jsox_gaps` | cli | `internal_audit` | `jsox-gaps` | jp_jsox |
| `jsox_scope` | cli | `internal_audit` | `jsox-scope` | jp_jsox |
| `language_bridge` | cli | `secretary` | `language-bridge-show` | language_bridge |
| `language_bridge_validate` | cli | `secretary` | `language-bridge-validate` | language_bridge |
| `ld_competency_gap` | agent | `learning_development` | — | core |
| `ld_training_plan` | agent | `learning_development` | — | core |
| `legal_clause_check` | agent | `legal` | — | core |
| `legal_register_review` | agent | `legal` | — | core |
| `logistics_delivery_sla` | cli | `operations` | `logistics-delivery-sla` | logistics |
| `logistics_show` | cli | `operations` | `logistics-show` | logistics |
| `mail_intake_triage` | cli | `mail_intake` | `mail-intake-triage` | core |
| `marketing_campaign_brief` | agent | `marketing_lead` | — | core |
| `marketing_content_calendar` | agent | `marketing_lead` | — | core |
| `membership_ops` | cli | `operations` | `membership-show` | membership |
| `membership_validate` | cli | `operations` | `membership-validate` | membership |
| `monthly_close` | cli | `finance` | `monthly-close` | core |
| `noi_analysis` | cli | `finance` | `noi-analysis` | core |
| `one_on_one_prep` | cli | `secretary` | `one-on-one` | core |
| `operations_records` | cli | `hospitality` | `records-check` | hospitality |
| `operations_records_review` | cli | `operations` | `document-io` | core |
| `operations_travel_booking` | cli | `operations` | `operations travel` | core |
| `orchestration_status` | cli | `executive_steward` | `orchestration-status` | core |
| `org_approval_gate` | cli | `executive_steward` | `org-approval-approve` | core |
| `p0_closing` | cli | `executive_steward` | `p0` | core |
| `payroll_calc` | cli | `human_resources` | `payroll-calc` | core |
| `permit_expiry_check` | cli | `compliance` | `permit-expiry` | core |
| `personal_budget_review` | agent | `personal_finance` | — | core |
| `personal_expense_categorize` | agent | `personal_finance` | — | core |
| `platform_implement_guide` | cli | `platform_guide` | `platform-implement-guide` | core |
| `pm_feature_prioritization` | agent | `product_management` | — | core |
| `pm_milestone_tracking` | cli | `project_management` | `pmo-milestones` | core |
| `pm_roadmap_review` | agent | `product_management` | — | core |
| `pm_status_review` | agent | `project_management` | — | core |
| `pmo_portfolio` | cli | `project_management` | `pmo-portfolio` | core |
| `pmo_risks` | cli | `project_management` | `pmo-risks` | core |
| `pmo_show` | cli | `project_management` | `pmo-show` | core |
| `pr_media_monitoring` | agent | `pr_communications` | — | core |
| `pr_press_release_draft` | agent | `pr_communications` | — | core |
| `privacy_data_inventory` | cli | `privacy_officer` | `privacy-data-inventory` | core |
| `privacy_impact_review` | cli | `privacy_officer` | `privacy-impact-review` | core |
| `procurement_order_review` | cli | `procurement` | `procurement-order-review` | core |
| `procurement_vendor_eval` | cli | `procurement` | `procurement-vendor-eval` | core |
| `professional_services_ops` | cli | `operations` | `ps-show` | professional_services |
| `professional_services_validate` | cli | `operations` | `ps-validate` | professional_services |
| `property_management_ops` | cli | `operations` | `property-mgmt-show` | property_management |
| `property_management_validate` | cli | `operations` | `property-mgmt-validate` | property_management |
| `qa_iso9001_controls` | agent | `quality_assurance` | — | core |
| `qa_nonconformance_triage` | cli | `quality_assurance` | `controls gap` | core |
| `real_estate_brokerage_ops` | cli | `operations` | `brokerage-show` | real_estate_brokerage |
| `real_estate_brokerage_validate` | cli | `operations` | `brokerage-validate` | real_estate_brokerage |
| `recruiting_interview_prep` | agent | `recruiting` | — | core |
| `recruiting_pipeline_review` | agent | `recruiting` | — | core |
| `rental_rent_roll` | cli | `property_rental` | `rental-rent-roll` | rental |
| `rental_show` | cli | `property_rental` | `rental-show` | rental |
| `restaurant_seating` | cli | `operations` | `restaurant-seating` | restaurant |
| `restaurant_show` | cli | `operations` | `restaurant-show` | restaurant |
| `retail_store_margin` | cli | `finance` | `retail-store-margin` | retail_store |
| `retail_store_show` | cli | `finance` | `retail-store-show` | retail_store |
| `revpar_analysis` | cli | `hospitality` | `revpar` | hospitality |
| `risk_insurance_renewal` | cli | `risk_insurance` | `risk-insurance-renewal` | core |
| `risk_register_review` | cli | `risk_insurance` | `risk-register-review` | core |
| `saas_subscription_ops` | cli | `operations` | `saas-show` | saas_subscription |
| `saas_subscription_validate` | cli | `operations` | `saas-validate` | saas_subscription |
| `sales_crm_summary` | cli | `sales_lead` | `sales-crm-summary` | sales |
| `sales_forecast_prep` | cli | `sales_lead` | `sales-forecast` | core |
| `sales_inbound_intake` | cli | `sales_lead` | `sales-inbound-intake` | sales |
| `sales_inbound_triage` | cli | `sales_inbound` | `sales-inbound` | core |
| `sales_inquiry_response` | agent | `sales_inbound` | — | core |
| `sales_outbound_list_review` | cli | `sales_outbound` | `sales-outbound` | core |
| `sales_outreach_draft` | agent | `sales_outbound` | — | core |
| `sales_pipeline_review` | cli | `sales_lead` | `sales-pipeline` | core |
| `schedule_coordination` | cli | `secretary` | `schedule-coordination` | core |
| `schedule_management` | cli | `secretary` | `schedule` | core |
| `security_classification_audit` | cli | `security` | `classification-check` | core |
| `security_control_review` | agent | `security` | — | core |
| `slack_notify` | cli | `mail_outbound` | `slack-notify` | core |
| `social_calendar` | agent | `social_media` | — | core |
| `social_post_draft` | agent | `social_media` | — | core |
| `software_outsourcing_ops` | cli | `operations` | `software-out-show` | software_outsourcing |
| `software_outsourcing_validate` | cli | `operations` | `software-out-validate` | software_outsourcing |
| `staffing_ops` | cli | `operations` | `staffing-show` | staffing |
| `staffing_validate` | cli | `operations` | `staffing-validate` | staffing |
| `support_sla_check` | agent | `customer_support` | — | core |
| `support_ticket_triage` | agent | `customer_support` | — | core |
| `tax_filing_prep` | cli | `tax` | `tax-filing-prep` | core |
| `tenant_config_propose` | cli | `executive_steward` | `tenant-config-propose` | core |
| `tenant_integrations_setup` | cli | `setup` | `tenant-integrations-setup` | core |
| `travel_booking` | agent | `operations` | — | travel_booking |
| `travel_intake_validate` | cli | `operations` | `travel-intake` | travel_booking |
| `travel_policy_check` | cli | `operations` | `travel-check` | travel_booking |
| `treasury_cash_position` | cli | `treasury` | `treasury cash position` | core |
| `treasury_liquidity_forecast` | cli | `treasury` | `treasury liquidity forecast` | core |
| `trial_balance` | cli | `accounting` | `trial-balance` | core |
| `trial_balance_export_csv` | cli | `accounting` | `trial-balance-export-csv` | core |
| `variance_analysis` | cli | `finance` | `variance` | core |
| `venture_capital_ops` | cli | `operations` | `vc-show` | venture_capital |
| `venture_capital_validate` | cli | `operations` | `vc-validate` | venture_capital |
| `venue_booking` | agent | `operations` | — | venue_booking |
| `venue_catalog` | cli | `operations` | `venue-catalog` | venue_booking |
| `venue_list` | cli | `operations` | `venue-list` | venue_booking |
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
