# DigiDoc / National eID Runbook (hardened D2/D3)

**ADR:** [0014](../adr/0014-pdf-esign-national-eid.md) · **Plan:** [pdf-esign-digidoc-plan.md](./pdf-esign-digidoc-plan.md) · **Acceptance:** [pdf-esign-production-acceptance.md](./pdf-esign-production-acceptance.md)

## 思想

- 保証 = **国家 eID**（EE DigiDoc / SiVa）。OrgOS は台帳・承認・SiVa 要約 digest の記録のみ。
- 商用 ESP 禁止。
- `ORGOS_SIVA_MODE=mock` は **CI / 単体テスト専用**。`status=completed`（国家検証完了）にはならない。
- 会社の設立国（例 JP）と署名スタック（例 EE DigiDoc）は分離してよい。

## 環境変数

| 変数 | 意味 |
|------|------|
| `ORGOS_SIVA_MODE` | `live`（既定）· `mock`（明示時のみ） |
| `ORGOS_SIVA_BASE_URL` | SiVa base（本番は **HTTPS**） |
| `ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK` | `1` で `http://127.0.0.1` / `localhost` のみ許可 |
| `ORGOS_DIGIDOC_SIDECAR_URL` | digidoc4j sidecar |
| `ORGOS_DIGIDOC_SIDECAR_TOKEN` | Bearer token（または `ORGOS_DIGIDOC_SIDECAR_TOKEN_FILE`） |

## 接続情報ストア（env を触らない既定経路）

env を書き換えずに接続情報を保存する。保存先は `data/secrets/esign-secrets.env`（gitignore · `0600`）。**deploy の env が優先**、ストアは空きを埋めるだけ。

```bash
orgos operations esign endpoints set \
  --siva-url http://127.0.0.1:8080 --siva-mode live \
  --sidecar-url http://127.0.0.1:9090 \
  --sidecar-token "$(cat services/secrets/digidoc-sidecar.token)" \
  --allow-http-loopback 1

orgos operations esign endpoints show   # トークンはマスク表示のみ
orgos operations esign ready --json
```

sidecar token は L2。`show` · `ready` · BFF いずれもマスク済み hint しか返さない（[data-classification](../../.cursor/rules/data-classification.mdc)）。

## テナント設定

```yaml
# data/pdf-esign/national-eid.yaml
version: 1
active_stack: EE/digidoc
# siva_base_url: https://siva.example.internal
# digidoc_sidecar_url: http://127.0.0.1:9090

# data/pdf-esign/digidoc.yaml（任意 · 優先）
version: 1
allow_http_loopback: false   # 本番 false · ローカルのみ true
siva_timeout_ms: 30000
sidecar_timeout_ms: 60000
max_pdf_bytes: 26214400
max_asice_bytes: 41943040
```

## digidoc4j サイドカー

```bash
mkdir -p services/secrets
openssl rand -hex 32 > services/secrets/digidoc-sidecar.token
chmod 600 services/secrets/digidoc-sidecar.token

docker compose -f services/docker-compose.digidoc.yml up --build -d digidoc-sidecar

export ORGOS_DIGIDOC_SIDECAR_URL=http://127.0.0.1:9090
export ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK=1
export ORGOS_DIGIDOC_SIDECAR_TOKEN="$(cat services/secrets/digidoc-sidecar.token)"
```

Compose は `127.0.0.1:9090` のみ公開 · read-only rootfs · memory limit · healthcheck。

## SiVa（本番）

公式 **docker compose は testing only**（open-eid/SiVa README）。本番は:

1. SiVa を Maven で `siva-webapp-*-exec.jar` としてビルド  
2. 専用 OS ユーザで systemd（または同等）実行  
3. **TLS 終端は reverse proxy**（OrgOS からは `https://…`）  
4. OCSP / TSP へ egress 可能であること  
5. `ORGOS_SIVA_MODE=live` · `ORGOS_SIVA_BASE_URL=https://…`

参考: [SiVa deployment](https://open-eid.github.io/SiVa/siva3/deployment/) · [system integrator guide](https://open-eid.github.io/SiVa/)

### SiVa（MAL Mac · 当面ホスト）

**専用手順:** [pdf-esign-siva-mal-mac.md](./pdf-esign-siva-mal-mac.md)

```bash
bash scripts/setup-siva-mal-mac.sh install-deps
bash scripts/setup-siva-mal-mac.sh build
bash scripts/setup-siva-mal-mac.sh start
eval "$(bash scripts/setup-siva-mal-mac.sh env)"
npm run siva:mal-mac:probe
```

OCSP / TSP へのアウトバウンドが Mac ファイアウォールで塞がれていないこと。
## 運用手順（既定は Console `/?esign=1`）

1. 案件を作成（PDF を選択 · `chat:approve`）
2. 「骨組み生成」で `work_dir/unsigned.asice` を作る
3. **DigiDoc4 とカードで署名**（署名者の端末。PIN・鍵はサーバに来ない）
4. 署名済み `.asice` を選んで「署名済みを添付」— 構造検査 + 元 PDF digest 照合
5. 「SiVa 検証」— live の `TOTAL-PASSED` のみ `completed`

BFF: `GET /chat/v1/esign/ready` · `/cases`、`POST /chat/v1/esign/create` · `/prepare` · `/attach` · `/verify`。

### CLI（同じ lib を通る）

```bash
npm run orgos -- operations esign ready --json
npm run orgos -- operations esign create --pdf ./contract.pdf --title "NDA" --provider digidoc
npm run orgos -- operations esign prepare --id ES-… --skeleton
npm run orgos -- operations esign send --id ES-… --allow-unapproved   # 本番は --approval-id

# DigiDoc4 で work_dir/unsigned.asice（または PDF）を開きカード署名 → signed.asice
npm run orgos -- operations esign accept-live --id ES-… --asice ./signed.asice --json
# または attach-container + verify-digidoc --siva-mode live
```

| 結果 | 意味 |
|------|------|
| `nationally_verified: true` · `status: completed` | live SiVa が全署名 `TOTAL-PASSED` |
| `siva_mode: mock` · `partially_signed` | テスト経路 — 国家完了ではない |
| `status: failed` | 改ざん · schema 不正 · SiVa 非 PASSED · URL ポリシー拒否 等 |

台帳に残すもの（L1）: `siva_indication` · `siva_response_digest` · counts · timestamp。SiVa 全文レポートは保存しない。

## 監視・障害

| 症状 | 確認 |
|------|------|
| `siva_https_required` | 本番 URL を HTTPS に |
| `siva_http_loopback_denied` | `ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK=1`（ローカルのみ） |
| `siva_timeout` / `siva_unreachable` | SiVa プロセス · ネットワーク · OCSP |
| `sidecar_auth_rejected` | token 不一致 |
| `sidecar_asice_invalid:*` | digidoc4j 応答が ASiC として不合格 — サイドカー再ビルド |

ロールバック: ケースを `failed` のまま保持し、正しい `.asice` を再 attach → `accept-live`。容器 digest 不一致は自動 FAILED。
