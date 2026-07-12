# Phase 4a 残課題トラック（F8 / F9 / Phase 5）

**Date:** 2026-07-12 · **Parent:** [phase4a-self-eval-remediation.md](phase4a-self-eval-remediation.md)

Phase 4a エンジニアリング PR の **Definition of Done 外**。出口条件のみ定義する。

---

## F8 — OrgOS maturity / CTR / ops records

| 項目 | 内容 |
|------|------|
| 現状 | maturity ≈85 · draft CTR · ops records ギャップ |
| 禁止 | 偽 `executed` · 人間未承認の台帳更新 |
| 出口条件 | `orgos control gaps` で P0 を特定 → CEO/Contract 承認 → executed / ops 更新 |
| 担当 | Contract Agent · CEO |

---

## F9 — Phase 4b Community Gmail OAuth

| 項目 | 内容 |
|------|------|
| 正本 | [ADR 0004](../adr/0004-gmail-deferred-opt-in-gate.md) · [gmail-ship-gate-checklist.md](gmail-ship-gate-checklist.md) § Phase 4b |
| 禁止 | OAuth E2E 前の `tenant_mail_connect_*: true` |
| 出口条件 | Google OAuth 2 本 · Community `COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED=1` · token push E2E · integration フラグ true |
| 担当 | Community + Operator |

---

## Phase 5 — 本番 env 既定化（CEO）

| 項目 | 内容 |
|------|------|
| 禁止 | CEO 未承認での `ORGOS_EMAIL_WIRE_REQUIRED=1` systemd 既定化 |
| 出口条件 | Phase 4a live 証跡 + （任意）4b · **CEO 承認** · [`scripts/mal-ship-gate-apply.sh`](../../scripts/mal-ship-gate-apply.sh) |
| 担当 | CEO + Operator |

---

## Phase 4a エンジニアリング完了後の次アクション

1. 本 PR マージ
2. F8 / F9 を別 Work Order / PR で起票
3. Phase 5 は CEO ゲートのみ
