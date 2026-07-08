# Changelog

All notable changes to OrgOS Operator Layer are documented here.

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
