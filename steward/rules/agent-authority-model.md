# Agent Authority モデル — 組織線と作業中継の分離

**版:** 1.0 · **日付:** 2026-07-11  
**正本:** 本書 · **Catalog:** `steward/core/agents/registry.yaml` · **Relay:** `steward/core/reporting/chain-policy.yaml`

OrgOS では **組織上の上司** と **mission 作業報告の中継** を混同しない。

---

## 1. 二層モデル

| 層 | 正本 | 意味 |
|----|------|------|
| **組織線** | `registry.yaml` の `reports_to` | Agent の所属・委譲・org-chart |
| **作業中継** | `chain-policy.yaml` | COO / Steward 経由の **field report 配送** |

`chain-policy.yaml` の COO relay は **組織図の上司を表さない**（`org-chart.md` 冒頭注記と同義）。

---

## 2. コード上の判定

| 関数 | 参照 | 用途 |
|------|------|------|
| `getCatalogAgent(id).reports_to` | catalog | 組織図 · 委譲先 · manager graph |
| `isFieldAgent(id)` | catalog class + `chain-policy.excluded_from_field` | field 報告の送信可否 |
| `canReceiveImplementOrder(id)` | catalog `dispatch_modes` + activation | implement 命令の受付可否 |

**advisor**（`platform_guide`）は `isFieldAgent === false` · `implement` 不可。

---

## 3. 生成物との関係

| 成果物 | 由来 |
|--------|------|
| `org-chart.md`（mermaid · 16役割表） | catalog `reports_to` から自動生成 |
| `steward_agent_roster.md`（catalog-index） | catalog 全件 |
| `agent-capability-manifest.yaml` | catalog + skill owner + route owner |

手書きの構造表を正本にしない — `npm run agent:docs:sync` で同期。

---

## 4. テナント有効化（activation）

| activation | 意味 | roster 正本 |
|------------|------|-------------|
| `always` | コア Agent — roster 未設定でも active（安全既定） | 任意 |
| `tenant` | `profiles.operational` に明示されたときのみ | `data/operator/agents.yaml` |
| `developer_explicit` | `profiles.developer` にのみ | 同上 |

legacy `agents-enabled.yaml` は **自動読取しない**。移行は `orgos agent roster migrate` のみ。

未設定 / 破損の `agents.yaml` は **全 Agent 有効にしない** — コア既定のみ（`DEFAULT_CORE_OPERATIONAL_AGENTS`）。

---

## 4.1 Inactive Agent をいつ enable するか

Catalog は広い（〜50）。テナント roster は **選択的（典型 6–10）** が正。route match が `agent … inactive` で落ちても、まず **本当にその Agent が必要か** を判断する。

| 状況 | 推奨 |
|------|------|
| コア業務（finance · contract · compliance · operations · secretary · executive） | roster `operational` に含める（`orgos agent roster init` 既定） |
| 税務申告・e-Tax 準備 | `tax` を enable — Skill `tax_filing_prep` の executing agent |
| Work Order 委譲・進捗の専任 | `coo` を enable（無い場合は escalate / Steward 経由で足りることが多い） |
| Wire 本番ゲート · classification 監査 | `security` を enable |
| 法務・登記ドラフト | `legal`（JP 登記モジュール連動時） |
| 一時タスクだけ広い Agent が必要 | `orgos agent roster task --agents a,b` + `route … --profile task`（終わったら `task --clear`） |
| 実装相談のみ（`platform_guide`） | `developer` profile — [agent-advisor-operations.md](agent-advisor-operations.md) |

```bash
# 確認
orgos route match --text "税務申告"          # inactive なら blockedReasons に enable 案内
orgos agent roster show

# 恒常運用に追加
orgos agent roster enable --agent tax --profile operational

# 一時セッション
orgos agent roster task --agents tax,coo
orgos route match --text "税務申告" --profile task
orgos agent roster task --clear
```

**しないこと:** Catalog 全件を `operational` に並べる · inactive を無視して LLM に全 Agent を載せる。

---

## 5. 関連

- [agent-advisor-operations.md](agent-advisor-operations.md)
- [agent_skill_architecture.md](agent_skill_architecture.md)
- `steward/platform/protocol/agent-delegation-scopes.yaml` — ドメイン別委譲スコープ
- route access 欠落時: `orgos tenant align-classification`（`data/classification-registry.yaml` と route `resource_paths`）
