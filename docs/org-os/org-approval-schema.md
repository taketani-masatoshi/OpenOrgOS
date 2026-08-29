# Org Approval Schema（Phase 2 設計 · 根幹）

**Status:** normative for `schemas/org/` · **Parent:** [orgos-interface-spec.md](orgos-interface-spec.md) · [layer-mapping-steward-os.md](layer-mapping-steward-os.md)

## 1. 目的

**どの組織でも共通**の「人間承認 + 監査記録」根幹を Wire から独立させる。

| 層 | 責務 | パス |
|----|------|------|
| **Core** | EventEnvelope · `org.audit.attested` · 署名 | `schemas/protocol/` |
| **Org root** | pending approval · attestation · scope | `schemas/org/` · `src/lib/org/` |
| **National** | Tier 閾値 · `policy_ref` | `schemas/jurisdiction/wire-governance.ts` |
| **Wire adapter** | peer · transaction_type · outbox | `src/lib/wire/` |

Wire は Org root の **adapter** — 承認 SoT は `data/org/pending-approvals.yaml` のみ。

### 1.1 HumanApprovalContext（ADR 0038）

最終承認はすべて **人間入口が発行するセレモニーオブジェクト** を要する。

| 項目 | 内容 |
|------|------|
| 発行元 | `chat_ui` · `wire_ui` · `cli` のみ（LLM / MCP は発行不可） |
| 中身 | HMAC · nonce · 5 分 TTL · `operator_id` · `subject_digest` · 単回消費 |
| 追加ゲート | Tier B/C は ADR 0037 settlement PassKey を **追加**で要求 |
| 秘密 | `ORGOS_HUMAN_APPROVAL_SECRET`（本番 · doctor / prod-checklist） |
| ヘルパ | `humanApproveOrgApproval` · `schemas/org/human-approval-context.ts` |

自己承認禁止。レジストリ上の active operator のみ。

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
| `tenant.config` | `CFG-*`（modules/standards の enabled 変更 · ADR 0036） |

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
| `settlement_credential_id` | optional · ADR 0037 tier B/C step-up |
| `settlement_challenge_id` | optional · ADR 0037 |
| `settlement_rp_id` | optional · ADR 0037（例: `approve.oorgos.org`） |

**Assurance:** jurisdiction tier **B/C**（金額帯）はセッション承認不可 — settlement PassKey（iPhone + QR）必須。tier **A** と金額なし subject は Chat セッションで可。[ADR 0037](../adr/0037-dual-passkey-settlement-stepup.md)

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
| `approval.rejected` | internal · wire | 却下記録 |
| `wire.approved` | wire | **deprecated** — 新規 emit 禁止 |

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
- [x] `approval.granted` / `approval.rejected` emit（wire は `scope: wire`）
- [x] `wire.approved` 新規 emit 廃止 · legacy chain のみ許容
- [x] `approval_policy_ref` default 削除
- [x] 全テスト green

---

## 13. P0 DoD（根幹分離）

- [x] `notice-workflow` → `src/lib/wire/`（`protocol/` から除去）
- [x] `approval-gate` → `src/lib/org/approval-gate.ts`（`loadContract` なし · pure tier gate）
- [x] `rejectOrgApproval` → `approval.rejected` を audit-chain に emit
- [x] wire 完了時 audit → `approval.granted` + `scope: wire`（`wire.approved` 新規 emit 廃止）
- [x] 全テスト green（375）

---

## 14. P1 DoD（監査・運用）

- [x] `audit-bridge.yaml` 方針固定 — `steward/platform/org/audit-bridge.yaml.example` · テナント雛形
- [x] 全 operational audit 種別 bridge（`events: []` = 5 種すべて）
- [x] queue → audit 種別マッピング（dispatch → `route_dispatch` · work_order → `handoff` 等）
- [x] `recordProtocolTransaction` — audit-chain のみ · `audit.jsonl` 二重書き廃止
- [x] `mapAuditEventToOrgPayload` — `operational.recorded` 形式に統一

---

**版:** v1.2-p1（2026-06-26）

---

## 15. P2 DoD（Core 純化）

