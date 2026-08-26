# Changelog

All notable changes to OrgOS Operator Layer are documented here.

**Engineering rules / 憲章:** 正本 `steward/rules/engineering/` · 索引 `steward/rules/openorgos-engineering-constitution.md` — 変更時は本 CHANGELOG と該当 ADR を更新。

## [Unreleased]

### Added
- **ローカル LLM ERROR フォールバック** — worker `tier: local` で必要情報欠落時は `ERROR: <理由>` 1行のみ（未確認・拒否エッセイ禁止）。`tool-loop` 注入 + enforce · ADR 0061 · `ORGOS_LOCAL_LLM_ERROR_FALLBACK=0` で無効
- **顧客管理タブ** — 1段目 `/customers/`（sales または customer_success モジュール On 時）。2段目: アウトバウンド（施策 + 商談）· インバウンド · アフターセールス · 解約・休眠。`GET /chat/v1/customers/*` · `sales` モジュール catalog · `binds_modules` 同期
- **Operator Console 情報設計** — 1段目を **帳簿** / **予実**（`/?wallet=1`）/ **取引** に分割。セットアップ・アカウントは設定アコーディオンへ。共通 `OpsPage` と `loading-panel` で読み込み表示を統一
- **CEO 承認受信箱** — `/approvals/` タブ。モジュール・規格切替などの承認待ちをスチュワードチャットから分離。PassKey セッションの stale `approver_id`（例: Demo CEO）は名簿の承認者名に再バインド。`tenant.config` は同一 CEO の受信箱確認を許可
- **エージェント追加・モジュール追加の承認ゲート** — エージェント有効化とカタログからのモジュール追加（`import_enable`）は `tenant.config` 承認キュー経由。能力増加の承認（追加・On・規格 On）は iPhone Settlement PassKey 必須（ADR 0037 拡張）。Off は PassKey なし
- **Operator Console 実行状況（Asana 風）** — 既定は未完了のみ。表示切替（未完了/完了/すべて）· グループ（計画/担当/種別/期限）· 計画スイムレーン · カード完了チェック · `POST .../complete|reopen`（`escalate:complete`）· `orgos escalate reopen`
- **ローカル LLM 変更ゲート** — `orgos change plan|apply` · 等級 A/B/C · hospitality `sync-derived` · Chat `change_plan`/`change_apply`（write は確認カード）· opened_date/stays/tax/room_count integrity warnings · ADR 0060
- **名簿↔給与・社保のソフト突合** — `employees` / `payroll.employee_ids` / org-chart の不一致を error ではなく warning + `fix_hints` で提示（`orgos validate` · headcount）。未リンク＝非従業員とは断定しない
- **OOO / Operator Console ログインドメイン** — `operators.yaml` の `login_policy.email_domains` で Community SSO を会社ドメインに制限。個人メールは創業者1席（`grandfather_emails` 最大1件）のみ。常勤メールのテナント横断は validate / invite で禁止。PassKey は対象外
- **Chat answer memory** — クラウド LLM の過去回答を派生索引し、ローカル LLM の system に参考として注入（ADR 0059 · `orgos chat memory reindex` · `ORGOS_CHAT_ANSWER_MEMORY=0`）
- **Chat feedback + FAQ index** — Good/Bad 評価 · Bad 回答の再利用停止 · Good から FAQ 索引を構築し完全一致時は LLM スキップ（`POST /chat/v1/feedback` · `orgos chat faq build` · アイドル自動更新）
- GL 商用 Wave 2–3: 月次発生主義（売掛/買掛）· 納付仕訳 · 期間ロック履歴 · 現金/固資/借入統制 · 未計上月 warning · 決算 PDF の BS/株主資本等変動 · 税理士引き渡しのテナント/FY 化 · 勘定科目内訳 CSV · Steward Chat 帳簿画面
- **消費税還付 R0–R3** — ADR 0056 · [consumption-tax-refund-spec.md](docs/org-os/consumption-tax-refund-spec.md)。還付候補 / eligibility / CLAIM · pack に加え、人間の `file` / `receive` で入金仕訳と税カレンダーの還付入金予定。e-Tax はしない。mal は点数目的で有効化しない
- Engineering Constitution 分割正本（`steward/rules/engineering/00–09`）と Cursor ミラー sync
- `validatePolicyMirrors()` — `orgos validate` / `npm run generated:check` で policy ミラー鮮度検査
- ADR 0001–0003 · `.github/pull_request_template.md`（DoD チェックリスト）
- **ADR 0044** · `orgos orchestrate` — Work Order DAG（`depends_on`）· 状態機械 · wave dispatch · retry/cancel · `orchestration_status` Skill
- `src/lib/orchestration/` — `work-order-state` · `plan-graph` · `orchestrate-actions`
- `orchestrate plan --write --depends` — 依存 edge 永続化 · `syncParentPlanStatus`（全 child 完了で親 complete）
- `orchestrate status --json` — `aia` · `aia_runs` · `nodes[].aia`
- Operator Console 組織図 — 取締役会で定めた会社図に加え、当該テナントで稼働中のエージェント（スチュワード・秘書等）と過去の組織記録（`as_of`）を表示
- 設定の表示言語 — 日本語／英語のプルダウン（未設定は日本語）。外観ピッカーと同じ設定画面

