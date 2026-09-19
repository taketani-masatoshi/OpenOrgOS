# ADR-001: モジュール実行の信頼境界と段階開放

**Status:** Proposed  
**Date:** 2026-07-12  
**Deciders:** OpenOrgOS Core / OrgOS フレームワークチーム  
**Related:** [module-security-review-2026-07-12.md](../module-security-review-2026-07-12.md)

## Context

OrgOS 業務モジュールは `steward/modules/{id}/cli/register.ts` を `src/lib/module-cli.ts` へ **静的 import** し、Core CLI と **同一 Node プロセス** で実行している。

2026-07-12 時点のセキュリティレビューで以下が確認された:

- 第三者向け Marketplace / 動的インストール機構は **未実装**
- しかしモジュールコードはホスト FS · env · network に **実質無制限** アクセス可能
- WASI / コンテナ / Capability / Relay Agent / Policy Engine / Egress Proxy は **未整備**
- `resolveTenantPath` のフォールスルーはパストラバーサルリスクを残す

OpenOrgOS 方針（§5–§8）では「モジュールを信用しない構造」と「Phase 1 Internal からの段階開放」が要求される。

## Decision

### 1. 実行モデル

**第三者モジュールを Core と同一プロセスで直接 import しない。**

- 現行の `MODULE_CLI_BUNDLES` 静的バンドルは **Phase 1（Internal）限定の暫定措置** と位置づける
- Phase 2 以降は Module Runtime（WASI または rootless container + capability）経由に移行する
- 移行期間中は既存バンドルを **Gateway RPC クライアントの shim** として残し、破壊的変更を避ける

### 2. 段階開放（trust tier）

| Phase | trust_tier | 実行許可 | 配布 |
|-------|------------|---------|------|
| 1 | `internal` | OOO 運営リポジトリ merge のみ | カタログ同梱 |
| 2 | `invited` | テスト環境 · 手動審査 · ソース提出必須 | 限定招待 |
| 3 | `reviewed` | 署名成果物 · 自動検査 · サンドボックス | Marketplace Security Reviewed |
| 4 | `managed` | SLA · エスクロー · 更新追随契約 | Marketplace OOO Managed |

**`third_party_execution_allowed` は Phase 3 完了まで `false` を正本とする。**

### 3. Marketplace のゲート

以下が揃うまで **Marketplace の決済・一般公開インストール UI を実装しない**:

- Manifest v2（permissions / network / limits）
- Module Identity + install 単位 ID
- Core API Gateway（read / propose / execute 分離）
- Relay Agent
- Policy Engine（決定論的判定）
- Egress Proxy（deny-default）
- モジュール監査（改ざん不能）
- 緊急停止

### 4. 暫定ガード（Phase 0→1）

`src/lib/module-trust-policy.ts` を正本とし:

- `modules.yaml` に `trust_tier` / 外部 `artifact_url` 等の Marketplace フィールドが出現した場合 **validate 失敗**
- 環境変数 `ORGOS_ALLOW_THIRD_PARTY_MODULES=1` は **開発実験のみ**（本番 `orgos doctor` で拒否予定）

## Consequences

### Positive

- Marketplace 先行による「同一権限実行」の事故を防げる
- 既存テナントの `modules.yaml` バインドモデルは維持できる
- Wire Gateway / Operator RBAC 等の既存投資を Gateway / Policy に再利用できる

### Negative

- Phase 3 まで第三者モジュールの収益化経路は限定される
- 静的 `MODULE_CLI_BUNDLES` の shim 期間が長くなるとメンテ負荷増
- WASI 非対応モジュールは container フォールバックが必要

### Risks accepted (Phase 1)

- OOO 自社モジュールも同一プロセスのまま — **Git レビューが唯一のゲート**
- LLM active_context はポリシー依存 — ランタイム強制は別 ADR（Operator 層）

## Alternatives considered

| 案 | 却下理由 |
|----|---------|
| 現状維持（ドキュメントのみ） | merge=本番が明示されず Marketplace 誤着手リスク |
| 即座に全モジュール WASM 化 | 工数大 · 既存 TypeScript CLI 資産との互換 |
| Marketplace を先に UI のみ | 安全境界なしで「ダウンロードサイト」化 |

## Implementation notes

- 正本コード: `src/lib/module-trust-policy.ts`
- validate 連携: `src/lib/security-validate.ts`
- 次 PR: Manifest v2 schema（ADR-002）
