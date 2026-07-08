# Gov Gateway Adapter — 実装仕様（正本）

**Status:** 実装正本 · 2026-07-07  
**Parent:** [gov-gateway-adapters.md](gov-gateway-adapters.md) · [memos/00-wire-buffer-layer.md](memos/00-wire-buffer-layer.md)  
**Schema:** [`schemas/protocol/gov-gateway-profile.ts`](../../schemas/protocol/gov-gateway-profile.ts)  
**Code:** [`src/lib/wire/gov-gateway/`](../../src/lib/wire/gov-gateway/)

> 税務・法務助言ではない。

---

## 1. 目的

OpenOrgOS **Wire**（`EventEnvelope` 正本）と各国政府系通信規格の間に **I3-b 緩衝層** を置く。Org 実装は approve/outbox まで同一 · 国家形式差は **GovGatewayAdapter** が吸収する。

---

## 2. 不変条件

1. **正本は常に `EventEnvelope`** — 国家形式は輸送用ビュー  
2. **approve は国家配送の前** — outbox 署名後に deliver  
3. **国家 GW deliver 失敗で Wire 承認をロールバックしない** — `wire-pending` 再送  
4. **Hub / 国家 GW は editor ではない** — append-only · digest 検証  
5. **decode 失敗は ingest を拒否** — `IngestResult.ok: false` · Wire 正本は書き換えない  

---

## 3. Adapter 契約

```typescript
interface GovGatewayAdapter {
  readonly profile_id: GovGatewayProfileId;
  encode(envelope: EventEnvelope, ctx: EncodeContext): Promise<NativeMessage>;
  decode(native: NativeMessage, ctx: DecodeContext): Promise<EventEnvelope>;
  deliver(native: NativeMessage, target: GatewayTarget): Promise<DeliveryReceipt>;
  health(): Promise<AdapterHealth>;
}
```

### 3.1 NativeMessage

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `profile_id` | enum | adapter 識別 |
| `mime` | string | 本文 MIME（正: `application/vnd.openorgos.envelope+json`） |
| `body` | string \| Uint8Array | 国家形式 payload |
| `headers` | Record | HTTP/SOAP 輸送ヘッダ |
| `correlation_id` | string? | 国家側相関 ID |
| `transport_style` | `rest` \| `soap`? | X-Road 等 |
| `native_message_id` | string? | 国家側 message / request ID |

### 3.2 OpenOrgOS MIME

`application/vnd.openorgos.envelope+json` = [`canonicalJson(envelope)`](../../src/lib/protocol/canonical.ts)（署名フィールド含む JSON · キー sorted）

---

## 4. P0 プロファイル — encode/decode マッピング

| フィールド | X-Road v7 | e-Gov central | Georgia 3G |
|-----------|-----------|---------------|------------|
| `event_id` | `X-Request-Id` header | 受付番号（応答時 · audit bridge） | `transaction_id`（応答） |
| `correlation_id` | header / body meta | 到達確認 ID | gateway transaction_id |
| body | REST POST body = OpenOrgOS MIME | REST POST body = OpenOrgOS MIME | JSON `{ service_id, participant_id, payload }` |
| client identity | `X-Road-Client` | `Authorization` / API key（fixture） | `participant_id` |

### 4.1 X-Road v7

- Headers: `X-Road-Client`, `X-Road-Service`, `X-Request-Id`, `Content-Type`
- Deliver: `POST {security_server_url}/r1/{service_code}`

### 4.2 e-Gov central

- Deliver: `POST {api_base_url}/wire/notice-deliver`（mock path）
- Phase 2: OpenOrgOS MIME のみ · ministry schema 変換は Phase 4

### 4.3 Georgia 3G

- Deliver: `POST {api_base_url}/gateway/3g/services/{service_id}`
- Body wrapper: `{ service_id, participant_id, payload: <OpenOrgOS MIME string> }`

---

## 5. peer-endpoint 拡張

```yaml
inbound_endpoints:
  - url: https://ss.example.ee/r1/EE/COM/PARTNER/wire/notice-deliver
    mode: push
    transport: gov_gateway
    gov_gateway:
      profile_id: xroad_v7
      service_code: EE/COM/PARTNER/wire/notice-deliver
      member_code: EE/COM/PARTNER
      subsystem_code: wire
```

`transport` 省略 = `openorgos_p2p`（後方互換）。

---

## 6. Mock 契約

- `GovGatewayTransport` インターフェースで HTTP を抽象化  
- テスト: `MockGovGatewayTransport`（注入 · 200/500 制御）  
- 本番: `HttpGovGatewayTransport`（`fetch` / `protocolFetch`）  
- live SS 結合は Phase 4  

Fixtures: `tests/fixtures/gov-gateway/{xroad,jp,ge}/`

---

## 7. 受信 ingest

Webhook body 形式:

```json
{
  "format": "gov_gateway",
  "profile_id": "xroad_v7",
  "headers": { "X-Request-Id": "..." },
  "body": "<OpenOrgOS MIME JSON>"
}
```

または `Content-Type: application/vnd.openorgos.envelope+json` で envelope 直送（e-Gov 互換）。

---

## 8. CLI

| コマンド | 用途 |
|----------|------|
| `orgos protocol gov-gateway validate` | tenant + profile + registry |
| `orgos protocol gov-gateway encode --event-id --profile` | 国家形式ダンプ |
| `orgos protocol gov-gateway decode --file` | 逆変換 |
| `orgos protocol gov-gateway health --profile` | adapter 到達性 |

---

## 9. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-07 | P0 実装正本 — xroad_v7 · jp_egov_central · ge_gov_gateway_3g |
