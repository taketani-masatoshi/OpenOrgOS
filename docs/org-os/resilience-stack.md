# OrgOS Resilience Stack（R1–R4）

**Status:** 2026-06 実装 · **Proposal 3 参照デモ:** aiac Org C · `https://127.0.0.1:9486`  
**Parent:** [witness-hub-requirements.md](witness-hub-requirements.md) · [orgos-interface-spec.md](orgos-interface-spec.md) · [inter-org-three-org-demo.md](inter-org-three-org-demo.md)

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

取引非関与の **Org C（本リポジトリ参照: テナント `aiac`）** が Hub 公開鍵を **認証局（WTA）** として署名する。

### 開発 · 参照デモ（Proposal 3）

```bash
npm run proposal3:setup                    # PKI + client yaml + deploy env
npm run demo:wire-console-three-org        # 1 通 E2E（HTTPS + mTLS）
npm run proposal3:org-c-api                # Org C 常駐（別ターミナル）
npm run proposal3:party-relay -- mal       # Mac mini 送信側 relay
npm run proposal3:party-relay -- southwood # Mac mini 受信側 relay
```

| エンドポイント | URL |
|----------------|-----|
| Org C trust bundle | `https://127.0.0.1:9486/protocol/v1/trust/bundle` |
| Org C relay enqueue | `https://127.0.0.1:9486/protocol/v1/relay/enqueue` |
| Wire Console（人間 UI） | `http://127.0.0.1:9470` |

```bash
# Org C — WTA + bundle（seed 内でも実行）
npm run orgos -- --tenant aiac protocol witness trust init-authority \
  --authority-id WTA-AIAC-001 --org-name "AIAC — Neutral Wire Operator"
npm run orgos -- --tenant aiac protocol witness trust certify \
  --hub-id HUB-A --hub-url http://127.0.0.1:9474
npm run orgos -- --tenant aiac protocol witness trust publish

# Org A / B — bundle を pin して pool 生成
npm run orgos -- --tenant mal protocol witness pool init-from-trust \
  --bundle-url https://127.0.0.1:9486/protocol/v1/trust/bundle
```

**検証:** `authority_signature` + `bundle_signature` を Org C WTA 公開鍵で検証。

---

## 契約条項

```yaml
# data/contracts/CTR-012.yaml（mal / southwood）
protocol:
  resilience_sla: gold
  witness_trust_bundle_url: https://127.0.0.1:9486/protocol/v1/trust/bundle
  witness_trust_authority_url: https://127.0.0.1:9486
  relay_org_uri: steward://tenant/aiac
  witness_hubs:
    - hub_id: HUB-A
    - hub_id: HUB-B
```

```bash
npm run orgos -- --tenant mal protocol witness pool init-from-contract --contract CTR-012
```

---

## SLA Tier

| Tier | 要件 |
|------|------|
| bronze | committed（自 Org 台帳） |
| silver | + delivered（wire 未到達 pending なし） |
| gold | + attested（witness quorum 充足） |

```bash
npm run orgos -- --tenant mal protocol sla --tier silver
```

---

## 本番 TLS / mTLS（R4+）

### Org C — HTTPS trust bundle + mTLS relay

**正本手順:** [deploy/proposal3/README.md](../../deploy/proposal3/README.md)

```bash
# 初回（dev 参照）
npm run orgos -- protocol tls init-proposal3

# 本番ローテーション計画
npm run orgos -- --tenant aiac protocol tls rotate
# → tenants/aiac/data/protocol/tls/rotation-meta.json

# ローテーション後の検証（Org C API 起動中）
npm run orgos -- --tenant mal protocol tls verify
npm run proposal3:daemon-smoke
```

```bash
# サーバー（Org C · 本番パス例）
npm run proposal3:org-c-api
# または systemd: steward-org-c-api · env: deploy/proposal3/env/org-c-api.generated.env
```

| ルート | TLS | mTLS |
|--------|-----|------|
| `GET /protocol/v1/trust/bundle` | 必須（本番） | 不要（公開読取） |
| `POST /protocol/v1/relay/*` | 必須 | **必須** |
| `GET /protocol/v1/inbox` · `/outbox` · `/metrics` | 必須 | **必須** |

### Org A/B — クライアント証明書

`tenants/{id}/data/protocol/protocol-api-client.yaml`（雛形: `steward/platform/protocol/protocol-api-client.yaml.example`）

```yaml
tls:
  cert_path: data/proposal3-pki/clients/mal-client.pem   # dev 参照
  key_path: data/proposal3-pki/clients/mal-client.key
  ca_path: data/proposal3-pki/ca.pem
  reject_unauthorized: false                            # dev のみ · 本番 true
allowed_relay_org_uris:
  - steward://tenant/aiac
```

HTTPS trust bundle 取得 · relay POST / pull は `protocol-api-client.yaml` を自動利用。

---

## 契約 approve 時の witness pool 自動 bind

`protocol notice approve` 成功時、契約に `protocol.witness_trust_bundle_url` があれば **自動で `witness-pool.yaml` を更新**（best-effort）。

---

## デモ

```bash
npm run demo:wire-console-three-org   # Proposal 3 · 3-org Wire Console
npm run demo:inter-org                 # 2-org フル（ack 返信あり）
```

---

## 不変条件（継承）

1. Wire 完了は Hub / relay 成功に非依存  
2. Witness 失敗で approve をロールバックしない  
3. Hub は editor ではない · trust cert は Hub 鍵 pin のみ

*版: 2026-06-28 · aiac / :9486 / Proposal 3 同期*
