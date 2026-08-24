# Executive Steward オーケストレーション品質引き上げ計画

**日付:** 2026-08-24  
**対象 Agent:** `executive_steward`（経営統括 · オーケストレータ）  
**基準テナント:** `mal`  
**現状:** `orgos agent readiness` **98/100** · P0 決定論オーケストレーション **完了**（2026-08-24）  
**目標:** P1 以降 — LLM planner / critique ループ · Run Board UI · cost gate

**非対象:** 部門 Agent の Primary Folder 編集 · 組織承認実行 · 正データ YAML 直接変更

---

## 0. なぜ上げるか

mal は Finance / Compliance / Operations 等が並行稼働する。Steward は dashboard + agent-summaries で **読取統合** はできるが、Work Order の **依存順序・失敗・retry・進捗** が CLI 上 disconnected だった。

P0 後は CEO / Operator が `orgos orchestrate status` 1 枚で DAG · wave · attempts · trace · **AIA run 状態** を確認できる。

---

## 1. 現状ギャップ（98 点の内訳 · P0 前）

| 軸 | 配点 | P0 前 | P0 後 |
|----|:----:|:-----:|:-----:|
| 定義 | 15 | 15 | 15 |
| Skill/CLI | 20 | 18 | 20 |
| データ SoT | 15 | 15 | 15 |
| routing | 10 | 10 | 10 |
| 要約 | 15 | 15 | 15 |
| 証拠 | 10 | 10 | 10 |
| テナント | 15 | 15 | 15 |
| **orchestration** | — | 未接続 | **DAG + state + CLI + AIA status 統合** |

---

## 2. 境界（混在させない）

```
CEO（最終承認 · HumanApprovalContext）
  └─ Executive Steward（要約 · DAG 起票 · 進捗統合）
        └─ 子 IMP → department agents（Finance / Compliance / …）
              └─ AIA scheduler（同時実行枠 · workspace 隔離）
```

| 層 | 正本 | Steward の扱い |
|----|------|----------------|
| Work Order | `docs/reports/routing-queue/IMP-*` | 起票 · depends_on · status 遷移 |
| Dispatch manifest | `routing-queue/DISP-*` | wave ごと生成 |
| AIA run | `data/org/aia-queue.yaml` | 読取のみ（status 統合表示） |
| 正データ | `data/**` | **触らない** |

P0 で **ADR 0044** として固定済み。

---

## 3. ゴールと DoD

| ゴール | 達成イメージ | 計測 |
|--------|-------------|------|
| DAG | `depends_on` で wave 分割 | `orchestrate status` |
| 状態機械 | dispatch が WO status を更新 | `work-order-state.test.ts` |
| retry | 失敗 IMP を `orchestrate retry` | `orchestration-dispatch.test.ts` |
| AIA 統合 | WO 行に AIA run 状態を join | `orchestrate status` · `## AIA runs` |
| CLI 統合 | plan / run / status / retry / cancel | `orgos orchestrate --help` |
| 後方互換 | 既存 IMP YAML 無改変で読める | `escalate.test.ts` · `work-order-state.test.ts` |
| policy 同期 | agent/capability/docs + sync-policy | `orgos operator sync-policy --emit all` |

**完了条件チェックリスト（P0 · 2026-08-24 更新）**

