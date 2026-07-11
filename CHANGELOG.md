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
