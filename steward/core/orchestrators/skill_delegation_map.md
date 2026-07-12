# Skill → Agent 委譲マップ（オーケストレーター用）

**読者:** Steward Agent · COO · 人間オペレータ  
**版:** 2026-06-28 · **正本:** 本書 · Skill 索引: `npm run orgos -- skills list`

---

## 1. オーケストレーターの動き方

| 主体 | Skill 指定時の役割 |
|------|-------------------|
| **Steward Agent** | 自分用 Skill は **CLI 実行** · 他 Skill は **Work Order で担当 Agent に委譲** |
| **COO** | Steward から降ろされた IMP に **skill id · agent id** を付与 · 進捗追跡 |
| **人間 CEO** | `protocol notice approve` · 振込 · 契約締結 · 公開のみ |

### 委譲手順

```bash
# 1) Skill id またはキーワードで route 確認
npm run orgos -- route match --text "月次締め"

# 2) Work Order 生成（to_agent は下表の「実行 Agent id」）
npm run orgos -- escalate plan --text "**件名:** 月次締め **実装要件:** monthly_close Skill 実行"

# 3) 担当 Agent スレッドで Skill 実行
npm run orgos -- skills run monthly-close
# cursor-only の場合: @steward/core/skills/{file} または module skills/
```

**Handoff** に `skill` · `route_id` が付く（`escalate run`）。担当 Agent は **Primary Folders 内のみ** 編集。

---

## 2. ラベル → Agent id 変換

Skill registry の `agent` 列（表示名）→ 実行時の **Agent id**:

| registry 表示名 | Agent id |
|-----------------|----------|
| Executive Steward / Executive | `executive_steward` |
| Secretary | `secretary` |
| Finance | `finance` |
| Contract | `contract` |
| Compliance | `compliance` |
| Operations | `operations` |
| Property Rental | `property_rental` |
| Hospitality | `hospitality` |

拡張 Agent（registry に未記載だが **推奨実行担当**）:

| 領域 | 推奨 Agent id |
|------|---------------|
| 税務申告 | `tax`（Skill 名義は Finance） |
| 経理実務 | `accounting` |
| 定款 · 登記 | `legal`（CLI は Secretary 名義） |
| 補助金 | `government_affairs`（CLI は Finance 名義） |
| 商標 · 知財 | `intellectual_property`（CLI は Compliance 名義） |
| 案件 PMO | `project_management` |

---

## 3. コア Skill — Steward 自身が実行

| Skill id | CLI | 実行 Agent | Steward の動き |
|----------|-----|------------|----------------|
| `executive_dashboard` | `skills run dashboard` | `executive_steward` | **自実行** → 要約読取 |
| `daily_ops` | `skills run daily` | `executive_steward` | **自実行** |
| `p0_closing` | `skills run p0` | `executive_steward` | **自実行** |

---

## 4. コア Skill — 担当 Agent に委譲

| Skill id | CLI | registry Agent | **実行 Agent id** | routing id |
|----------|-----|----------------|-------------------|------------|
| `contract_expiry_check` | `contract-expiry` | Contract | `contract` | contract-expiry |
| `contract_register` | `contract-register` | Contract | `contract` | — |
| `permit_expiry_check` | `permit-expiry` | Compliance | `compliance` | compliance-permit |
| `iso_control_review` | `iso-control-review` | Compliance | `compliance` | compliance-controls |
| `internal_audit_scope` | `internal-audit-scope` | Internal Audit | `internal_audit` | internal-audit-scope |
| `monthly_close` | `monthly-close` | Finance | `finance` | monthly-close |
| `variance_analysis` | `variance` | Finance | `finance` | finance-variance |
| `cashflow_forecast` | `forecast` | Finance | `finance` | — |
| `capex_planning` | `capex-planning` | Finance | `finance` | — |
| `tax_filing_prep` | `tax-filing-prep` | Finance | **`tax`**（推奨）· `finance`（registry） | tax-filing |
| `schedule_management` | `schedule` | Secretary | `secretary` | secretary-schedule |
| `one_on_one_prep` | `one-on-one` | Secretary | `secretary` | secretary-one-on-one |
| `external_correspondence` | — (cursor-only) | Secretary | `secretary` | secretary-correspondence |

