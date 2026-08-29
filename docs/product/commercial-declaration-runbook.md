# OrgOS Ledger — 商用宣言 Runbook（承認付き）

**目的:** L7 商用宣言を、偽緑なしで `--commercial` 100/100 に到達させ、対外発表する。  
**方針:** 1-A Legal（counsel は人間ゲート）· 2-A Stripe（live キー必須、attestation 単独不可）。

---

## 進捗サマリ（自動監査）

| Phase | 内容 | 担当 | 承認 |
|-------|------|------|------|
| 0 | 現状 `--commercial` 監査 | Agent | — |
| 1 | Restore 品質ドリル（連続2成功） | Agent | CEO |
| 2 | 公開 Docs 自動検証 | Agent | CEO |
| 3 | Prod auth（`ORGOS_MCP_TOKEN` 等） | CEO → Agent verify | CEO |
| 4 | Stripe live キー + webhook | CEO | CEO |
| 5 | SMTP 本番 + mail-drill | CEO → Agent verify | CEO |
| 6 | Legal counsel + `legal-attest` | Counsel + CEO | CEO |
| 7 | Playwright UI E2E | Agent | CEO |
| 8 | チェックリスト署名 + 対外宣言 | CEO | CEO |

**合格ライン:** `orgos ledger product readiness --commercial` が全項 ✓、かつ [commercial-claim-checklist.md](./commercial-claim-checklist.md) を人手 `[x]`。

---

## Phase 0 — ベースライン（読取のみ）

```bash
cd /Users/kk/OS_Steward
npm run orgos -- ledger product readiness --commercial
npm run orgos -- ledger product stripe-status --json
```

記録: スコア · 未達 ID · 日時。

---

## Phase 1 — Restore 品質ドリル（Agent 実行可）

**ゲート:** `hasQualityRestoreDrill()` — 直近90日で連続2成功、または直近5件80%以上（最新が ok）。

```bash
# アーカイブ更新（テナント変更後）
npm run orgos -- ledger product export \
  --tenant-id pilot-ledger-001 \
  --output .exports/pilot-ledger-001-drill.tar.gz

# 2回連続実行
npm run orgos -- ledger product restore-drill \
  --tenant-id pilot-ledger-001 \
  --archive .exports/pilot-ledger-001-drill.tar.gz
npm run orgos -- ledger product restore-drill \
  --tenant-id pilot-ledger-001 \
  --archive .exports/pilot-ledger-001-drill.tar.gz

npm run orgos -- ledger product readiness --commercial | grep restore-drill
```

**副作用:** `tenants/pilot-ledger-001-drill/` が上書き · `product-fleet/restore-drills.yaml` に行追加。

---

## Phase 2 — 公開 Docs（Agent 検証 + CEO 目視）

自動合格条件（engineering）:

- `docs/product/security-overview.md` · `sla.md` · `pricing.md` — 「公開正本」· ドラフト表記なし
- `docs/product/status.md` 存在
- `product-fleet/support.yaml` の `status_page_url`
- ToS v1.2 + [dencho-sales-claim.md](./dencho-sales-claim.md)

CEO: 顧客送付用 PDF/URL の体裁を目視 → チェックリスト Docs 行 `[x]`。

---

## Phase 3 — Prod auth checklist（CEO 秘密情報 → Agent verify）

本番相当で `runProdAuthChecks("all")` を全 ✓ にする。

| 変数 | 用途 |
|------|------|
| `ORGOS_MCP_TOKEN` | MCP 本番認証（`ORGOS_MCP_AUTH=0` は commercial 不可） |
| `ORGOS_ENV=production` 等 | prod モード検査 |
| `STEWARD_CHAT_AUTH` | 本番は off 禁止 |
| `WIRE_CONSOLE_AUTH=prod` | dev passkey 禁止 |

参照: `deploy/operator-console/env/production.env.example`

```bash
# CEO が env 投入後
npm run orgos -- doctor
npm run orgos -- ledger product readiness --commercial | grep prod-auth
```

**Agent は秘密値を要求・生成しない。** 投入後の verify のみ。

---

## 保留フェーズ（CEO がスキップ可能）

| Phase | 内容 | 状態 |
|-------|------|------|
| 4 | Stripe live | **保留** — 後日 Dashboard でキー投入 → `./scripts/commercial-phase4-stripe-verify.sh` |
| 5 | SMTP mail-drill | **済** — Xserver `.env.mail-wire` から verify · `./scripts/commercial-phase5-mail-verify.sh` |
| 6 | Legal counsel | **済** — `counsel-株式会社MAL-段` · `./scripts/commercial-phase6-legal-verify.sh` |

