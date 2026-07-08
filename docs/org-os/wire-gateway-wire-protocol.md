# Wire Gateway — Wire Protocol v0.1（外部 P2P）

**Status:** WG-0 正本 · 2026-07-07  
**Parent:** [wire-gateway-requirements.md](wire-gateway-requirements.md)  
**Schema:** [`schemas/protocol/wire-message.ts`](../../schemas/protocol/wire-message.ts)  
**Codec:** [`src/lib/wire-gateway/codec.ts`](../../src/lib/wire-gateway/codec.ts)

---

## 1. スコープ

Internet 上で **Wire Gateway ↔ Wire Gateway** が交換する JSON。Gateway は `payload` を**解釈しない**。

| 区分 | 形式 |
|------|------|
| 外部（本書） | `WireMessage` · `wireVersion: "0.1"` |
| 内部（Org Core） | `EventEnvelope` · [wire-gateway-internal-api.md](wire-gateway-internal-api.md) |

---

## 2. WireMessage スキーマ

```json
{
  "wireVersion": "0.1",
  "protocolVersion": "1",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "org.transaction.recorded",
  "sender": "org.example.co.jp",
  "receiver": "org.partner.example",
  "timestamp": "2026-07-07T09:00:00.000Z",
  "nonce": "f7c3b2a1e9d84f6c",
  "hash": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
  "signature": "base64-ed25519…",
  "payload": { },
  "identity": { "org_ref": { "org_id": "org.example.co.jp" } },
  "correlationId": "optional-uuid",
  "causationId": "optional-uuid"
}
```

| フィールド | 必須 | 制約 |
|-----------|:----:|------|
| `wireVersion` | ✓ | `"0.1"` |
| `protocolVersion` | ✓ | `"1"` |
| `eventId` | ✓ | UUID · 冪等キー |
| `eventType` | ✓ | 非空 string |
| `sender` | ✓ | Node ID（§4） |
| `receiver` | ✓ | Node ID |
| `timestamp` | ✓ | ISO 8601 · offset 付き |
| `nonce` | ✓ | 8–128 文字 · 受信側 replay 台帳用 |
| `hash` | ✓ | 64 hex · §3 |
| `signature` | ✓ | Ed25519 · base64 · §3 |
| `payload` | ✓ | object · Gateway は**中身を解釈しない** |
| `identity` | ✓ | EventEnvelope.identity 透過（署名 lossless のため） |
| `delegation` | | 透過 |
| `correlationId` | | 透過 |
| `causationId` | | 透過 |

---

## 3. 署名と hash

### 3.1 正本アルゴリズム（EventEnvelope 互換）

OpenOrgOS 参照実装では **内部 `EventEnvelope` の digest** を正とする。

```
envelope = wireMessageToEnvelope(wire)
hash     = envelopeDigest(envelope)   // signature 除外 · キーソート JSON → SHA-256 hex
verify   = Ed25519_verify(hash_bytes, signature, sender_public_key)
```

**参照:** [`canonical.ts`](../../src/lib/protocol/canonical.ts) · [`signing.ts`](../../src/lib/protocol/signing.ts)

### 3.2 Wire 単体 canonical（検証用 · 同等結果）

Gateway が EventEnvelope に展開せず検証する場合:

1. `WireMessage` から `hash` · `signature` を除く  
2. 残りフィールドを **キー名 ASCII 昇順** で JSON 化  
3. UTF-8 → SHA-256 hex = 期待 `hash`  

> WG-0: 参照実装 codec は **§3.1 経由**（envelope 変換後 digest）を正とする。§3.2 は将来の standalone verifier 用。

### 3.3 署名

- アルゴリズム: **Ed25519**（Node `crypto.sign` / `verify` · digest 入力）  
- 公開鍵: SPKI DER · base64（`peers` / node identity）  
- Gateway は **送信前に hash 一致** · **受信後に signature 検証** を必須とする  

---

## 4. Node ID

| 優先 | 形式 | 例 |
|------|------|-----|
| 1 | DNS 風 FQDN | `org.example.co.jp` |
| 2 | 参照実装 URI | `steward://tenant/{tenantId}` |
| 3 | OpenOrg DID | `did:ooo:org:…`（WG-4 · [wire-trust-registry.md](wire-trust-registry.md)） |

**解決:** Gateway は `sender` / `receiver` を peer テーブルと照合。未登録 → **403 + audit `peer_unknown`**.

### 4.1 EventEnvelope との Node マッピング

| WireMessage | EventEnvelope |
|-------------|---------------|
| `sender` | `origin.org_id`（DNS 風）または `origin.org_uri`（URI 形式） |
| `receiver` | `destination.org_id` / `destination.org_uri` |

