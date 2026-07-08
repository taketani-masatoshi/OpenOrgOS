# Gov Gateway Adapters — 国家間通信規格ラッパー

**Status:** 合意草案 · Phase 1–2 P0 実装完了 · 2026-07-08  
**Parent:** [orgos-interface-spec.md](orgos-interface-spec.md) · [openorgos-core-philosophy.md](openorgos-core-philosophy.md)  
**実装正本:** [gov-gateway-adapter-spec.md](gov-gateway-adapter-spec.md)  
**Schema:** [`schemas/protocol/gov-gateway-adapter.ts`](../../schemas/protocol/gov-gateway-adapter.ts) · [`gov-gateway-profile.ts`](../../schemas/protocol/gov-gateway-profile.ts)  
**Code:** [`src/lib/wire/gov-gateway/`](../../src/lib/wire/gov-gateway/)  
**Registry:** [`steward/platform/protocol/gov-gateway-adapters.yaml`](../../steward/platform/protocol/gov-gateway-adapters.yaml)  
**Survey:** [gov-gateway-adapters-survey.md](gov-gateway-adapters-survey.md) — Hub 国 + 主要 8 国 + AF pool 調査  
**Memos:** [memos/README.md](memos/README.md) — 国別通信規格メモ

---

## 1. 目的

OpenOrgOS の **Wire**（正本: `EventEnvelope`）を、各国の政府間・行政間通信規格で **ラップ（encode/decode + transport）** できるようにする。

| 区分 | 国・地域 | 規格（ラップ対象） | Adapter profile |
|------|----------|-------------------|-----------------|
| **P0 草案** | エストニア | **X-Road** | `xroad_v7` |
| | 日本 | **e-Gov** · LGWAN · Gビズ | `jp_*` |
| | ジョージア | **Government Gateway 3G** | `ge_gov_gateway_3g` |
| **Hub §7.B** | UAE · IE · TR · US · CL · NZ | 各国標準（調査書 §3） | `ae_*` · `ie_psb_api` · `tr_edevelop` · `us_*` · `cl_*` · `nz_api_standard` |
| **Hub §7.C** | EG · DJ · ZA | Digital Egypt · **X-Road** · SITA MIOS | `eg_*` · `xroad_v7_dj` · `za_sita_mios` |
| **主要国** | CN · HK · SG · AU · EU · RU · IN | GB/T 45800 · iAM Smart · APEX · api.gov.au · AS4 · SMEV · API Setu | 調査書 §4 |

詳細・参考リンク・優先度は **[gov-gateway-adapters-survey.md](gov-gateway-adapters-survey.md)** を正とする。

**Hub / Witness は置き換えない。** 国家ゲートウェイは **Wire の輸送・メッセージプロファイル層（I3-b）**。digest 証明が必要なら従来どおり **Hub** へ fan-out する。

---

## 2. 境界（I3-b）

```
Org A Implementation
    │  EventEnvelope（OpenOrgOS Wire 正本）
    ▼
GovGatewayAdapter          ← 本書 · encode/decode · identity map
    │  X-Road / e-Gov / 3G メッセージ
    ▼
国家インフラ（SS · API ゲートウェイ · 3G）
    │
    ▼
Org B（相手方）←→ GovGatewayAdapter（decode）
```

| 境界 | 正本 | ラッパーがやること |
|------|------|-------------------|
| **I2** Implementation ↔ Wire | `EventEnvelope` · `pending-approvals` | **触らない** |
| **I3-a** Wire ↔ OrgOS P2P | `protocol deliver` · webhook | オプション併用 |
| **I3-b** Wire ↔ 国家ゲートウェイ | `gov-gateway.yaml` · adapter profile | **encode · transport · decode** |
| **I3-c** Wire ↔ Hub | `witness-attestation` | **併用可**（`witness_mode: orgos_hub`） |

**不変条件（orgos-interface-spec 継承）:**

1. approve 前に outbox へ載せない  
2. 国家ゲートウェイ失敗で Wire 承認をロールバックしない  
3. Hub / 国家ゲートウェイは **editor ではない** — append-only · digest 一致検証  
4. OpenOrgOS 正本は常に `EventEnvelope` — 国家形式は **輸送用ビュー**

---

## 3. Adapter 契約

### 3.1 インターフェース（論理）