---

## 5. 未登録 Skill（Agent 定義のみ · registry 外）

| Skill ファイル | 実行 Agent id | 備考 |
|---------------|---------------|------|
| `inter_org_notice_draft` | `secretary` | `protocol notice draft` · approve は CEO |

---

## 6. JP 法域モジュール Skill

| Skill id | CLI | registry Agent | **推奨実行 Agent id** | モジュール proxy |
|----------|-----|----------------|----------------------|-----------------|
| `jp_company_incorporation` | `operations corporate …` | Secretary | **`legal`** | `jp_corporate_registration` → secretary |
| `jp_registry_change` | 同上 | Secretary | **`legal`** | 同上 |
| `jp_subsidy_eligibility` | `operations subsidy eligibility` | Finance | **`government_affairs`** | finance |
| `jp_subsidy_labor_cost` | `operations subsidy labor-cost` | Finance | **`government_affairs`** | finance |
| `jp_subsidy_draft` | `operations subsidy draft` | Finance | **`government_affairs`** | finance |
| `jp_trademark_checklist` | `operations trademark checklist` | Compliance | **`intellectual_property`** | compliance |
| `jp_trademark_draft` | `operations trademark draft` | Compliance | **`intellectual_property`** | compliance |

**前提:** 対応モジュールが `modules.yaml` で `enabled: true`。無効時は route **blocked**。

---

## 7. 業務モジュール Skill

| Skill id | runtime | registry Agent | **実行 Agent id** | モジュール | 有効化 |
|----------|---------|----------------|-------------------|-----------|--------|
| `travel_booking` | cursor-only | Operations | `operations` | travel_booking | テナント |
| `operations_records` | cli `records-check` | Operations | `operations` | hospitality | hospitality |
| `revpar_analysis` | cli `revpar` | Hospitality | `hospitality` | hospitality | hospitality |
| `noi_analysis` | cursor-only | Property Rental | `property_rental` | rental | rental |
| `language_bridge` | cursor-only | Secretary | `secretary` | language_bridge | テナント |
| `ecommerce_ops` | cursor-only | Operations | `operations` ※ | ecommerce | テナント |
| `professional_services_ops` | cursor-only | Operations | `operations` | professional_services | テナント |
| `venture_capital_ops` | cursor-only | Operations | **`finance`** ※ | venture_capital | テナント |
| `saas_subscription_ops` | cursor-only | Operations | **`finance`** ※ | saas_subscription | テナント |
| `membership_ops` | cursor-only | Operations | **`finance`** ※ | membership | テナント |
| `staffing_ops` | cursor-only | Operations | `operations` | staffing | テナント |
| `software_outsourcing_ops` | cursor-only | Operations | `operations` | software_outsourcing | テナント |
| `event_operations_ops` | cursor-only | Operations | `operations` | event_operations | テナント |
| `property_management_ops` | cursor-only | Operations | **`property_rental`** ※ | property_management | テナント |
| `real_estate_brokerage_ops` | cursor-only | Operations | **`contract`** ※ | real_estate_brokerage | テナント |

※ registry は Operations だが **MODULE_TO_CLASSIFICATION_AGENT** により routing アクセスは右列 Agent。Work Order は **右列 id** へ。

---

## 8. Skill 指定 → 委譲決定木

```
Skill id / CLI が指定された
│
├─ executive_dashboard | daily_ops | p0_closing
│     → Steward 自実行（CLI）
│
├─ cursor-only
│     → 実行 Agent id の agent.md + skill ファイルを @
│     → Steward/COO は Work Order のみ（CLI なし）
│
├─ cli + コア Skill（§4）
│     → 表の「実行 Agent id」へ IMP
│     → 担当が npm run orgos -- skills run {cli}
│
├─ cli + operations …（JP / モジュール）
│     → モジュール enabled 確認
│     → 推奨 Agent id（§6–7）へ IMP
│     → 担当が operations サブコマンド実行
│
└─ skill 不明
      → route match --text
      → escalate plan
```

