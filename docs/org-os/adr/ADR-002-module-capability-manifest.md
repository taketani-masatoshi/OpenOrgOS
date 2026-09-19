# ADR-002: モジュール Capability マニフェスト（Manifest v2）

**Status:** Proposed  
**Date:** 2026-07-12  
**Deciders:** OpenOrgOS Core / OrgOS フレームワークチーム  
**Related:** ADR-001 · [module-security-review-2026-07-12.md](../module-security-review-2026-07-12.md)

## Context

現行 `module.manifest.yaml`（`moduleManifestSchema` in `src/lib/modules.ts`）は seed / regulation メタデータのみを持ち、**permissions · network · limits · ai** フィールドがない。

`steward/modules/module_contract.md` も同様で、モジュールの実行時 Capability を宣言しない。

OpenOrgOS 方針 §7.1 では、未宣言権限は付与しないマニフェストが必須とされる。

## Decision

### 1. Manifest v2 構造

既存 v1 フィールドは維持し、以下を **optional → Phase 2 で required** として追加する:

```yaml
module:
  id: com.example.invoice
  name: Invoice Module
  version: 0.1.0
  publisher: openorgos
  runtime: wasi          # internal | wasi | container
  trust_tier: internal   # internal | invited | reviewed | managed

permissions:
  storage:
    own: read_write      # 専用ストレージのみ
  events:
    subscribe: []
    publish: []
  core_api: []           # vendor.read_basic 等
  network:
    outbound: []         # 空 = deny-default
  secrets: []            # 名前のみ — 値は install 時注入

limits:
  memory_mb: 256
  cpu_seconds: 30
  timeout_seconds: 60
  concurrent_jobs: 2

ai:
  can_observe: true
  can_analyze: true
  can_draft: true
  can_propose: false
  can_approve: false
  can_execute: false
```

### 2. ゼロデフォルト原則

- マニフェストに **明示されていない** `core_api` · `network.outbound` · `events.publish` は **deny**
- `runtime: wasi|container` 以外は Phase 2 以降、**`trust_tier: internal` のみ** 許可（ADR-001）
- `ai.can_approve` / `ai.can_execute` は Phase 3 まで **常に false**（第三者モジュール）

### 3. インストール時承認

- 初回 install / 権限追加時は `org approval` または Console 承認フローで **Capability 一覧を人間が承認**
- バージョン更新で permissions が拡張された場合は **自動更新せず再承認**

### 4. スキーマ配置

- 正本: `schemas/modules/manifest-v2.ts`（新規 · PR-1）
- 読取: `loadModuleManifest()` を v1/v2 両対応に拡張（後方互換）
- 検証: `orgos modules check` + `orgos validate --security`

### 5. Core API 名の名前空間

```
{domain}.{verb}[_{detail}]

例:
  vendor.read_basic
  payment.propose
  payment.execute   # 一般モジュールには付与しない
```

Gateway（ADR-001 実装群）が名前空間を正本とし、マニフェストはそのサブセットを宣言する。

## Consequences

### Positive

- Marketplace 表示で「何が許可されるか」を利用者が判断できる
- Policy Engine の入力が決定論的になる
- 監査ログに `requested_capability` を記録できる

### Negative

- 既存 21+ モジュールへの manifest 追記が必要（Phase 1 は `trust_tier: internal` のみで可）
- `core_api` 一覧の設計・バージョニングに継続的メンテが必要

## Alternatives considered

| 案 | 却下理由 |
|----|---------|
| README に権限を書く | 機械可読でない · validate 不可 |
| コード静的解析のみ | 動的 import / eval を捕捉困難 |
| 全権限デフォルト許可 | 方針 §5「信用しない構造」に反する |

## Implementation notes

- PR-1: schema + example manifest for `travel_booking`
- PR-4/5: Gateway が manifest `core_api` を enforce
- 既存 `module_contract.md` は PR-1 マージ後に v2 セクション追記（別 PR）
