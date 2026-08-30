# 統合検証環境 — 外部依存を本物で通す

E2E は速さと再現性のためにスタブで動く。その代わり、**スタブでは壊れようがない
4つの主張**が未検証のまま残る。ここはその4つだけを本物で通す場所。

| 主張する項目 | 本物で通すもの | スタブでは何が測れないか |
|---|---|---|
| OOO-50 / OOO-51 Stripe | `stripe listen` が署名付き webhook を転送 | 署名検証。スタブは署名を作らないので、検証を外しても緑のまま |
| OOO-32〜34 メール送信 | Mailpit への実 SMTP | ハンドシェイクと実配送。dry_run はプロセス内で完結する |
| OOO-45 国家 eID | SiVa JAR + digidoc sidecar（`ORGOS_SIVA_MODE=live`） | 検証結果そのもの。mock は常に TOTAL-PASSED を返す |
| OOO-39 公開リレー | Witness Hub を `0.0.0.0` に bind | 公開インターフェースへの bind。ループバックでは本番形にならない |

## 使い方

```bash
cp deploy/integration/.env.example deploy/integration/.env   # 鍵を記入する
docker compose -f deploy/integration/docker-compose.yaml up -d
docker compose -f deploy/integration/docker-compose.yaml logs stripe-cli | grep whsec_
# 出力された whsec_... を .env の STRIPE_WEBHOOK_SECRET に書き戻す

npm run ooo:integration
```

SiVa の JAR は先に用意する（公式の docker compose はテスト用で本番成果物ではない）。

```bash
bash scripts/setup-siva-mal-mac.sh
```

digidoc sidecar のトークンも先に作る。

```bash
mkdir -p services/secrets
openssl rand -hex 32 > services/secrets/digidoc-sidecar.token
chmod 600 services/secrets/digidoc-sidecar.token
```

## 採点との関係

`npm run ooo:integration` が緑にした領域は
`tests/.ooo-integration-green.json` に記録され、採点の実機20点のうち、
外部依存を持つ項目の裏づけになる。記録が無い項目は、その分の点を得ない。
**環境が無いときに自動で緑にはしない。**

## やらないこと

- WebAuthn の実ハードウェア。CDP 仮想認証器で既に自動化されており、
  実カード・実指紋のみ手動チェックリストに残す
- Stripe の live 鍵。ここは test mode だけを通す
- 本番テナントのデータ。すべて demo テナントで完結させる