```typescript
// src/lib/wire/gov-gateway/types.ts — 実装は段階的
interface GovGatewayAdapter {
  profile_id: string;
  encode(envelope: EventEnvelope, ctx: EncodeContext): Promise<NativeMessage>;
  decode(native: NativeMessage, ctx: DecodeContext): Promise<EventEnvelope>;
  deliver(native: NativeMessage, target: GatewayTarget): Promise<DeliveryReceipt>;
  health(): Promise<AdapterHealth>;
}
```

| 操作 | 入力 | 出力 |
|------|------|------|
| **encode** | `EventEnvelope` | 国家形式 XML/JSON + 輸送メタ |
| **decode** | 国家形式応答 | `EventEnvelope`（または `IngestResult`） |
| **deliver** | `NativeMessage` | `message_id` · `correlation_id` · HTTP/SOAP ステータス |
| **health** | — | SS / API ゲートウェイ到達性 |

### 3.2 テナント設定

**パス:** `tenants/{id}/data/protocol/gov-gateway.yaml`

```yaml
enabled: true
default_profile: xroad_v7
witness_mode: orgos_hub   # native | orgos_hub | both
profiles:
  - profile_id: xroad_v7
    adapter_ref: steward/jurisdiction-packs/EE/protocol/xroad-adapter.profile.yaml
    member_code: EE/ORG/OPENORGOS
    subsystem_code: wire
    security_server_url: https://ss.example.ee
  - profile_id: jp_egov_central
    adapter_ref: steward/jurisdiction-packs/JP/protocol/egov-adapter.profile.yaml
    # 府省 API 登録情報 · 接続先は運用で注入
```