| # | 条件 | 状態 | 根拠 |
|---|------|:----:|------|
| 1 | ADR 0044 Accepted | ✅ | [0044-work-order-dag-orchestration.md](../adr/0044-work-order-dag-orchestration.md) |
| 2 | 本計画書 + CHANGELOG `[Unreleased]` 更新 | ✅ | 本書 · `CHANGELOG.md` |
| 3 | `orgos orchestrate` CLI 5 サブコマンド | ✅ | plan · run · status · retry · cancel |
| 4 | `transitionWorkOrder` 集約 · queue event 連動 | ✅ | `src/lib/orchestration/work-order-state.ts` |
| 5 | wave 駆動 dispatch · `trace_id` 伝播 | ✅ | `src/lib/agent-dispatch.ts` |
| 6 | `orchestrate status` — DAG · status · attempts · trace · **AIA run** | ✅ | `buildOrchestrationStatusPayload` |
| 7 | 失敗下流ブロック + `orchestrate retry` 再開 | ✅ | `blocked → pending` 復帰 · `orchestration-dag.test.ts` |
| 8 | LLM なしで P0 コアが動作 | ✅ | 決定論 CLI + mock 統合テスト |
| 9 | 既存 WO YAML 後方互換 | ✅ | `pending→completed` 許可 · schema optional フィールド |
| 10 | `npm test`（orchestration 関連）通過 | ✅ | **21 件**（state 6 · dag 12 · dispatch 3 · 2026-08-24 再検証） |
| 11 | `orgos validate`（mal）通過 | ✅ | exit 0（warnings のみ · 2026-08-24 再検証） |
| 12 | `orgos operator sync-policy --emit all` | ✅ | 2026-08-24 実行済み |
| 13 | `runDispatch` 統合テスト（wave · retry · max_attempts） | ✅ | `tests/orchestration-dispatch.test.ts` |
| 14 | `npm run check` 全テナント通過 | ⚠️ | demo 等テナントデータ — 別途確認 |
| 15 | readiness orchestration 軸の formalize | ✅ | `agent-readiness.ts` · executive_steward **100%** |
| 16 | `orchestrate plan --write --depends` | ✅ | 依存 edge 永続化 · `applyDependsToWorkOrders` |
| 17 | 親 IMP 自動 complete（全 child completed） | ✅ | `syncParentPlanStatus` |
| 18 | `orchestrate status --json` AIA 統合 | ✅ | `aia` · `aia_runs` · `nodes[].aia` |
| 19 | Steward Chat → orchestrate status 案内 | ✅ | `steward-orchestrate-intent.ts` |
| 20 | Run Board API 骨格 | ✅ | `GET /chat/v1/orchestration/runs` · SSE stream |
| 21 | CLI smoke テスト | ✅ | `tests/orchestrate-cli.smoke.test.ts` |

**P0 サマリ:** オーケストレーション必須 **19/19 達成**（#14 は demo テナント · repo 横断）。

---

## 4. データ契約（P0 固定）

```yaml
# docs/reports/routing-queue/IMP-YYYYMMDD-NNN.yaml
id: IMP-...
depends_on: [IMP-YYYYMMDD-001]   # 任意 · 同一親 plan 内のみ
status: pending | waiting | dispatched | running | completed | failed | blocked
dispatch:
  attempts: 0
  max_attempts: 2
  trace_id: TRC-...
  last_run_id: RUN-IMP-...
  last_error: ...
```

wave は **保存しない**（`depends_on` から毎回導出）。

---

## 5. Skill / CLI（P0 実装）

| Skill | runtime | CLI | 権限 | 内容 |
|-------|---------|-----|------|------|
| `orchestration_status` | cli | `orchestrate status` | chat:read | DAG 進捗 |
| `escalate_work_order` | cli | `escalate run` | escalate:run | WO 起票（既存） |

---

## 6. フェーズ

### P0 — 決定論オーケストレーション ✅ 完了（2026-08-24）

1. schema 拡張 · state machine · plan-graph  
2. `agent-dispatch` wave 駆動 · trace_id  
3. `orgos orchestrate` CLI  
4. tests · ADR 0044 · 本計画書  
5. AIA status 統合 · sync-policy · dispatch 統合テスト  
6. **P0 hardening（2026-08-24）** — blocked 復帰 · 親 complete · plan `--write` · status JSON AIA · Chat 案内

**出口:** LLM なしで DAG dispatch · retry · status（+ AIA run）が動く — **達成**

### P1 — LLM planner + critique ループ（骨格 2026-08-24）

- ✅ `orchestrate plan --propose` — 起票前ゲート（`validation.ok` / 不適格 route の列挙）· `src/lib/orchestration/llm-planner.ts`。**分解は決定論のみ**（`source: "deterministic"` を偽らない）
- ✅ queue event を状態機械に集約 — `dispatched → dispatch_requested` · `running → work_order_running`。呼び出し側の重複 push を排除
- ⬜ 別 Agent レビュー → 修正 WO 起票
- **dispatch E2E 方針:** `tests/orchestration-dispatch.test.ts`（`ORGOS_LLM_MOCK=1` · spy）を正とし、実 LLM E2E は Playwright + staging operator のみ

