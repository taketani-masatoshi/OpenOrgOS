# OrgOS Resilience Stack（R1–R4）

**Status:** 2026-06 実装  
**Parent:** [witness-hub-requirements.md](witness-hub-requirements.md) · [orgos-interface-spec.md](orgos-interface-spec.md)

---

## 概要

インターネット型の **多層・非ブロッキング・ eventual 収束** を OrgOS 取引に適用する。

| Phase | 内容 | CLI |
|-------|------|-----|
| **R1** | Relay worker · auto flush wire/witness pending | `protocol relay run` · `once` · `status` |
| **R2** | Multipath wire · `inbound_endpoints[]` | peer 設定 · `protocol deliver` |
| **R3** | Pull/relay API · 契約 witness 绑定 | `protocol api-serve` · `witness pool init-from-contract` |
| **R4** | SLA tier · reconcile 統合 | `protocol sla` · relay cycle 内 reconcile |

---

## Witness Trust Network（Org C PKI）

取引非関与の **組織 C** が Hub 公開鍵を **認証局（WTA）** として署名する。

```bash
# Org C
npm run steward -- --tenant trust-c protocol witness trust init-authority \
  --authority-id WTA-C-001 --org-name "Neutral Witness Co"
npm run steward -- --tenant trust-c protocol witness trust certify \
  --hub-id HUB-C --hub-url https://hub-c.example
npm run steward -- --tenant trust-c protocol witness trust publish
npm run steward -- --tenant trust-c protocol api-serve --port 9476

# Org A / B — bundle を pin して pool 生成
npm run steward -- --tenant mal protocol witness trust verify \
  --bundle-url http://trust-c.example:9476/protocol/v1/trust/bundle
npm run steward -- --tenant mal protocol witness pool init-from-trust \
  --bundle-url http://trust-c.example:9476/protocol/v1/trust/bundle
```

**検証:** `authority_signature`（各 Hub cert）+ `bundle_signature`（bundle 全体）を Org C の `public_key` で検証。

---

## 契約条項

```yaml
# data/contracts/CTR-012.yaml
protocol:
  resilience_sla: gold
  witness_trust_bundle_url: http://trust-c.example:9476/protocol/v1/trust/bundle
  witness_hubs:
    - hub_id: HUB-C
    - hub_id: HUB-D
```

```bash
npm run steward -- --tenant mal protocol witness pool init-from-contract --contract CTR-012
```

---

## SLA Tier

| Tier | 要件 |
|------|------|
| bronze | committed（自 Org 台帳） |
| silver | + delivered（wire 未到達 pending なし） |
| gold | + attested（witness quorum 充足） |

```bash
npm run steward -- --tenant mal protocol sla --tier silver
```

---

## 本番 TLS / mTLS（R4+）

### Org C — HTTPS trust bundle + mTLS relay

```bash
# サーバー（Org C）
npm run steward -- --tenant trust-c protocol api-serve \
  --host 0.0.0.0 --port 9476 \
  --tls-cert /etc/steward/protocol/server-cert.pem \
  --tls-key /etc/steward/protocol/server-key.pem \
  --tls-ca /etc/steward/protocol/client-ca.pem \
  --mtls-required \
  --mtls-allowed-org steward://tenant/mal \
  --mtls-allowed-org steward://tenant/southwood
```

| ルート | TLS | mTLS |
|--------|-----|------|
| `GET /protocol/v1/trust/bundle` | 必須（本番） | 不要（公開読取） |
| `POST /protocol/v1/relay/*` | 必須 | **必須** |
| `GET /protocol/v1/inbox` · `/outbox` | 必須 | **必須** |

### Org A/B — クライアント証明書

`data/protocol/protocol-api-client.yaml`（雛形: `steward/platform/protocol/protocol-api-client.yaml.example`）

```yaml
tls:
  cert_path: records/protocol/client-cert.pem
  key_path: records/protocol/client-key.pem
  ca_path: records/protocol/trust-ca.pem
```

HTTPS trust bundle 取得 · relay POST はこの設定を自動利用。

---

## 契約 approve 時の witness pool 自動 bind

`protocol notice approve` 成功時、契約に `protocol.witness_trust_bundle_url` または `witness_hubs` があれば **自動で `witness-pool.yaml` を更新**（best-effort · 失敗しても wire は継続）。

```yaml
# data/contracts/CTR-012.yaml
protocol:
  resilience_sla: gold
  witness_trust_bundle_url: https://trust-c.example/protocol/v1/trust/bundle
  witness_hubs:
    - hub_id: HUB-C
```

---

## デモ

```bash
npm run demo:resilience
```

Hub 1 台停止 · primary URL 失敗 · trust bundle 検証を含む E2E 骨格。

---

## 不変条件（継承）

1. Wire 完了は Hub / relay 成功に非依存  
2. Witness 失敗で approve をロールバックしない  
3. Hub は editor ではない · trust cert は Hub 鍵 pin のみ
