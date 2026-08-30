# 営業と製品の面（OOO-47〜OOO-53）

**実装:** `src/lib/steward-chat/routes/customers-api.ts` · `domain-ops-api.ts` · `product-api.ts`
**採点:** `docs/org-os/ooo-capability-items.yaml` の OOO-47〜OOO-53

顧客・宿泊台帳・課金・テナント。**他社のデータが混ざらないこと**と、
**課金の鍵が漏れないこと**がここの主要件。

## 経路と必要権限

| 経路 | 権限 | 用途 |
|---|---|---|
| `GET /chat/v1/customers/nav` | `chat:read` | 顧客ナビ |
| `GET /chat/v1/customers/pipeline` | sales panel + `chat:read` | パイプライン |
| `POST /chat/v1/customers/deals/set-stage` | sales panel + `chat:ask` / `chat:approve` | 商談ステージの移動 |
| `POST /chat/v1/customers/inquiry/promote` | sales panel + `chat:ask` | 問合せの昇格 |
| `GET /chat/v1/hospitality/ops-due` | `chat:read` | 宿泊 L1 台帳の運営期日 |
| `GET /chat/v1/product/plans` | 不要（公開） | 料金プラン |
| `POST /chat/v1/product/signup` | 不要（公開） | 申込み |
| `POST /chat/v1/product/stripe/webhook` | 署名検証 | Stripe からの通知 |
| `GET /chat/v1/product/subscription` | `chat:read` | 契約状況 |
| `GET /chat/v1/product/stripe-settings` | `ceo` のみ | Stripe の設定状態 |
| `GET /chat/v1/product/control-plane` | `ceo` のみ | 共有コントロールプレーン |
| `GET /chat/v1/product/guest-setup` | 招待トークン | 税理士ゲストの受入 |

営業面は **sales panel が有効なテナントでしか開かない**。課金と
コントロールプレーンは代表だけが触る。

## 拒否する条件

| 状況 | 応答 |
|---|---|
| セッションが無い | 401 `unauthorized` |
| sales panel の無いテナントで営業面 | 403 `forbidden` |
| 代表以外が control-plane / stripe-settings | 403 |
| ステージ移動に必要な権限が無い | 403。後戻りは `chat:approve` |
| 招待トークンが無い・期限切れ | 422 / 403。ゲストは期限付き readonly |
| Stripe webhook の署名が不正 | 422。検証できない通知は処理しない |
| 他テナントの ID を指したリクエスト | 404。存在を教えない |
| 想定外の例外 | catch して JSON |

## テナント隔離

コントロールプレーンは複数テナントを跨いで見えるが、データの読み書きは
必ず `tenant_id` で解決したパスに閉じる。他テナントの ID を指しても
**エラーではなく 404**（存在の有無を漏らさない）。

## 鍵の扱い

Stripe の secret key と webhook secret は環境変数から読み、
`stripe-settings` は「設定済み / 未設定」しか返さない。`sk_live_` や
`sk_test_` で始まる文字列を HTTP 応答に載せない。E2E がこれを見る。

## やらないこと

- 未設定の Stripe で本番課金を開くこと。起動時チェックで警告する
- 税理士ゲストを常勤席に昇格させること
- 顧客の個人情報（L2）をチャットへ転記すること

## テスト

| 層 | パス |
|---|---|
| 単体 | `tests/steward-chat-sales-pipeline.test.ts` · `tests/hospitality-ops.test.ts` · `tests/ledger-tenant-isolation.test.ts` · `tests/stripe-commercial-guards.test.ts` |
| HTTP | `tests/steward-chat-sales-http.test.ts` · `tests/steward-chat-platform-tenant-http.test.ts` · `tests/steward-chat-product-api.test.ts` · `tests/steward-chat-guest-invite-http.test.ts` |
| E2E | `e2e/steward-chat.product.spec.ts` · `e2e/steward-chat.stripe.spec.ts` · `e2e/steward-chat.tax.spec.ts` |
