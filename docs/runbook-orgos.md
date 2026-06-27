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

## 7. deliver-pull · mesh deliver

```bash
npm run demo:deliver-pull          # southwood outbox API → mal inbox (FR-EM-07 pull)
npm run demo:mesh-deliver          # 2-hop mesh: PEER-002 relay → PEER-003 push → inbox
npm run steward -- --tenant mal protocol mesh deliver --peer PEER-003 --file docs/protocol/outbox/ENVELOPE.json
```

**mesh routes:** `data/protocol/mesh-routes.yaml` — `via` チェーンで多ホップ配送。Hub gossip（Witness）とは別 — Org Event peer mesh。

---

## 8. 鍵ローテーション後チェックリスト（P4）

```bash
# 1. ローテーション + meta 更新
npm run steward -- --tenant mal protocol signing rotate

# 2. 新公開鍵の確認
npm run steward -- --tenant mal protocol signing export-public

# 3. 各 peer の protocol_public_key を再 pin
npm run steward -- --tenant mal protocol peer register --peer-id PEER-002 --public-key BASE64...

# 4. validate — stale pin は warning signing-key-peer-pin-stale
npm run steward -- --tenant mal protocol validate
```

**据置（v2）:** 自動 peer への鍵配布 · 定期ローテーション — [c4-community-backlog.md](org-os/c4-community-backlog.md) 外。

---

## 9. peer discover --suggest

```bash
npm run steward -- --tenant mal protocol peer discover --suggest
npm run steward -- --tenant mal protocol peer discover --suggest --json
```

未登録 trusted-hub / org_uri 向けに `protocol peer register` コマンド例を出力。

---

## 10. 受入チェック（ORG-C5）

- [ ] `npm test` ≥ 460 green
- [ ] `demo:standalone-org` · `demo:inter-org` · `demo:deliver-pull` · `demo:mesh-deliver` exit 0
- [ ] `steward status --orgos` 加重 ≥ 86
- [ ] `modules check --all` · production_ready ≥ 24/27

*改定: 2026-06-27 · ORG-C5 · mesh v1 · signing checklist*