---

## 9. routing と Skill の対応（Skill 付き route）

| route id | agent id | skill id |
|----------|----------|----------|
| contract-expiry | contract | contract_expiry_check |
| monthly-close | finance | monthly_close |
| finance-variance | finance | variance_analysis |
| travel-booking | operations | travel_booking |
| secretary-schedule | secretary | schedule_management |
| secretary-one-on-one | secretary | one_on_one_prep |
| secretary-correspondence | secretary | external_correspondence |
| executive-daily | executive_steward | daily_ops |
| compliance-permit | compliance | permit_expiry_check |
| compliance-controls | compliance | iso_control_review |
| internal-audit-scope | internal_audit | internal_audit_scope |
| tax-filing | tax | tax_filing_prep |
| hr-labor | human_resources | — |
| corporate-meetings | corporate_governance | — |
| accounting-ops | accounting | — |
| legal-teikan | legal | — |
| coo-work-order | coo | — |

Skill 未绑定の route → 担当 Agent は **会話・編集** で対応（専用 CLI なし）。

---

## 10. 多 Agent 衝突時（Steward）

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

<!-- orgos:generated:skill-registry-index:start -->
| Skill id | runtime | agent_id | CLI | module |
|----------|---------|----------|-----|--------|
| `analytics_data_quality` | agent | `data_analytics` | — | core |
| `analytics_metrics_review` | agent | `data_analytics` | — | core |
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
| `design_asset_inventory` | agent | `design` | — | core |
| `design_lead_review` | agent | `design_lead` | — | core |
| `design_system_audit` | agent | `design_lead` | — | core |
| `design_ui_spec_draft` | agent | `design` | — | core |
| `devops_deploy_checklist` | agent | `devops` | — | core |
| `devops_infra_health` | agent | `devops` | — | core |
| `ecommerce_ops` | agent | `operations` | — | ecommerce |
| `engineering_code_review` | agent | `engineering` | — | core |
| `engineering_standards_check` | agent | `engineering` | — | core |
| `esg_metrics_review` | agent | `esg_sustainability` | — | core |
| `esg_report_prep` | agent | `esg_sustainability` | — | core |
| `event_operations_ops` | agent | `operations` | — | event_operations |
| `executive_dashboard` | cli | `executive_steward` | `dashboard` | core |
| `external_correspondence` | agent | `mail_outbound` | — | core |
| `ga_office_ops_check` | agent | `general_affairs` | — | core |
| `ga_vendor_contract_review` | agent | `general_affairs` | — | core |
| `gov_regulatory_watch` | agent | `government_affairs` | — | core |
| `gov_subsidy_eligibility` | cli | `government_affairs` | `operations subsidy` | core |
| `governance_meeting_prep` | agent | `corporate_governance` | — | core |
| `governance_register_review` | agent | `corporate_governance` | — | core |
| `hr_labor_compliance` | agent | `human_resources` | — | core |
| `hr_policy_review` | agent | `human_resources` | — | core |
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
| `tenant_integrations_setup` | cli | `setup` | `tenant-integrations-setup` | core |
| `travel_booking` | agent | `operations` | — | travel_booking |
| `treasury_cash_position` | agent | `treasury` | — | core |
| `treasury_liquidity_forecast` | agent | `treasury` | — | core |
| `variance_analysis` | cli | `finance` | `variance` | core |
| `venture_capital_ops` | agent | `operations` | — | venture_capital |
<!-- orgos:generated:skill-registry-index:end -->

<!-- orgos:generated:skill-runtime-note:start -->
- `runtime: agent` — LLM + Skill 定義添付（旧 `cursor-only` と同義）
- `runtime: cli` — `orgos skills run` で決定論実行
- 実行 Agent の override は `src/lib/skill-execution-mode.ts` が正本
<!-- orgos:generated:skill-runtime-note:end -->
