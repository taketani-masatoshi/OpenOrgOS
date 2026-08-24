# Changelog

All notable changes to OrgOS Operator Layer are documented here.

**Engineering rules / 憲章:** 正本 `steward/rules/engineering/` · 索引 `steward/rules/openorgos-engineering-constitution.md` — 変更時は本 CHANGELOG と該当 ADR を更新。

## [Unreleased]

### Added
- Engineering Constitution 分割正本（`steward/rules/engineering/00–09`）と Cursor ミラー sync
- `validatePolicyMirrors()` — `orgos validate` / `npm run generated:check` で policy ミラー鮮度検査
- ADR 0001–0003 · `.github/pull_request_template.md`（DoD チェックリスト）

### Changed
- `openorgos-engineering-constitution.md` を索引専用に整理

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
