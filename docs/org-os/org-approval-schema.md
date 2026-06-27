# Org Approval Schema（Phase 2 設計 · 根幹）

**Status:** normative for `schemas/org/` · **Parent:** [orgos-interface-spec.md](orgos-interface-spec.md) · [layer-mapping-steward-os.md](layer-mapping-steward-os.md)

## 1. 目的

**どの組織でも共通**の「人間承認 + 監査記録」根幹を Wire から独立させる。

| 層 | 責務 | パス |
|----|------|------|
| **Core** | EventEnvelope · `org.audit.attested` · 署名 | `schemas/protocol/` |
| **Org root** | pending approval · attestation · scope | `schemas/org/` · `src/lib/org/` |
| **National** | Tier 閾値 · `policy_ref` | `schemas/jurisdiction/wire-governance.ts` |
| **Wire adapter** | peer · transaction_type · outbox | `src/lib/protocol/notice-workflow.ts` |

Wire は Org root の **adapter** — 承認 SoT は `data/org/pending-approvals.yaml` のみ。

---

## 2. 境界 `@scope`

```typescript
orgActivityScopeSchema = "internal" | "wire"
```

| scope | 意味 | approve 後 |
|-------|------|------------|
| `internal` | 組織内決裁（規程改定 · capex · 内部契約等） | `org.audit.attested` → audit-chain · status `approved` |
| `wire` | 組織間 outbound | tier gate → `recordProtocolTransaction` → audit · status `completed` |

---

## 3. 識別子

| フィールド | 形式 | 備考 |
|-----------|------|------|
| `approval_id` | `APR-{YYYYMMDD}-{seq}` | 新規 universal ID |
| 互換 | `NOTICE-{YYYYMMDD}-{seq}` | 既存 wire データ · regex で両方許容 |

---

## 4. `OrgApprovalRequest`（pending SoT）

**正本:** `schemas/org/approval.ts`  
**Tenant SoT:** `tenants/{id}/data/org/pending-approvals.yaml`

### 4.1 共通フィールド

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:----:|------|
| `approval_id` | string | ✓ | §3 |
| `scope` | `internal \| wire` | ✓ | §2 |
| `status` | enum | ✓ | §5 |
| `proposed_at` | ISO8601 | ✓ | |
| `proposed_by` | string | ✓ | operator / secretary |
| `subject_type` | string | ✓ | 意味論ラベル（committee 拡張可） |
| `subject_ref` | string | | 契約 ID · REG ID · correlation 等 |
| `amount` | `{ value, currency }` | | tier 評価用 |
| `message` | string | | 人間可読摘要 |
| `approval_policy_ref` | string | | **default なし** — propose 時 jurisdiction 注入 |
| `approval_tier` | A \| B \| C | | approve 後 |
| `approver_id` | string | | |
| `co_approver_id` | string | | tier B |
| `approved_at` | ISO8601 | | |
| `rejected_at` | ISO8601 | | |
| `reject_reason` | string | | |
| `audit_event_id` | uuid | | `org.audit.attested` の event_id |

### 4.2 Wire 拡張 `wire`（scope=`wire` 時必須）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `peer_id` | `PEER-\d{3}` | |
| `transaction_type` | noticeWireType | Core committee payload への投影前 |
| `contract_id` | string | |
| `invoice_id` | string | |
| `broker_instruction` | string | |
| `stakeholder_id` | string | |
| `correlation_event_id` | uuid | |
| `transaction_id` | string | approve 後 |
| `wire_event_id` | uuid | outbox envelope event_id |

### 4.3 Internal `subject_type` 例（非 exhaustive）

| subject_type | subject_ref 例 |
|--------------|----------------|
| `regulation.amendment` | `REG-004` |
| `contract.internal` | `CTR-*` |
| `expenditure.capex` | 稟議番号 |
| `policy.exception` | 例外 ID |

---

## 5. `orgApprovalStatusSchema`

```
pending_approval → approved | rejected | completed
```