**規約:** 同一組織内では `org_id` = Node ID を推奨。`org_uri` は補助。

---

## 5. EventEnvelope ↔ WireMessage 変換

**実装:** [`codec.ts`](../../src/lib/wire-gateway/codec.ts)

### 5.1 envelope → wire（encode）

| EventEnvelope | WireMessage |
|---------------|-------------|
| `event_id` | `eventId` |
| `event.type` | `eventType` |
| `origin.org_id` または `origin.org_uri` | `sender` |
| `destination.org_id` または `destination.org_uri` | `receiver` |
| `occurred_at` | `timestamp` |
| `event.payload` | `payload` |
| `protocol_version` | `protocolVersion` |
| `identity` | `identity` |
| `delegation` | `delegation` |
| `correlation_id` | `correlationId` |
| `causation_id` | `causationId` |
| （生成） | `nonce` — CSPRNG hex 16+ |
| `envelopeDigest(envelope)` | `hash` |
| `signature` | `signature` |

固定: `wireVersion: "0.1"`

### 5.2 wire → envelope（decode）

上表の逆。`sender` / `receiver` から `origin` / `destination` を復元。`identity` · `delegation` は透過。

### 5.3 不変条件

1. encode → decode → **同一 `event_id` · 同一 digest**（`identity` 補完除く）  
2. Gateway は decode 後 **フィールドを追加/変更しない**  
3. `payload` は JSON object のみ（配列トップ不可）  

---

## 6. 外部 HTTP API（Gateway 公開 · Internet）

Base: `https://wire.{org-domain}/`

| Method | Path | 説明 |
|--------|------|------|
| GET | `/wire/v1/health` | ヘルス |
| GET | `/.well-known/wire-node.json` | Node ID · 公開鍵 · wireVersion |
| POST | `/wire/v1/events` | Push 受信 · body = `WireMessage` |
| GET | `/wire/v1/events/{eventId}` | Pull · 送信元 Org が許可した event のみ |

### 6.1 POST `/wire/v1/events`

**Request:** `Content-Type: application/json` · body = `WireMessage`

**Response:**

| Status | Body |
|--------|------|
| 202 | `{ "ok": true, "eventId": "…", "accepted": true }` |
| 400 | `{ "ok": false, "error": "schema_invalid" }` |
| 401 | mTLS / auth 失敗 |
| 403 | `{ "ok": false, "error": "signature_invalid" \| "peer_unknown" \| "replay" }` |
| 409 | `{ "ok": true, "eventId": "…", "idempotent": true }` |
| 429 | rate limit |

**Gateway 処理順:** TLS → auth → schema → timestamp window → nonce 台帳 → signature → Internal API POST inbox

### 6.2 GET `/wire/v1/events/{eventId}`

Pull 要求。Gateway は Internal API `GET /internal/v1/wire/events/{eventId}` を呼び、許可時のみ `WireMessage` を返す。

---

## 7. セキュリティ（WG-0 確定値）

| 項目 | 値 |
|------|-----|
| TLS | 必須 · 1.2+ |
| mTLS | 推奨（peer 登録時 `client_auth: required`） |
| Timestamp window | **±300 秒**（設定可能） |
| Nonce | 受信側 **7 日間** 台帳 · `(sender, nonce)` 一意 |
| Rate limit | 既定 **120 req/min/IP**（設定可能） |
| IP allowlist | 任意 · gateway config |

---

## 8. Gateway Audit（外部イベント）

| `action` | 記録フィールド |
|----------|---------------|
| `wire.send` | eventId · sender · receiver · hash · http_status |
| `wire.receive` | 同上 |
| `wire.reject` | reason · peer_node_id |
| `wire.auth_fail` | peer · reason |
| `wire.sig_fail` | eventId · sender |

**保持しない:** payload · Event 本文

---

## 9. レガシー互換

| 形式 | 扱い |
|------|------|
| 参照実装 legacy webhook | `transport: legacy_webhook` · 移行期並存 · **廃止方針** [wire-legacy-webhook-deprecation.md](wire-legacy-webhook-deprecation.md)（目標 2026-10-01） |
| `EventEnvelope` 直 POST | peer 設定で移行期のみ |
| Gov Gateway wrap | [gov-gateway-adapters.md](gov-gateway-adapters.md) · Wire の**下流** |

---

## 10. 変更履歴

| 版 | 日付 | 内容 |
|----|------|------|
| 0.1 | 2026-07-07 | WG-0 正本 — schema · 署名 · HTTP · Node ID · codec |
| 0.1.1 | 2026-07-08 | well-known schema · audit action 参照 |
