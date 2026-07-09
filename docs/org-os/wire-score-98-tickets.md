# Wire / OrgOS スコア 98+ — チケット正本

**Status:** 2026-07-10 発行 · 並行開発  
**Parent:** [wire-hub-stack-pilot.md](wire-hub-stack-pilot.md) · [orgos-scoring-methodology.md](orgos-scoring-methodology.md)

---

## トラック A — Wire（W1–W5）

| ID | Phase | タイトル | 状態 | DoD |
|----|-------|---------|:----:|-----|
| **W1-1** | W1 | mal protocol init 再現 | ○ | `init-tenant-wire-pilot.sh mal` · `mal-wire-pilot-gate` PASS |
| **W1-2** | W1 | mal peers wire_v1（southwood） | ○ | `peers.yaml` · trust-registry 鍵 pin |
| **W1-3** | W1 | TLS Mode A runbook 連動 | ○ | `setup-mal-wire-operator.sh` · `deploy/mal-pilot/caddy/` |
| **W1-4** | W1 | Trust Registry publish | ✅ | `publish-protocol-registry.sh` · mal peers seed |
| **W2-1** | W2 | relay systemd / Docker 常駐 | ○ | `deploy/mal-pilot/systemd/` · `install-mal-wire-systemd.sh` |
| **W2-2** | W2 | Wire Gateway systemd | ○ | `steward-wire-gateway@` · env example |
| **W2-3** | W2 | relay E2E CI | ○ | `tests/wire-relay-e2e.test.ts` |
| **W2-4** | W2 | Hub 鍵ローテ半自動 | ○ | `scripts/hub-signing-rotate.sh` · timer unit |
| **W3-1** | W3 | Wire Console staging IdP | △ | `wire-console-staging-checklist.md` |
| **W3-2** | W3 | WebAuthn 実 passkey checklist | △ | runbook §18 追記 |
| **W3-3** | W3 | release-check CI green | ○ | validate.yml wire-console-smoke |
| **W4-1** | W4 | `wire-gateway discover --apply` | ○ | dry-run + apply · test |
| **W4-2** | W4 | `wire-gateway federation sync` | ○ | trust-registry key sync wrapper |
| **W4-3** | W4 | discover apply E2E | ○ | `wire-gateway-discover-apply.test.ts` |
| **W4-4** | W4 | relay SLA alert | △ | relay-worker metrics · runbook |
| **W5-1** | W5 | strict cap wireEvidence 99 | ○ | `wire-production-evidence.ts` · mal deliver test |

---

## トラック B — OrgOS（O1–O4）

| ID | Phase | タイトル | 状態 | DoD |
|----|-------|---------|:----:|-----|
| **O1-1** | O1 | JP module tier 昇格 | ○ | 3 module → production_ready · 28/28 |
| **O1-2** | O1 | `modules check --all` green | ○ | validate CI |
| **O1-3** | O1 | IF 軸 98+ 確認 | ○ | `status --orgos` IF ≥ 98 |
| **O2-1** | O2 | standalone 本番証跡 script | ○ | `scripts/standalone-prod-evidence.sh` |
| **O2-2** | O2 | outbox permissions 本番ゲート | ○ | `STEWARD_ENFORCE_OUTBOX_PERMISSIONS` test |
| **O2-3** | O2 | standalone strict cap 準備 | △ | runbook · 7日 uptime 後 cap PR |
| **O3-1** | O3 | audit-bridge readiness check | ○ | orgos-readiness チェック追加 |
| **O3-2** | O3 | witness emit 率チェック | △ | strict form 準備 |
| **O3-3** | O3 | form cap governance doc | △ | steering 判断待ち |
| **O4-1** | O4 | community readiness 拡張 | ○ | wire pilot checks + score |
| **O4-2** | O4 | community check-sla CI | ○ | validate.yml 日次相当 |
| **O4-3** | O4 | OS_Community C4 backlog | ○ | [c4-community-epic-2026.md](c4-community-epic-2026.md) Epic 起票 |
| **O4-4** | O4 | committee 法域レジストリ UI | ○ | OS_Community · 別 WO |

---

## 検証（Epic Done）

```bash
./scripts/init-tenant-wire-pilot.sh mal
./scripts/setup-mal-wire-operator.sh
npm test -- tests/wire*.test.ts tests/mal-wire*.test.ts tests/wire-relay-e2e.test.ts
npm run wire-console:test
npm run orgos -- status --orgos
npm run orgos -- modules check --all
```

**Epic Done:** Wire ドメイン ~98 · OrgOS チェックリスト IF/Eco 98+ · 厳格 Wire 99（W5 cap PR 後）