- [x] `identity.ts` → `src/lib/org/identity-profile.ts`（tenant adapter · company.yaml 直結除去）
- [x] `AGENT_SCOPE_MAP` → `steward/platform/protocol/agent-delegation-scopes.yaml` + `org/delegation-scopes.ts`
- [x] wire-governance YAML 法域分割 + `registry.yaml` sha256 pin
- [x] 外部 verifier — `protocol verify audit-chain` · `protocol verify delegation` · `protocol audit verify --with-envelopes`

---

**版:** v1.3-p2（2026-06-26）

---

## 16. 命名方針（P3）

| 文脈 | 正しい用語 | 例 |
|------|-----------|-----|
| Core / CLI / JSON キー | **wire-governance** | `wire_governance_policy` · `wire_governance_witness` |
| 法域 pack の regulation ID | **policy_ref**（データ値） | JP: `REG-004` · US: `REG-US-004` |
| 非推奨（読込のみ） | `reg004_policy` · `reg004_witness` | YAML preprocess · 新規 emit 禁止 |

根幹コードに **REG-004 を識別子として埋め込まない**。規程 ID は jurisdiction pack の `policy_ref` フィールドにのみ存在する。

---

## 17. P3 DoD（命名掃除）

- [x] CLI help — wire-governance 表記（`notice` · `approvers` · `delegation --basis-ref`）
- [x] `validate.ts` — `evaluateWitnessWireGovernancePolicy` に統一
- [x] JSON emit — `wire_governance_witness` のみ（`reg004_witness` 廃止）
- [x] witness pool — `wire_governance_policy` 正規 · `reg004_policy` 読込互換
- [x] `layer-mapping` · operator-model · skill 同期
- [x] 全テスト green

---

**版:** v1.4-p3（2026-06-26）

---

## 18. P4 DoD（監査統合 · 署名 · 契約 · 掃除）

| ギャップ | 対処 |
|---------|------|
| **C1** 監査 SoT | audit-bridge デフォルト有効 · `audit-bridge-state.yaml` 冪等 · queue→chain 連携（P1 bridge 継続） |
| **C2** 署名 | `buildDelegationEnvelope` → `maybeSignEnvelope` · `verifyDelegationProofExternal` grantor 鍵 binding |
| **C3** tenant adapter | `schemas/org/tenant-adapters.ts` · `src/lib/org/tenant-data.ts` 唯一入口 |
| **C4** deprecated | `assertWireApproval` · `evaluateWitnessReg004Policy` alias 削除 |
| **C5** Core 外 | Transport · Federation · Witness 本番運用は参照実装止まり — `validateProtocolState` で audit-bridge 無効 warning |

- [x] `schemas/org/` — `audit-bridge-state` · `tenant-adapters` export
- [x] `authorized-approvers.ts` — company.yaml 直読を tenant-data 経由に集約
- [x] bridge 冪等テスト · audit.test 副作用 cleanup
- [x] delegation envelope 署名検証テスト
- [x] 全テスト green

---

**版:** v1.5-p4（2026-06-26）

---

## 19. P5 DoD（監査運用 · tenant adapter 拡張）

### 19.1 監査 SoT 方針

| 系統 | 正本 | 用途 |
|------|------|------|
| **Operational** | `docs/reports/audit-log/audit.jsonl` | 秘書 · queue · handoff 等の運用記録 |
| **Protocol chain** | `data/protocol/audit-chain.jsonl` | 署名 EventEnvelope · wire 証拠 · 外部 verify |
| **Bridge** | `data/org/audit-bridge.yaml` + `audit-bridge-state.yaml` | operational → chain **mirror**（冪等 · 失敗は `audit-bridge-errors.yaml`） |

Org 決裁（`approval.granted` / `approval.rejected`）と wire 完了 audit は **直接 chain に emit**。bridge は operational 種別のみ。

### 19.2 P5 チェックリスト

- [x] `loadOrgCompanyBilling` / `loadOrgCompanyReport` — invoice · report 経由
- [x] `audit-bridge-state` — `max_bridged_ids` ローテーション
- [x] bridge 失敗 — `audit-bridge-errors.yaml` · `protocol validate` warning
- [x] legacy doc — `pending-approvals.yaml` 表記統一

---

**版:** v1.6-p5（2026-06-26）
