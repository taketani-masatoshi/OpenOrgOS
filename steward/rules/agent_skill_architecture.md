# Steward OS — Agent / Skill アーキテクチャ

**版:** 2026-06-08 · **上位:** [steward_os_principles.md](steward_os_principles.md)

---

## 情報フロー

```mermaid
flowchart TB
  subgraph Data["Data / File"]
    YAML[data/]
    DOCS[docs/]
  end

  subgraph Skills["steward/skills/"]
    S1[monthly_close]
    S2[cashflow_forecast]
    S3[contract_expiry_check]
    S4[revpar_analysis]
  end

  subgraph Agents["steward/agents/"]
    FIN[Finance]
    CON[Contract]
    HOS[Hospitality]
    EXE[Executive Steward]
    SEC[Secretary]
  end

  subgraph ExecutiveData["data/executive/"]
    CAL[calendar.yaml]
    TASK[tasks.yaml]
  end

  subgraph StewardRead["Steward 読取面"]
    DASH[docs/reports/dashboard/]
    SUM[docs/reports/agent-summaries/]
  end

  YAML --> FIN
  DOCS --> FIN
  FIN --> S1
  FIN --> S2
  S1 --> SUM
  S2 --> SUM
  CON --> S3
  S3 --> SUM
  HOS --> S4
  S4 --> SUM
  SUM --> EXE
  DASH --> EXE
  CAL --> SEC
  TASK --> SEC
  SEC -.->|業務ルート| EXE
```

---

## 論理フォルダ（steward-os/）

| 番号 | 論理 | 現行パス（Phase 0） |
|------|------|-------------------|
| 00 | company | `data/company.yaml` · `docs/company/` |
| 01 | business_plan | `data/plans/` · `docs/plans/` |
| 02 | properties | `data/properties/` |
| 03 | finance | `data/finance/` · `docs/company/tax/` |
| 04 | contracts | `data/contracts/` · `docs/contracts/` |
| 05 | rental | `modules.yaml` · `docs/plans/rental/` |
| 06 | hospitality | `modules.yaml` · `docs/properties/*/operations/` |
| 07 | compliance | `steward/standards/iso/`（Read）· `docs/compliance/iso/`（テナント記録） |
| 08 | operations | `docs/io/inbox/` · `docs/io/outbox/` |
| 09 | reports | `docs/reports/` |
| 10 | decisions | `docs/company/*gijiroku*` · `executive-remaining-tasks.md` |
| 10b | executive | `data/executive/` · `docs/executive/`（Secretary SoT） |
| 11 | agents | `steward/agents/` |
| 12 | skills | `steward/skills/` |
| 13 | rules | `steward/rules/` |
| 14 | prompts | `steward/orchestrators/` |
| 99 | archive | `docs/plans/archive/` |

**Phase 0:** 物理移行なし。`data/` と `src/` は維持。

---

## Agent 一覧

| Agent | 日本語 | 定義 | 要約出力先 |
|-------|--------|------|-----------|
| Executive Steward | 経営統括 | [steward/agents/executive_steward_agent.md](../steward/agents/executive_steward_agent.md) | `docs/reports/` · `executive-notes/` |
| Secretary | 秘書 | [steward/agents/secretary_agent.md](../steward/agents/secretary_agent.md) | `docs/executive/` |
| Finance | 財務・計画 | [steward/agents/finance_agent.md](../steward/agents/finance_agent.md) | `agent-summaries/finance/` |
| Contract | 契約管理 | [steward/agents/contract_agent.md](../steward/agents/contract_agent.md) | `agent-summaries/contract/` |
| Property Rental | 賃貸モジュール | [steward/modules/rental/agent.md](../modules/rental/agent.md) | `modules.yaml` → summary_dir |
| Hospitality | 宿泊モジュール | [steward/modules/hospitality/agent.md](../modules/hospitality/agent.md) | `modules.yaml` → summary_dir |
| Compliance | コンプライアンス | [steward/agents/compliance_agent.md](../steward/agents/compliance_agent.md) | `agent-summaries/compliance/` |
| Operations | 業務運用 | [steward/agents/operations_agent.md](../steward/agents/operations_agent.md) | `agent-summaries/operations/` |

索引: [steward/agents/00-このフォルダについて.md](../steward/agents/00-このフォルダについて.md)

---

## Skill 一覧（Phase 0）

| Skill | 定義 | 主 Agent |
|-------|------|---------|
| executive_dashboard | [steward/skills/executive_dashboard.md](../steward/skills/executive_dashboard.md) | Executive Steward |
| schedule_management | [steward/skills/schedule_management.md](../steward/skills/schedule_management.md) | Secretary |
| one_on_one_prep | [steward/skills/one_on_one_prep.md](../steward/skills/one_on_one_prep.md) | Secretary |
| external_correspondence | [steward/skills/external_correspondence.md](../steward/skills/external_correspondence.md) | Secretary |
| monthly_close | [steward/skills/monthly_close.md](../steward/skills/monthly_close.md) | Finance |
| cashflow_forecast | [steward/skills/cashflow_forecast.md](../steward/skills/cashflow_forecast.md) | Finance |
| contract_register | [steward/skills/contract_register.md](../steward/skills/contract_register.md) | Contract · Operations |
| contract_expiry_check | [steward/skills/contract_expiry_check.md](../steward/skills/contract_expiry_check.md) | Contract |
| noi_analysis | [steward/modules/rental/skills/noi_analysis.md](../modules/rental/skills/noi_analysis.md) | Rental Module |
| revpar_analysis | [steward/modules/hospitality/skills/revpar_analysis.md](../modules/hospitality/skills/revpar_analysis.md) | Hospitality Module |
| capex_planning | [steward/skills/capex_planning.md](../steward/skills/capex_planning.md) | Finance |
| permit_expiry_check | [steward/skills/permit_expiry_check.md](../steward/skills/permit_expiry_check.md) | Compliance |

追加 Skill は [steward/skills/](../steward/skills/00-このフォルダについて.md) に随時追加。

---

## CLI = Skill 実装

| CLI | 対応 Skill |
|-----|-----------|
| `steward dashboard` | executive_dashboard |
| `steward sync all` | contract_register / monthly_close |
| `steward forecast` | cashflow_forecast |
| `steward analyze property` | noi_analysis / revpar_analysis |
| `steward alerts` | contract_expiry_check · permit_expiry_check |
| `steward io *` | contract_register（归档） |

実装: `src/commands/` · 定義: `steward/skills/`

---

## 横断タスク

事業計画分解等の **Orchestrator プロンプト** は Agent ではなく [steward/orchestrators/](../steward/orchestrators/00-このフォルダについて.md)。Executive が委譲する。

---

## Secretary ↔ Steward 境界

[secretary_steward_boundary.md](secretary_steward_boundary.md) — 社内経営 OS と社長オペ・社外窓口の分離。

---

## 関連

- [docs/agent_architecture.md](../docs/agent_architecture.md) — 現行パス詳細（レガシー索引）
- [folder_access_policy.md](folder_access_policy.md)
