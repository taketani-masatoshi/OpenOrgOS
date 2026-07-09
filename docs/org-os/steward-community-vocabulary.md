# Steward ↔ Community 語彙対応表 (S-E2 · C4-W3)

**Status:** 正本 · 8 locale は Community `packages/shared/i18n` で mirror  
**Parent:** [c4-community-epic-2026.md](c4-community-epic-2026.md)

---

## コア語彙

| Steward / OrgOS | Community UI | 説明 |
|-----------------|--------------|------|
| `trusted-operators.yaml` | Trusted Operators | Witness Hub 運用者レジストリ |
| `protocol community governance submit` | Operator application | 新規 operator 認証申請 |
| `protocol community governance decide` | CHAIR approval | 委員会承認/却下 |
| `protocol community check-sla` | SLA dashboard | 失効 SLA 超過アラート |
| `protocol community readiness` | Eco readiness score | Steward-side C4 採点 |
| `wire-trust-registry.yaml` | Wire Trust Registry | 組織 Node ID / DID / 鍵 pin |
| `ModuleRoleType` | Module role request | モジュール委員会ロール申請 |
| `committeeReviewAuditLog` | Review audit trail | Community DB 内監査 |

---

## ライフサイクル（C4-W1）

| ステップ | Steward | Community |
|----------|---------|-----------|
| 1. Apply | `governance submit` | `/governance/lifecycle` · mypage |
| 2. Pending | `governance_requests[]` | PENDING 一覧 |
| 3. Review | — | `/committees/[slug]/review` |
| 4. Decide | `governance decide` | CHAIR UI → BFF → Steward CLI |
| 5. Active | `operators[]` active | `/protocol/trusted-operators` |

---

## API mirror（publish/protocol/）

| ファイル | Consumer |
|----------|----------|
| `trusted-operators.yaml` | Community `/api/protocol/operators` |
| `community-readiness.json` | `/api/protocol/readiness` |
| `community-sla.json` | `/api/protocol/sla` |
| `community-integration.json` | Eco strict cap 98 ゲート |

*改定: 2026-07-10*