**peer 側:** `peers.yaml` の `endpoints[]` に `transport: gov_gateway` と `profile_id` を指定可能（[peer-endpoint 拡張](#7-peer-拡張)）。

---

## 4. プロファイル別マッピング

### 4.1 エストニア X-Road（`xroad_v7`）

**参照:** [X-Road Architecture](https://x-road.global/x-road-architecture/) · Security Server REST/SOAP

| OpenOrgOS | X-Road |
|-----------|--------|
| `origin.org_id` | `memberCode` / `subsystemCode` |
| `event_id` | `requestId`（ヘッダ）· `Message-ID` |
| `envelope` 全文（canonical JSON） | SOAP body / REST payload · または `application/vnd.openorgos.envelope+json` |
| `envelope_digest` | 別途 Hub attestation（推奨） |
| `correlation_id` | `correlationId` |

```yaml
# steward/jurisdiction-packs/EE/protocol/xroad-adapter.profile.yaml
transport: xroad_v7
message_format:
  primary: application/vnd.openorgos.envelope+json
  fallback: application/json
security:
  tls_mutual: true
  signer: security_server
headers:
  - X-Road-Client
  - X-Road-Service
  - X-Request-Id
```

**運用:** タリン Hub（`HUB-EU-EE`）と **同一法域** で substance を揃える。X-Road は **行政・登記・税** との B2G；Org 間 B2B は `EventEnvelope` プロファイルで SS 経由配送。

### 4.2 日本 e-Gov 系（`jp_*`）

日本は **単一ゲートウェイ名ではなく複数プロファイル** に分割する。

| profile_id | 用途 | 規格・接続 |
|------------|------|-----------|
| `jp_egov_central` | 中央府省 API · 電子申請連携 | e-Gov インフラ · 府省 API 仕様 · セキュリティ評価基準 |
| `jp_lgwan` | 地方公共団体・自治体向け | **LGWAN** 経由 · 閉域接続 |
| `jp_gbiz` | 法人番号 · 公的照会 | **Gビズ** / 法人番号公表サイト API |

| OpenOrgOS | 日本側 |
|-----------|--------|
| `EventEnvelope` | 府省定義 JSON/XML（申請・届出スキーマ）· または OpenOrgOS 拡張 MIME |
| `identity.org_uri` | 法人番号 · 届出識別子 · LGWAN 組織 ID |
| 署名 | **GPKI / JPKI** · 電子署名（アダプタが変換） |
| 監査 | 申請受付番号 · 到達確認 ID → `correlation_id` |

```yaml
# steward/jurisdiction-packs/JP/protocol/egov-adapter.profile.yaml
profiles:
  - id: jp_egov_central
    transport: https_rest
    auth: [gpki, api_key]
    envelope_mapping: openorgos_to_ministry_schema
  - id: jp_lgwan
    transport: lgwan_vpn
    notes: 閉域 — Hub とは別経路 · 東京 Hub は APAC Witness のみ
  - id: jp_gbiz
    transport: https_rest
    services: [corporate_number_lookup]
```

**東京 Hub:** 国内寄付窓口・APAC Witness。**e-Gov 接続の substance** はプロファイルごとに法人・届出単位で持つ（LGWAN は自治体パックで上書き可）。

### 4.3 ジョージア Government Gateway 3G（`ge_gov_gateway_3g`）

**参照:** DGA（旧 DEA）· **Georgian Government Gateway（3G）** — 官民データ交換・デジタル署名基盤

| OpenOrgOS | 3G |
|-----------|-----|
| `EventEnvelope` | 3G 相互運用メッセージ（JSON/XML · サービス ID） |
| `origin` / `destination` | MDA / 私部門参加者 ID |
| 署名 | ジョージア **デジタル署名インフラ** |
| 監査 | 3G `transaction_id` → `correlation_id` |

```yaml
# steward/jurisdiction-packs/GE/protocol/georgia-3g-adapter.profile.yaml
transport: ge_gov_gateway_3g
authority: DGA
gateway: Georgia_Government_Gateway_3G
message_format:
  primary: application/vnd.openorgos.envelope+json
  fallback: application/json
```

**Hub 計画との関係:** ジョージア国内 Hub 未配置時も **3G アダプタ** で行政連携可能。将来 Hub を置く場合は `witness_mode: both`。

---

## 5. Witness / Hub との併用

| `witness_mode` | 動作 |
|----------------|------|
| `orgos_hub`（推奨） | 国家ゲートウェイ配送 **後** に `envelope_digest` を Hub pool へ fan-out |
| `native` | 国家側監査ログのみ（3G / X-Road ログ ID を `audit-chain` に記録） |
| `both` | Hub receipt + 国家 `transaction_id` の二重証跡 |

```yaml
# gov-gateway.yaml 例
witness_mode: orgos_hub
hub_pool_ref: tenants/{id}/data/protocol/witness-pool.yaml
audit_bridge:
  map_native_id_to: correlation_id
  append_to: data/protocol/audit-chain.jsonl
```

---

## 6. ディレクトリ構成

```
schemas/protocol/
  gov-gateway-adapter.ts          # Zod 正本

steward/platform/protocol/
  gov-gateway-adapters.yaml       # 全 profile 索引

steward/jurisdiction-packs/
  EE/protocol/xroad-adapter.profile.yaml
  JP/protocol/egov-adapter.profile.yaml
  GE/protocol/georgia-3g-adapter.profile.yaml

src/lib/wire/gov-gateway/
  types.ts                        # Adapter インターフェース（stub）
  README.md                       # 実装ロードマップ

tenants/{id}/data/protocol/
  gov-gateway.yaml                # テナント有効化・接続先
```

---

## 7. peer 拡張

`peer-endpoint` に輸送種別を追加（スキーマ `gov-gateway-adapter.ts` 参照）:

```yaml
# peers.yaml 例
peers:
  - org_id: partner-ee
    endpoints:
      - url: https://ss.partner.ee/xroad
        mode: push
        transport: gov_gateway
        gov_gateway:
          profile_id: xroad_v7
          service_code: partner/wire/notice
```

---

## 8. CLI（計画 · ORG-C4）

| コマンド | 用途 |
|----------|------|
| `orgos protocol gov-gateway validate` | `gov-gateway.yaml` · profile 参照検証 |
| `orgos protocol gov-gateway health` | SS / API 到達性 |
| `orgos protocol gov-gateway encode --event-id` | デバッグ用 · 国家形式ダンプ |
| `orgos protocol deliver --transport gov_gateway` | Wire 配送時にアダプタ経由 |

---

## 9. 実装ロードマップ

| Phase | 内容 |
|-------|------|
| **P0（本コミット）** | 仕様 · Zod · profile YAML · registry |
| **P1** | `encode`/`decode` スタブ · `validate` CLI |
| **P2** | X-Road v7 REST 実装（EE パック） |
| **P3** | JP `jp_gbiz` + `jp_egov_central` パイロット |
| **P4** | Georgia 3G · Hub `witness_mode: both` |

---

## 10. 関連文書

| 文書 | 内容 |
|------|------|
| [witness-hub-governance.md](witness-hub-governance.md) | Hub 配置 · タリン Treasury |
| [orgos-vocabulary.md](orgos-vocabulary.md) | Wire · Hub · Witness 用語 |
| [jurisdiction-pack-contract.md](jurisdiction-pack-contract.md) | 法域 pack に protocol/ を追加 |

---

## 11. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-07 | 初版 — X-Road · e-Gov · Georgia 3G ラッパー構成 |
