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
