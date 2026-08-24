# orchestration_status

Executive Steward 向け — Work Order DAG の wave / status / attempts / trace / **AIA run** を表示する。

**CLI:** `npm run orgos -- orchestrate status --id <IMP-...>`

**JSON:** `npm run orgos -- orchestrate status --id <IMP-...> --json`（`aia` · `aia_runs` · `nodes[].aia` を含む）

**Path:** `steward/core/skills/orchestration_status.md`

## 関連コマンド

| 操作 | CLI |
|------|-----|
| 計画（dry-run） | `orchestrate plan --text "..."` |
| 計画 + 依存永続化 | `orchestrate plan --write --depends CHILD:PARENT --text "..."` |
| wave 実行 | `orchestrate run --id <IMP-...>` |
| 失敗 retry | `orchestrate retry --id <IMP-...>` |
| 待機中 cancel | `orchestrate cancel --id <IMP-...>` |

## 出力列（Markdown）

- **DAG 表:** wave · id · agent · status · depends_on · attempts · trace · **aia**
- **AIA runtime:** tier · max_concurrent · running · queued
- **AIA runs (plan):** run_id · work_order · agent · state · fail_reason
