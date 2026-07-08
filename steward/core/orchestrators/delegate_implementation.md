# Delegate Implementation — 実装委譲（Orchestrator）

**版:** 2026-06-09 · **種別:** 14_prompts（Agent ではない） · **委譲元:** Executive Steward / Secretary

---

## 役割

経営・業務上の **実装タスク**（コード · docs · schema · CLI 追加）を、ルーティングレジストリ + タスク種別で **担当 Agent に Work Order として振る**。

**consult（照会）** は [secretary_escalation.md](secretary_escalation.md) · **implement（実装）** は本 Orchestrator。

```
段 / ユーザー → Secretary（一次受け · 実装依頼）
       ↓
     @steward/core/orchestrators/delegate_implementation.md
       ↓
     Executive Steward（分解 · 割当 · 統合サマリ）
       ↓ route match + task_type=implement
     Work Order IMP-* → docs/reports/routing-queue/
       ↓ prompts/{agent}.md
     各 Agent（並列 Cursor チャット · Primary Folders のみ編集）
       ↓
     escalate complete → Executive 統合
```

**4 層:** Orchestrator = 分解・委譲・統合（**正データ編集しない**）。実装 = 各 Module / 部門 Agent。

---

## 起動

| 経路 | 操作 |
|------|------|
| **推奨** | Steward スレッド 1 本で `@steward/core/orchestrators/delegate_implementation.md` + 入力テンプレ |
| **CLI** | `npm run orgos -- escalate plan --text "..."` → `escalate run --text "..."` |

---

## 入力フォーマット

```markdown
## 実装委譲入力 YYYY-MM-DD

**件名:** （一行）
**背景:** （なぜ今 · 誰から · 期限）
**実装要件:** （具体的 · ファイル · CLI · テスト）
**Deliverables:**
- （成果物 1）
- （成果物 2）
**完了条件:**
- npm run check 通過
- …
**優先度:** P0 | P1 | P2 | P3
**テナント:** mal（任意 · デフォルト ORGOS_TENANT）
**参照パス:** `src/...` または `docs/...`（route match 用 · 任意）
```

---

## 作業手順（Step 1–6）

### Step 1 — 受理・正規化

- 入力を検証（件名 · 実装要件 · 完了条件）
- L2/L3 具体値は Work Order に含めない

### Step 2 — ルートマッチ

```bash
npm run orgos -- escalate plan --text "..." [--path ...] [--dry-run]
npm run orgos -- route match --text "..."
```

- [routing/registry.yaml](../core/routing/registry.yaml) で担当 Agent 候補を決定
- classification アクセス不可 · モジュール無効 · Executive 境界違反は **blocked**

### Step 3 — Agent 割当

- **単一 Agent:** IMP-1 件
- **複数 Agent:** 親 IMP（Executive 統合用）+ 子 IMP（`parent_id` · 依存順序は Finance → Contract → Compliance 等を Executive が注記）

| 実装種別 | 典型 Agent |
|---------|-----------|
| schema · CLI · src | Operations（骨格）/ Finance / 該当 module |
| 規程 · 個情 · ISO | Compliance |
| 契約テンプレ · CTR | Contract |
| executive YAML 例示 | Secretary（実データは gitignore） |

### Step 4 — Work Order 生成

```bash
npm run orgos -- escalate run --text "..." --from executive_steward [--tenant mal]
```

**出力:**

| ファイル | 内容 |
|---------|------|
| `docs/reports/routing-queue/IMP-YYYYMMDD-NNN.yaml` | Work Order マニフェスト |
| `docs/reports/routing-queue/IMP-YYYYMMDD-NNN.md` | 人間可読サマリ |
| `docs/reports/routing-queue/prompts/IMP-*_{agent}.md` | Agent 専用実装プロンプト（`@steward/core/agents/*_agent.md` 参照付き） |
| `docs/reports/routing-queue/YYYY-MM-DD-escalate-{slug}.md` | Executive 統合サマリ |

`task_type: implement` · `mode: implement`（consult の HO-* とは `task_type` で区別）

### Step 5 — Agent 実行（Phase 1 現実解）

| 種別 | 起動 |
|------|------|
| **CLI Skill あり** | `npm run orgos -- route dispatch --id IMP-... --mode auto` |
| **Cursor-only Agent** | 並列チャットで `@docs/reports/routing-queue/prompts/IMP-*_{agent}.md` を起動 |
| **完了** | `npm run orgos -- escalate complete --id IMP-... --notes "..."` |

### Step 6 — Executive 統合サマリ

- 子 Work Order の完了状況を `escalate status --pending` で確認
- 統合サマリを Secretary / 段へ（L2 値禁止 · 結論 + アクション最大 3）

---

## Work Order スキーマ（YAML）

```yaml
id: IMP-20260609-001
task_type: implement
mode: implement
from_agent: executive_steward
to_agent: compliance
subject: …
requirements: …
deliverables: []
acceptance_criteria: []
parent_id: null   # 複数 Agent 時は子に設定
agent_prompt_path: prompts/IMP-20260609-001_compliance.md
priority: P2
tenant: mal
status: pending
```

---

## 統合回答テンプレ（Executive → Secretary / 段）

```markdown
# 実装委譲サマリ YYYY-MM-DD

**件名:** …
**Work Orders:** IMP-001 (Compliance), IMP-002 (Operations)

## 進捗
| ID | Agent | Status |
|----|-------|--------|

## 段へ（結論）
- …

## 次アクション（最大 3）
1. …
```

---

## 禁止

- Orchestrator / Executive が `data/**` YAML を直接編集
- L2 値（口座 · secrets · stakeholders 実名）を Work Order / プロンプトに転記
- 無効モジュール Agent への implement 割当

---

## CLI 一覧

```bash
npm run orgos -- escalate plan --text "..." [--dry-run]
npm run orgos -- escalate run --text "..." --from secretary
npm run orgos -- escalate run --id IMP-...          # プロンプト再生成
npm run orgos -- escalate status [--pending|--blocked]
npm run orgos -- escalate complete --id IMP-... --notes "..."
npm run orgos -- route dispatch --id IMP-... --mode auto   # CLI skill
```

---

## 起動例

```
@steward/core/orchestrators/delegate_implementation.md

## 実装委譲入力 2026-06-09

**件名:** classification-registry に RES-EXEC エントリ追加
**背景:** executive gitignore 後の example 整合
**実装要件:** RES-EXEC-* を registry に追記 · validate 通過 · README 1 行
**完了条件:** npm run check · git ls-files executive/ が example のみ
**優先度:** P1
**参照パス:** data/classification-registry.yaml
```

---

## 将来 Phase 3（スコープ外）

- 本番 HTTP webhook サーバー常駐
- Cloud Agent VM 常時接続
- git 自動マージ（PR 生成）

---

## 関連

- [secretary_escalation.md](secretary_escalation.md) — consult
- [routing/README.md](../core/routing/README.md) — route · handoff · escalate
- [folder_access_policy.md](../rules/folder_access_policy.md) §4
- [executive_steward_agent.md](../core/agents/executive_steward_agent.md)