| status | internal | wire |
|--------|----------|------|
| `pending_approval` | 承認待ち | 承認待ち |
| `approved` | 決裁完了（監査 emitted） | （wire では使わない） |
| `rejected` | 却下 | 却下 |
| `completed` | — | 送信完了（旧 `transmitted`） |

**互換:** `PendingNotice.status = transmitted` ↔ `OrgApprovalRequest.status = completed`

---

## 6. Tier · Gate（Universal 型）

**正本:** `schemas/org/tier.ts` — `orgApprovalTierSchema` A/B/C

- Wire gate · internal gate **同一 National モジュール**（`jurisdiction/wire-governance/`）
- Core は tier **ラベルのみ** — 金額閾値は National

`wire-approval.ts` は deprecated alias → `org/tier.ts` を re-export。

---

## 7. `OperatorAttestation`（人間 attestation）

**正本:** `schemas/org/operator-attestation.ts`（protocol から移動 · re-export 維持）

| フィールド | 変更 |
|-----------|------|
| `approval_id` | **新規** — universal 参照 |
| `notice_id` | optional · wire 互換 |
| `approval_policy_ref` | optional · propose 時注入 |
| `approval_tier` | A/B/C |

---

## 8. `org.audit.attested` payload

**正本:** `schemas/org/audit-attestation.ts`

```typescript
orgAuditAttestationPayloadSchema = {
  scope: "internal" | "wire",
  kind: orgAuditAttestationKindSchema,
  approval_id: string,
  subject_type: string,
  subject_ref?: string,
  operator_attestation: OperatorAttestation,
  // wire-only refs (optional)
  transaction_id?: string,
  transaction_type?: string,
  wire_event_id?: string,
}
```

### 8.1 `kind` 一覧（Phase 2）

| kind | scope | 用途 |
|------|-------|------|
| `approval.granted` | internal · wire | **正規** — 承認決裁 |
| `approval.rejected` | internal · wire | 却下記録（Phase 2 optional emit） |
| `wire.approved` | wire | **deprecated alias** — 既存テスト互換 |

---

## 9. Registry YAML

```yaml
# tenants/{id}/data/org/pending-approvals.yaml
as_of: "2026-06-26"
approvals:
  - approval_id: APR-20260626-001
    scope: internal
    status: pending_approval
    proposed_at: "2026-06-26T00:00:00.000Z"
    proposed_by: secretary
    subject_type: regulation.amendment
    subject_ref: REG-004
    amount: { value: 500000, currency: JPY }
    approval_policy_ref: REG-004
    message: "稟議規程 改定案"
```

---

## 10. 移行

| 旧 | 新 |
|----|-----|
| `data/protocol/pending-notices.yaml` | 初回 load 時 `pending-approvals.yaml` へ migrate |
| `NOTICE-*` id | そのまま `approval_id` として保持 |
| `transmitted` | `completed` |
| `approval_policy_ref` default `REG-004` | **削除** — jurisdiction から注入 |

`PendingNotice` 型 · `listPendingNotices()` は wire adapter が **projection** として維持。

---

## 11. Runtime API（`src/lib/org/`）

| 関数 | 層 |
|------|-----|
| `proposeOrgApproval()` | Org root |
| `approveOrgApproval()` | Org root — gate + attestation + audit emit（internal） |
| `rejectOrgApproval()` | Org root |
| `listOrgApprovals()` | Org root |
| `emitOrgAuditAttested()` | Org root → protocol audit-chain |
| `proposeInterOrgWire()` | Wire adapter → `proposeOrgApproval({ scope: wire })` |
| `approveInterOrgNotice()` | Wire adapter → org approve + `recordProtocolTransaction` |

---

## 12. Phase 2 DoD

- [x] `schemas/org/` export · [org-approval-schema.md](org-approval-schema.md)
- [x] `data/org/pending-approvals.yaml` SoT
- [x] legacy `pending-notices.yaml` 自動 migrate
- [x] internal scope propose/approve library API
- [x] `wire.approved` + `approval.granted` emit
- [x] `approval_policy_ref` default 削除
- [x] 全テスト green

---

**版:** v1.0-phase2（2026-06-26）
