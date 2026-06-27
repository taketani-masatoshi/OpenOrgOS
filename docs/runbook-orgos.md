# OrgOS 運用 Runbook

**対象:** テナント protocol · org approval · witness · audit bridge  
**正本:** [framework-assessment.md](framework-assessment.md) §13 · [org-approval-schema.md](org-os/org-approval-schema.md)

---

## 1. 単独 OrgOS（peer/witness なし）

```bash
npm run demo:standalone-org          # hk-demo · identity · delegation · internal approve · validate
npm run demo:mal-standalone          # mal · peers/witness off · standalone validate
npm run steward -- --tenant mal protocol validate --standalone
npm run steward -- --tenant mal protocol audit verify
npm run steward -- status --orgos
```

**期待:** exit 0 · audit chain に `org.approval.granted` · validate warnings のみ（witness 無効時）

---

## 2. audit bridge 失敗

| 症状 | 確認 | 対処 |
|------|------|------|
| validate に `audit-bridge-failed` | `data/org/audit-bridge-errors.yaml`（テナント） | 原因修正後 `steward protocol validate` 再実行 |
| chain と operational ログの差 | [org-approval-schema.md](org-os/org-approval-schema.md) §19 | operational 正本 · chain は mirror — bridge 再試行は ingest/approve 経路 |

---

## 3. witness quorum / warn_only

| 設定 | 動作 |
|------|------|
| `wire_governance_policy.warn_only: true`（デフォルト） | quorum 未達 → **warning** |
| `warn_only: false`（本番） | quorum 未達 · receipt 欠落 → **issue**（validate 失敗） |

```bash
# テナント data/protocol/witness-pool.yaml
wire_governance_policy:
  warn_only: false
```

**確認:** `npm run steward -- --tenant mal protocol validate` · `protocol witness pending list`

---

## 4. Hub · gossip · reconcile

```bash
npm run demo:inter-org                    # mal ↔ southwood · 2 Hub · witness chain events
npm run steward -- hub verify --hub-url http://127.0.0.1:PORT --event-id UUID
npm run steward -- --tenant mal protocol witness reconcile --cross-hub
```

**gossip `skipped`:** 再 import は `skipped` カウントに含まれる · receipt の終状態は idempotent で正。

**trusted_hub pin:** `witness-pool.yaml` の各 Hub に `hub_public_key` を seed 例どおり固定。

---

## 5. 障害早見表

| コード | 意味 | 一次対応 |
|--------|------|----------|
| `witness-receipt-missing` | outbound tx に receipt なし | witness flush · Hub 到達 · warn_only 確認 |
| `witness-quorum-not-met` | k_of_n 未達 | 追加 Hub attestation · pool 設定 |
| `audit-bridge-failed` | operational → chain bridge 失敗 | bridge-errors.yaml · 署名/パス確認 |
| `protocol-event-scope-unknown` | registry に scope 未定義 | `steward/platform/protocol/registry.yaml` 更新 |

---

## 6. 受入チェック（ORG-C5）

- [ ] `npm test` ≥ 400 green
- [ ] `demo:standalone-org` · `demo:inter-org` exit 0
- [ ] `steward status --orgos` 加重 ≥ 85
- [ ] `modules check --all` · production_ready ≥ 23/26

*改定: 2026-06-26 · ORG-C5*
