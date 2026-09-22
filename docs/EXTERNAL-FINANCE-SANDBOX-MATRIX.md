# Sandbox調査結果

| Provider | Sandbox | 認証/接続 | 実装判断 |
|---|---|---|---|
| GMOあおぞら | `sunabar`（API実験場） | OAuth 2.0 / OIDC。仕様は開発者ポータルで確認、実利用は契約が必要 | 実アカウントのprivate access契約とポータル仕様を受領後に実装 |
| Wise | `https://api.wise-sandbox.com` / mTLS endpoint | Sandbox client credentials、OAuth、API token、必要に応じてmTLS。BusinessはGBP/USD/EURを優先 | Sandbox tokenで残高・取引履歴を接続可能。実データをSandboxへ送らない |
| UPSIDER | `https://sandbox.api.upsider.co.jp` | `sk_test_` API key | テストキー取得後、Data APIの実レスポンスをfixture化して実装 |
| PayPal | `https://api-m.sandbox.paypal.com` | Sandbox client id/secret、Webhook ID、署名検証APIまたは証明書 | Webhook受信は可能。PayPal専用検証を接続する |
| PayPay | `https://apigw.sandbox.paypay.ne.jp` | Sandbox API key/secret、HMAC、merchant ID | SandboxキーでSDK/APIを接続。決済状態は推奨ポーリングとWebhookを併用 |

## 受入条件

1. 実データをSandboxへ送らない。
2. 本番・Sandboxのエンドポイントと秘密情報を別ファイルで管理する。
3. 署名検証前に正規化・永続化しない。
4. 同一イベントの再送は一件にする。
5. API権限、レート制限、ページング、失敗再試行をfixtureとSandboxで記録する。

GMOは公式にsunabarを案内しているが、本番API利用には契約が必要。WiseはSandboxとSimulation APIを提供し、Businessの安定したテスト地域・通貨を限定している。UPSIDERはsandbox URLと`sk_test_`キーを案内している。PayPalはSandbox APIとWebhook検証、PayPayはSandboxキー・SecretとHMACを案内している。各社のURL・仕様は契約・アカウント状態で変わり得るため、設定値をコードに埋め込まず環境設定から注入する。
