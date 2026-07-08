# Wire Gateway — Pull エクスポートポリシー（WG-0 草案 · WG-2 実装）

**Status:** WG-0 正本 · 2026-07-07  
**Parent:** [wire-gateway-internal-api.md](wire-gateway-internal-api.md) §4.7  
**Schema:** [`schemas/protocol/wire-export-policy.ts`](../../schemas/protocol/wire-export-policy.ts)  
**実装:** WG-2（Core `GET /events/{eventId}` の許可判断）

---

## 1. 目的

`GET /wire/v1/events/{eventId}`（Pull）において、**送信元 Org** が event の export を許可するかを Core が判断する。Gateway は判断結果に従い WireMessage を返すか 404/403 とする。

---

## 2. ポリシーファイル

**パス:** `tenants/{id}/data/protocol/wire-export-policy.yaml`

**Seed:** [wire-export-policy.yaml.example](../../steward/platform/protocol/seed/wire-export-policy.yaml.example)

```yaml
version: "1"
default_allowed: false
rules:
  - peer_node_id: org.partner.example
    allowed: true
    event_types:
      - org.transaction.recorded
      - org.identity.presented
```

---

## 3. 判定順序（WG-2）

1. `eventId` が outbox に存在し approve 済みか  
2. 要求元 peer（Pull 要求の mTLS / 認証から解決）が `rules[]` にあるか  
3. `allowed: true` か  
4. `event_types` が設定されていれば `event.type` が含まれるか  
5. いずれか失敗 → `{ allowed: false, reason: "…" }`  

---

## 4. Gateway 挙動

| Core 応答 | Gateway 外部応答 |
|-----------|------------------|
| `allowed: true` + envelope | `200` · `WireMessage` |
| `allowed: false` | `404` または `403` · audit `wire.reject` |
| Core 503 | `503` · retry 可 |

---

## 5. 変更履歴

| 版 | 日付 | 内容 |
|----|------|------|
| 0.1 | 2026-07-07 | WG-0 — ポリシースキーマ · 判定順序 |
