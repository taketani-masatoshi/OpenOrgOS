# OrgOS Interface Specification（草案 · ORG-C0-1）

**Status:** ORG-C0 プレースホルダ — 詳細は Phase ORG-C0 で拡充  
**Parent:** [orgos-completion-plan.md](orgos-completion-plan.md) · [layer-mapping-steward-os.md](layer-mapping-steward-os.md)

---

## 1. 目的

Organization Implementation · Adapter · Wire · Witness の **境界（I1–I3）** の入出力を固定し、単独 OrgOS と組織間通信が **同じデータ形式** を共有するための契約。

**用語:** [orgos-vocabulary.md](orgos-vocabulary.md) — OrgOS 四構成 · Wire vs Witness

---

## 2. 境界 I1 — Implementation ↔ Adapter

| 方向 | 形式 | 正本パス |
|------|------|----------|
| Implementation → Adapter | `tenant.yaml` · `modules.yaml` · REG bind | `tenants/{id}/` |
| Adapter → Implementation | jurisdiction pack · domain module manifest | `steward/jurisdiction-packs/` · `steward/modules/` |

**必須 manifest フィールド（C3 で enforce）:** `owner` · `repository` · `jurisdiction` · `capabilities[]`

---

## 3. 境界 I2 — Implementation ↔ Wire

| 操作 | 入口 | 出力 |
|------|------|------|
| **内部決裁** | `org approval`（library · Phase 2） | `org.audit.attested`（`kind: approval.granted` · `scope: internal`）→ audit-chain |
| Wire 起案 | `protocol notice draft` | `PendingNotice` projection · SoT `data/org/pending-approvals.yaml` |
| Wire 送信 | `protocol notice approve` | `EventEnvelope` → outbox + `approval.granted`（`scope: wire`）→ audit-chain |
| 検証 | `protocol validate` | exit code · issues[] |

**Schema 正本:** [org-approval-schema.md](org-approval-schema.md)

**不変条件:** approve 前に outbox へ載せない · Witness 失敗で Wire をロールバックしない。

---

## 4. 境界 I3 — Wire ↔ 外部

| 操作 | プロトコル | 正本 |
|------|------------|------|
| P2P 配送 | HTTP webhook · `protocol deliver` | [inter-org-operator-model.md](inter-org-operator-model.md) |
| 第三者証人 | Witness attestation / receipt | [witness-hub-requirements.md](witness-hub-requirements.md) |
| Peer 定義 | `peers.yaml` · identity export | `data/protocol/` |

---

## 5. 共有データ形式（C3 統一対象）

| 形式 | スキーマ | 単独 Org | Wire |
|------|----------|:--------:|:----:|
| EventEnvelope | `schemas/protocol/org-event.ts` | audit 内部 | outbox/inbox |
| audit-chain | `data/protocol/audit-chain.jsonl` | SoT | + witness 参照 |
| audit bridge | `data/org/audit-bridge.yaml` | operational → chain mirror | N/A |
| org approvals | `data/org/pending-approvals.yaml` | SoT | wire projection |
| classification | `data/classification-registry.yaml` | 全層 | envelope に L2 載せ禁止 |
| 署名 | Ed25519 · canonical JSON | 内部 event | attestation |

---

## 6. CLI（S1 実装済み）

| コマンド | 用途 |
|----------|------|
| `steward protocol validate [--standalone]` | 台帳 · audit · peer/witness 整合 |
| `steward protocol audit verify` | audit-chain 検証 |
| `npm run demo:standalone-org` | 単独 Org デモ（identity · delegation · validate） |
| `npm run demo:inter-org` | 2-org + Witness デモ |
| `npm run demo:resilience` | Resilience R1–R4 + Org C trust PKI デモ |
| `steward protocol relay run` | Wire/witness 自動 flush + reconcile daemon |
| `steward protocol witness trust publish` | Org C 署名 trust bundle 公開 |
| `steward protocol sla --tier silver` | 取引 SLA tier 検証 |
| `steward org audit bridge [--enable]` | operational audit.jsonl → audit-chain バックフィル |
| `steward protocol verify audit-chain` | 第三者向け audit-chain + envelope digest 検証 |
| `steward protocol verify delegation --file` | DelegationProof 構造・有効期限検証 |

**`--standalone` 条件:** `peers.yaml` 空または未作成 · `witness-pool.yaml` で `enabled: false` または `hubs: []`

**内部 envelope（S2）:** `approveInterOrgNotice` 成功時に `org.audit.attested`（`kind: approval.granted` · `scope: wire`）を audit-chain に追加 — [`audit-emit.ts`](../../src/lib/org/audit-emit.ts)

---

## 7. 拡充予定（ORG-C3 以降）

- [x] `@scope internal | wire` — `schemas/org/scope.ts` · [org-approval-schema.md](org-approval-schema.md)
- [ ] manifest check enforce（I1）
- [ ] Community ↔ Steward 語彙表（ORG-C4-3）
- [x] 運用 `audit.jsonl` → audit-chain bridge（`data/org/audit-bridge.yaml` · P1）

---

**版:** v0.2-p1（2026-06）
