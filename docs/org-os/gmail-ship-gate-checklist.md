# Gmail / email_wire 出荷ゲートチェックリスト

**Parent:** [ADR 0004](../adr/0004-gmail-deferred-opt-in-gate.md) · [community-tenant-mail.md](community-tenant-mail.md) · [deploy/mal-pilot/README.md](../../deploy/mal-pilot/README.md)

---

## 前提

| 項目 | 出荷前（現在） | 出荷後 |
|------|----------------|--------|
| `ORGOS_EMAIL_WIRE_REQUIRED` | 未設定 | `1`（mal 本番 env） |
| `tenant_mail_connect_*` | `false` | Phase 4b 完了後 `true` |
| Community `COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED` | 未設定 | `1` |

---

## Phase 4a — email_wire SMTP/IMAP（Community OAuth より先行可）

### 準備

- [x] `tenants/mal/records/executive/mail-config.mal-pilot.yaml.example` — Xserver · `ai@` テンプレ
- [ ] `deploy/mal-pilot/env/.env.mail-wire` — L2 SMTP/IMAP（`ai@malkk.com`）※gitignore
- [ ] `tenants/mal/records/executive/mail-config.yaml` — mal-pilot テンプレから生成 ※gitignore
- [ ] Wire Gateway 公開 health 200（`https://wire.oorgos.org/wire/v1/health`）

### 検証

```bash
./scripts/phase4-mal-email-wire-live.sh mal check
ORGOS_EMAIL_WIRE_REQUIRED=1 ./scripts/phase4-mal-email-wire-live.sh mal check
ORGOS_LIVE_VERIFY=1 ORGOS_LIVE_VERIFY_STRICT_EMAIL=1 ./scripts/wire-live-verify.sh mal check
./scripts/phase4-mal-email-wire-live.sh mal live   # SMTP/IMAP 実送信
```

### データ衛生（Wave 0）

- [x] mal `peers.yaml` pk-DID 正本
- [x] orphan transactions prune（registry 空）— **git commit 必須**（未 commit だと Vitest snapshot で復活）
- [x] `protocol transaction prune-orphans` / `witness cache-missing` CLI

### 本番 env 固定（CEO 承認後）

```bash
# deploy/mal-pilot/env/mal-ship-gate.env.example を参照
export ORGOS_EMAIL_WIRE_REQUIRED=1
./scripts/prod-validate-wire.sh mal   # email_wire blocking で PASS 必須
```

---

## Phase 4b — Community Gmail OAuth（後追い）

- [x] Community `/api/integrations/orgos-mail/{status,start,callback}` + Connections カード（既定 503）
- [x] Operator Console 設定から Community Connections へリンク（SHIPPED は CEO）
- [x] Operator Console「会社の設定」（`/?onboarding=1`）に メールカード — 送信元・provider・連携 / 切断（秘密は扱わない）
- [ ] Google OAuth redirect 2 本（login + orgos-mail callback）
- [ ] Steward: `ORGOS_GMAIL_CLIENT_*` · `ORGOS_COMMUNITY_GOVERNANCE_TOKEN`
- [ ] Community: `COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED=1`
- [ ] `orgos mail setup gmail --community-link` → token push E2E
- [ ] 出荷フラグを立てる（**手編集しない**）:
  - 運営ビュー: Operator Console `/?platform=1` →「出荷フラグ」（`ORGOS_PLATFORM_OPERATORS` に載った運営のみ）
  - CLI: `orgos protocol community integration set --flag tenant_mail_connect_api --value true`（`--flag tenant_mail_connect_ui` も同様）
  - 確認: `orgos protocol community integration list`
- [ ] `orgos protocol community export`（export はフラグを保持するだけで、**自動で true にしない** — ADR 0004）

---

## CEO 承認ゲート（Phase 5 · 統合出荷）

| # | 確認 | 主体 |
|---|------|------|
| 1 | Phase 4a live roundtrip 証跡（`scratch/wire-live-verify-*.json`） | Engineering |
| 2 | Phase 4b Community E2E（任意 · OAuth 経路） | Engineering |
| 3 | **CEO / approver 承認** — 本番 env で blocking 化 | CEO |
| 4 | mal systemd env に `ORGOS_EMAIL_WIRE_REQUIRED=1` 反映 | Operator |
| 5 | Community 本番 env に `COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED=1` | Operator |
| 6 | integration フラグ `true` + Steward export + Community 再デプロイ | Operator |

承認記録: `orgos approval` または社内稟議（REG-004）に従う。

## 運営ビュー（`/?platform=1`）

| 表示 | 意味 |
|---|---|
| 出荷フラグ | `publish/protocol/community-integration.json` の宣言（Steward 側） |
| Community 側の env | `/api/integrations/orgos-mail/status` の実状。503 は「API はあるが env 未設定」 |

Community の env は再デプロイでしか変わらないため、運営ビューは**状態を可視化し次の手順を示す**役割に留める。BFF は `GET/PUT /chat/v1/platform/integration`、書き込みは `chat:approve` + 運営許可リストの両方が必要で、テナント operator は 403。

---

## ロールバック

```bash
# blocking を解除（Wire のみ pilot に戻す）
unset ORGOS_EMAIL_WIRE_REQUIRED
# Community UI を非公開
unset COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED
# integration フラグを false に戻して export
```

---

## 定期確認（出荷前 · 現行運用）

```bash
# Gmail 不要 — 週次またはデプロイ前
./scripts/prod-validate-wire.sh mal
# 期待: email_wire: deferred · exit 0
```
