# ADR 0071: Direct HTTP / OData outbound connectors（財務 L1）

**状態:** Accepted · **日付:** 2026-09-06  
**決定者:** OpenOrgOS コアメンテナ

---

## Context

ERP（SAP 等）や汎用 REST / OData へ財務の L1 写しを送りたい。一方で
[ADR 0070](0070-console-saas-connectors.md) の Community OAuth 経路は SaaS（Slack /
Asana / Drive）向けであり、オンプレ URL・Basic・client credentials・テナント固有
endpoint には向かない。

素直に `CONNECTOR_PROVIDERS` に `sap` を足すと、出荷ゲートと Community Connections
UI が混ざる。ERP 直結を SaaS OAuth と同じ箱に入れると、認証と秘密の扱いが崩れる。

## Decision

### 1. Community OAuth に乗せない直結コネクタ

- 設定正本: `data/integrations/http-outbound.yaml`（L1: base_url · path · dialect）
- 秘密: `data/secrets/http-outbound.env`（0600 · gitignore · 書込のみ）
- 認証: `none` · `bearer` · `basic` · `oauth2_client_credentials`
- dialect: `rest` | `odata_v4`（`odata_v2` は本 MVP では 422）
- Community bind / token push / Connections ページには出さない

### 2. 外部は L1 レプリカ、正本は OrgOS

初期ソースは次のみ:

- `finance.monthly` — category · amount · month · property_id · chart_account_code
- `invoice.issued` — invoice_id · amount（口座番号なし）

銀行口座番号・stakeholder 詳細・任意 `data/**` パスは拒否。pull で YAML を
上書きしない。対応台帳は `data/integrations/http-exports.yaml`。

### 3. 外へ出る操作は `chat:approve` / 人間 CLI

読むのは `chat:read`。settings · secrets · export は全部 `chat:approve`。
LLM / MCP は実行しない。CLI は `--dry-run` を推奨。

### 4. 出荷はテナント `enabled`（Community env 不要）

`http-outbound.yaml` の `enabled: true` で十分。Community の
`COMMUNITY_*_SHIPPED` は使わない。

## Consequences

### Positive

- ERP / 汎用 HTTP を SaaS OAuth と分離できる
- 秘密と承認の重さが 0070 と同型（書込のみ · approve）
- SAP 製品固有 SDK なしで OData v4 まで試験できる

### Negative / トレードオフ

- Console に Direct HTTP 区画が増える（Community 接続ボタンはない）
- OData v2 / CSRF / `$metadata` 同期は未実装
- 財務以外のソースは後続

## 関連

- [0070-console-saas-connectors.md](0070-console-saas-connectors.md)
- [ooo-surfaces/connectors.md](../org-os/ooo-surfaces/connectors.md)
- 実装: `schemas/http-outbound.ts` · `src/lib/integrations/http-outbound-*.ts`