### Removed
- **フリート運用 Web UI** — `/ops/` タブ・`FleetOpsPage`・HTTP `GET /chat/v1/product/ops-dashboard` / `ops-available` を廃止。`/ops/` は `/` へリダイレクト。運用は `orgos ledger product ops-dashboard` と runbook のみ

### Fixed
- **決済 PassKey `allow_credentials` スコープ** — `settlementAllowCredentialsForOperator()` で名簿 `approver_name`（`boundApproverId`）に一致する決済鍵のみ提示。同一 operator の古い Demo CEO 鍵が混ざり iPhone 承認が「見つかりません」になる問題を修正。スナップショット/復元: `scripts/operator-passkey-snapshot.sh` · [passkey-known-good-baseline.md](docs/org-os/passkey-known-good-baseline.md)
- **PassKey Ceremony Router** — ログイン（`client-device` / Mac Touch ID）と決済承認（`hybrid` / iPhone QR）の切り替えを `apps/shared/passkey-ceremony.ts` に集約。`usb` トランスポートからの誤った hints 推論を禁止。承認モーダルは手動開始・決済 PassKey 未登録時のガイドを追加
- Operator Console Docker 統合 — ホスト SPA/CLI dist が古いと Good/Bad・FAQ が :9470 に出ない問題。`start-local-stack.sh` が起動前に dist を自動ビルドし、`--ensure` 時は console を recreate
- Chat 決定論経路（Fact / Command / Tower 等）でも `assistant_turn_id` を返し、Good/Bad ボタンを表示
- PassKey ログイン — 発行済みの鍵があればログアウト後に「Touch ID で入る」を出し、開発モードでも WebAuthn ログインを受け付ける
- PassKey 発行 — 開発環境でもログイン後の設定から Touch ID / iPhone 登録ができるよう、WebAuthn 設定を返し、未設定の loopback origin を受け付ける
- Operator Console ナビ — combined の `/wire/` と設定の戻る先を正しい面に固定。設定でスチュワードタブが current になっていた誤りを解消
- Operator Console 配色 — 本文・リンク・塗りボタン・警告/成功/危険を WCAG 相対輝度で読みやすく固定（塗りホバーは暗くする。薄い文字色禁止）· `tests/theme-contrast.test.ts`
- **FS-guard 自己評価修正** — `runFsGuardInternal` で台帳書込を hook 免除し `operator_guard_apply` / 本番 `guard init` が監査追記で失敗しない問題を解消 · bootstrap パス（operators / access-grants）の本番 init 前免除 · canonical-write baseline を `file:symbol` 件数キーへ · Shell 走査を interpreter argv のみに限定 · doctor の Skill Agent 警告を WARN 化
- `listHandoffs()` が dispatch manifest（`DISP-*.yaml`）を Work Order として parse し、dispatch 実行済みテナントで Today / dashboard が落ちる問題
- Work Order `blocked` → `pending` 復帰（上流 complete 後 · cancel 由来は除外）
- `orchestrate run|retry|cancel` の `auditCliMutation` 引数過多 — 監査行から件数/対象が欠落していた問題
- Run Board が親を持たない単独 Work Order を一覧に出さなかった問題（`child_ids` 必須 → top-level 判定へ）
- Run Board の KPI・ノード表の崩れ — 未定義 `.kpi-value` / `.kpi-label` を自前定義し、表カラムを `.orchestration-runs` 配下にスコープ
- Run Board の状態表示を絵文字からテキストラベルへ（絵文字フォント非搭載環境で判読不能だった）
- Run Board の SSE フォールバックが到達不能だった問題 — `EventSource` は例外でなく `onerror` で失敗するため、切断時に画面が静かに凍結していた（ポーリング切替 + 表示切替）

### Changed
- Operator Console 表示言語 — 設定・認証・シェル・チャットまわりのボタンと見出しを日英で揃え、混在しないようにした
- 設定画面 — 案内文と画面内リンクをやめ、言語・外観・PassKey を折りたたみ一覧にして展開してから変更する
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