**保留中でも進められる:** Phase 1–3 · 7（済）· 公開 Docs · restore · E2E。  
**100/100 には:** 保留 3 項の完了が必要（または商用宣言前に CEO がリスク承認）。

---

## Phase 4 — Stripe live（CEO のみ · 保留可）

1. Stripe Dashboard（**live**）で Secret key · Webhook signing secret 取得
2. **推奨（本番前）:** Operator Console **`/?product-setup=1`** で保存（`data/product/stripe-secrets.env`）
   - 本番投入**前**に `sk_test_` でも commercial `stripe-live` は合格
   - セルフサーブ live 課金開始時に `sk_live_` へ差し替え
   - `production.env` の手編集は不要（Docker env がある場合は env 優先）
3. **代替:** 本番 env に `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` 投入
4. Webhook エンドポイント本番 URL 登録（subscription lifecycle イベント）
5. Agent verify:

```bash
# CEO が env 投入後
npm run orgos -- ledger product stripe-status --json
npm run orgos -- ledger product stripe-attest
npm run orgos -- ledger product readiness --commercial | grep stripe-live

# または一括（this Mac）
./scripts/commercial-phase4-stripe-verify.sh
```

---

## Phase 5 — SMTP + mail-drill（CEO 秘密情報 → Agent verify）

1. SES / SMTP 本番資格情報を `ORGOS_MAIL_SMTP_URL` に設定
2. テスト送信:

```bash
npm run orgos -- ledger product mail-drill --to <CEO確認用メール>
npm run orgos -- ledger product readiness --commercial | grep mail-smtp
```

---

## Phase 6 — Legal counsel（Counsel + CEO）

1. 外部 counsel: `docs/product/legal/terms-of-service.md` · `dpa.md` レビュー
2. 差分があれば正本更新（`*-draft.md` は archive のみ）
3. 記録:

```bash
npm run orgos -- ledger product legal-attest \
  --signed-by counsel-<name> \
  --counsel-reviewed-by counsel-<name> \
  --notes "ToS v1.2 / DPA v… reviewed YYYY-MM-DD"
```

4. `product-fleet/legal-attestation.yaml` の `counsel_reviewed_*` を確認

---

## Phase 7 — UI E2E（Agent、CEO 承認後）

```bash
cd /Users/kk/OS_Steward
npm run steward-chat:e2e -- e2e/steward-chat-ledger-customer.spec.ts
```

所要: build + smoke server（数分）。403 緩和なし · UI 主導ジャーニー。

---

## Phase 8 — 最終宣言（CEO）

### フル宣言（100/100）

1. `npm run orgos -- ledger product readiness --commercial` → **100/100**
2. [commercial-claim-checklist.md](./commercial-claim-checklist.md) 全行 `[x]`（Stripe 含む）
3. 対外文案（下記）で発表

### 限定宣言（Stripe 保留時 · 現行）

`--commercial` が **90/100** 等でも、CEO が Stripe を明示保留した場合:

```bash
COMMERCIAL_DECLARE_SCOPE=qualified ./scripts/commercial-phase8-declare.sh ceo
```

- 記録: `product-fleet/commercial-declaration.yaml`
- Stripe 行はチェックリスト `[—] 保留` のまま
- 対外文案に **招待制・契約ベース** を追記（セルフサーブ課金は別途）

### 対外文案テンプレ

**フル:**

> OrgOS Ledger はマネージド単一テナントの法人向けクラウド会計です。電子帳簿は基本要件対応（優良要件は別オプション）。e-Tax 提出は含みません。

**限定（Stripe 保留 · 2026-08-26 採用）:**

> OrgOS Ledger はマネージド単一テナントの法人向けクラウド会計です。電子帳簿は基本要件対応（優良要件は別オプション）。e-Tax 提出は含みません。  
> セルフサーブ課金（Stripe live）は別途投入予定。現時点は招待制・契約ベースの提供とします。

---

## ロールバック

- Stripe: live キーを env から除去 → checkout 停止
- 宣言撤回: status ページ · サイト文言を「ベータ/招待制」に戻す
- Legal: attestation を撤回する場合は YAML を更新し `orgos validate`
