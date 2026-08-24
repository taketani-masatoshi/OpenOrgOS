# Changelog

All notable changes to OrgOS Operator Layer are documented here.

**Engineering rules / 憲章:** 正本 `steward/rules/engineering/` · 索引 `steward/rules/openorgos-engineering-constitution.md` — 変更時は本 CHANGELOG と該当 ADR を更新。

## [Unreleased]

### Added
- Engineering Constitution 分割正本（`steward/rules/engineering/00–09`）と Cursor ミラー sync
- `validatePolicyMirrors()` — `orgos validate` / `npm run generated:check` で policy ミラー鮮度検査
- ADR 0001–0003 · `.github/pull_request_template.md`（DoD チェックリスト）
- **ADR 0044** · `orgos orchestrate` — Work Order DAG（`depends_on`）· 状態機械 · wave dispatch · retry/cancel · `orchestration_status` Skill
- `src/lib/orchestration/` — `work-order-state` · `plan-graph` · `orchestrate-actions`
- `orchestrate plan --write --depends` — 依存 edge 永続化 · `syncParentPlanStatus`（全 child 完了で親 complete）
- `orchestrate status --json` — `aia` · `aia_runs` · `nodes[].aia`

### Fixed
- **FS-guard 自己評価修正** — `runFsGuardInternal` で台帳書込を hook 免除し `operator_guard_apply` / 本番 `guard init` が監査追記で失敗しない問題を解消 · bootstrap パス（operators / access-grants）の本番 init 前免除 · canonical-write baseline を `file:symbol` 件数キーへ · Shell 走査を interpreter argv のみに限定 · doctor の Skill Agent 警告を WARN 化
- `listHandoffs()` が dispatch manifest（`DISP-*.yaml`）を Work Order として parse し、dispatch 実行済みテナントで Today / dashboard が落ちる問題
- Work Order `blocked` → `pending` 復帰（上流 complete 後 · cancel 由来は除外）
- `orchestrate run|retry|cancel` の `auditCliMutation` 引数過多 — 監査行から件数/対象が欠落していた問題
- Run Board が親を持たない単独 Work Order を一覧に出さなかった問題（`child_ids` 必須 → top-level 判定へ）
- Run Board の KPI・ノード表の崩れ — 未定義 `.kpi-value` / `.kpi-label` を自前定義し、表カラムを `.orchestration-runs` 配下にスコープ
- Run Board の状態表示を絵文字からテキストラベルへ（絵文字フォント非搭載環境で判読不能だった）
- Run Board の SSE フォールバックが到達不能だった問題 — `EventSource` は例外でなく `onerror` で失敗するため、切断時に画面が静かに凍結していた（ポーリング切替 + 表示切替）

### Changed
- `openorgos-engineering-constitution.md` を索引専用に整理
- `executive_steward` readiness — orchestration 軸（2pt）· **100%**
- Run Board API — `/chat/v1/orchestration/runs` · SSE · `GET ?include=completed` · `POST /runs/retry|cancel`（`chat:ask`）
- Run Board UI — Steward Chat `/?runs=1` · 操作可否は `retryableCount` / `cancellableCount` · 完了済み root · Inbox は `/steward/` リンク
- Run Board E2E — `e2e/steward-chat.runboard.spec.ts`（pending「待機」· failed retry 失敗→待機 · Playwright 4 件 green）
- Run Board HTTP 契約 — `tests/steward-chat-orchestration-http.test.ts` · POST エラー not found=404 / その他=400 · 一覧 GET は queue 例外を 500
- `orchestrate plan --propose` — 起票前 validation ゲート（`llm-planner.ts` · 分解は決定論のみ）
- Work Order lifecycle queue event を状態機械に集約 — `dispatch_requested` · `work_order_running`
- orchestrate CLI smoke — `plan --write` → `run --dry-run` → `status --json`
- テスト fixture restore lock — ヘルパ抽出 · 単体テスト · `vitest` `hookTimeout` 120s（lock 90s より上）

## [0.8.0-beta.3] — 2026-08-24

Public demo refresh (`ghcr.io/taketani-masatoshi/orgos-demo:0.8.0-beta.3`).

### Changed
- Community OIDC 引き継ぎで Wire / 予実の二重ログインを避ける
- Steward の財務回答をテナント YAML に接地し、Work Order を自動オーケストレーション
- PassKey 登録を SSO 必須にし、`operators.yaml` にバインド
- LLM / MCP から最終承認ツールを削除（`operator_approve` · `steward_approve`）。本番は `ORGOS_LLM_TOOLS_WRITE=1` を doctor / prod-checklist が拒否
- `orgos doctor` が prod-checklist を実行する
- 承認は認証済み ceo/approver に名義バインド。自己承認禁止を全内部 subject に適用
- 週次 attest がチェーン末尾 digest を Witness pin として固定。`events chain pin` を追加。台帳 YAML/JSONL/MD のヘルパー直書きを拒否。壊れたチェーンを `backfill --force` で復旧しない
- `events:write` で会社イベント CLI を認証。`chain backfill --force` は `ORGOS_EVENTS_CHAIN_REBUILD=1` + ceo + `--i-understand-rebuild` に隔離。`skipChain` は非公開

## [0.8.0] — 2026-06-28

### Added
- Steward Chat CEO Today panel with KPI, wire/witness actions, streaming ask
- Combined Operator Console (`orgos operator console start`) — shared session cookie
- MCP 7 tools including witness register/verify/flush
- HTTP rate limiting and MCP rate limiting
- CSRF, RBAC, Chat audit logging for production
- Witness E2E (Chat UI + BFF + MCP + local hub fixture)
- `orgos mcp rotate-token` for MCP token rotation checklist
- `steward-chat:release-check` release gate script

### Changed
- Production misconfig now blocks server startup (`ORGOS_ENV=production`)
- Wire Console SPA builds to `/wire/` base for combined deploy

### Distribution
- `@orgos/cli` and `@orgos/wire` npm packages with publish-check CI
- Homebrew tap templates in `homebrew-tap/`
