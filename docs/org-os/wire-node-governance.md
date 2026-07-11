# Wire Node Governance — Community Registry Onboarding

**Status:** 2026-07-10  
**Parent:** [wire-trust-registry.md](wire-trust-registry.md) · [witness-hub-governance.md](witness-hub-governance.md)

---

## 目的

`wire-trust-registry.yaml` への Wire ノード追加を **committee 承認** 経由にし、`did:ooo:org:*` の重複となりすましを抑止する。

Witness operator governance（`trusted-operators.yaml`）とは **別レジストリ**。

---

## フロー

1. テナント: `orgos wire-gateway did init` · `protocol trust-registry pin-local`
2. 申請: `orgos protocol trust-registry submit --tenant mal --wire-email …`
3. Committee: `orgos protocol trust-registry decide --request-id … --approve`
4. 公開: `./scripts/publish-protocol-registry.sh`

---

## 申請検証

- ローカル DID / 公開鍵 / node_id が wire-gateway と一致
- **pk-DID 必須** — `did:ooo:org:pk-{hash}`（`wire-gateway did init` · governance submit）
- `wire_email` が自社ドメイン（任意 strict）
- 同一 `did` または `corporate_number` の pending/active 申請なし
- registry 既存 node との duplicate-did なし（decide 時 validate）

## pin-local ガバナンス

`ORGOS_STRICT_TRUST=1` または `ORGOS_REQUIRE_GOVERNANCE_PIN=1` では、**trust-registry に登録済み**（governance approve 後）のテナントのみ `pin-local` 可能。

```bash
# 開発のみ
orgos protocol trust-registry pin-local --tenant mal --bypass-governance
```

## Community HTTP API

Protocol API（Org C / Community BFF）:

| Method | Path | 説明 |
|--------|------|------|
| GET | `/protocol/v1/community/wire-node` | API catalog |
| GET | `/protocol/v1/community/wire-node/pending` | pending 一覧 |
| POST | `/protocol/v1/community/wire-node/submit` | 申請（pk-DID） |
| POST | `/protocol/v1/community/wire-node/decide` | 承認/却下（`Authorization: Bearer $ORGOS_COMMUNITY_GOVERNANCE_TOKEN`） |

Export: `publish/protocol/community-wire-node-api.json`

---

## 正本

| ファイル | 内容 |
|----------|------|
| `steward/platform/protocol/wire-node-governance.yaml` | governance_requests |
| `steward/platform/protocol/wire-trust-registry.yaml` | 承認後 nodes[] |

Community UI は OS_Community 別 Epic — Phase 1 は CLI のみ。