### P2 — Run Board UI（最小 2026-08-24）

- ✅ `/chat/v1/orchestration/runs` · SSE（API 骨格）
- ✅ Steward Chat `/?runs=1` · `OrchestrationRunsPage`（一覧 + ノード表 + SSE）
- ✅ E2E — `e2e/steward-chat.runboard.spec.ts`（`playwright.steward-chat.config.ts`）
- ⬜ Agent Inbox パネル接続 · retry/cancel 操作 UI

---

## 6.1 テスト実行の前提（fixture restore lock）

`tests/setup-restore-protocol.ts` はテナント fixture の復元を **worktree 単位のロック**で直列化する。
ただし直列化されるのは **復元処理だけ** で、テスト本体は直列化されない。
同一 worktree で複数の `vitest` を同時に走らせると、共有テナントファイル（routing-queue · AIA run store）で競合する。

| 症状 | 対処 |
|------|------|
| `Timed out waiting for fixture restore lock` | 他セッションの `vitest` 完了を待つ（`pgrep -fl "vitest run"`） |
| 単独では通るのに同時実行で落ちる | **同一 worktree での並行 vitest を避ける**（設計上の制約） |
| 長時間の並行実行が避けられない | `ORGOS_TEST_LOCK_TIMEOUT_MS=300000` |
| `tests/.fixture-snapshot/` の肥大 | `beforeAll` の孤児 GC が dead pid 分を自動削除 |

**2026-08-24 の改善:**

- タイムアウトエラーに **保持中の pid・経過時間・対処** を含める
- 孤児 snapshot GC（放置 119 ディレクトリを実測で確認 → 自動回収）
- owner marker の atomic 書込 + 旧形式互換（並行する旧コード実行を誤って破棄しない）
- 他 run 検出時に `beforeAll` で警告を出力

**既知ギャップ:** `tests/test-registry.yaml` は worktree 全体が未コミットのため disk と乖離（disk 424 / registry 440）。
本オーケストレーション分の 6 ファイルは登録済み。tree 全体のコミット時に `npm run test:registry:sync` が必要。

### P3 — Observability / cost

- `trace_id` 全経路 · `aia_llm_wait` metrics
- admission cost gate

---

## 7. 点数の見通し

| 時点 | Skill/CLI | orchestration | **計（readiness）** |
|------|:---------:|:-------------:|:-------------------:|
| P0 前 | 18 | 未接続 | **98** |
| P0 完了 | 20 | CLI 完備 | **100**（orchestration 軸は P1 で formalize） |

---

## 8. 実装順（ファイル）

| 順 | パス | 内容 |
|----|------|------|
| 1 | `schemas/routing.ts` · `schemas/queue.ts` | handoffStatus · depends_on · dispatch |
| 2 | `src/lib/orchestration/work-order-state.ts` | 状態機械 |
| 3 | `src/lib/orchestration/plan-graph.ts` | DAG |
| 4 | `src/lib/agent-dispatch.ts` | wave dispatch |
| 5 | `src/commands/orchestrate.ts` | CLI |
| 6 | `steward/core/skills/registry.yaml` | orchestration_status |
| 7 | `src/lib/orchestration/orchestrate-actions.ts` | status 表示 · retry/cancel · AIA join |
| 8 | `tests/orchestration-*.test.ts` | state · dag · dispatch 契約テスト |

Agent 変更後の定例:

```bash
npm run agent:capability:sync
npm run agent:docs:sync
orgos operator sync-policy --emit all
orgos operator export --agent executive_steward
orgos validate
npm test
```

---

## 9. リスク

| リスク | 回避 |
|--------|------|
| dispatch と escalate complete の競合 | 許可遷移表で `pending→completed` 明示 |
| 親 IMP が manifest に混入 | `child_ids` ありは ready から除外 |
| AIA 枠不足で false failed | admission 失敗は `failed` + retry 可能 |

---

## 11. 関連

- [ADR 0044](../adr/0044-work-order-dag-orchestration.md)
- [ADR 0040](../adr/0040-aia-parallel-runtime.md)
- [executive_steward_agent.md](../../steward/core/agents/executive_steward_agent.md)
- [aia-parallel-runtime.md](./aia-parallel-runtime.md)
