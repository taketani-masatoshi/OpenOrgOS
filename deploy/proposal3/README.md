# Proposal 3 — 常駐デーモン

Org C（中立 relay + WTA）と Mac mini 当事者（mal / southwood）の常駐構成。

## 1. PKI + クライアント設定

```bash
npm run proposal3:setup
# または
npm run orgos -- protocol tls init-proposal3
```

生成物:

| パス | 内容 |
|------|------|
| `data/proposal3-pki/` | dev CA · server · client 鍵（gitignore） |
| `tenants/aiac/data/protocol/tls/org-c-api.json` | Org C サーバ TLS メタ |
| `tenants/{mal,southwood}/data/protocol/protocol-api-client.yaml` | mTLS クライアント |
| `deploy/proposal3/env/*.generated.env` | systemd 用 env |

## 2. 開発（フォアグラウンド）

```bash
# ターミナル 1 — Org C
npm run proposal3:org-c-api

# ターミナル 2 — MAL relay
npm run proposal3:party-relay -- mal

# ターミナル 3 — southwood relay
npm run proposal3:party-relay -- southwood
```

## 3. systemd（Linux · Org C ホスト）

```bash
sudo cp deploy/proposal3/systemd/steward-org-c-api.service /etc/systemd/system/
sudo cp deploy/proposal3/env/org-c-api.generated.env /etc/steward/org-c-api.env
sudo systemctl daemon-reload
sudo systemctl enable --now steward-org-c-api
```

当事者 relay（テンプレート）:

```bash
sudo cp deploy/proposal3/systemd/steward-party-relay@.service /etc/systemd/system/
sudo cp deploy/proposal3/env/party-relay-mal.generated.env /etc/steward/party-relay-mal.env
sudo systemctl enable --now steward-party-relay@mal
```

## 4. launchd（macOS · Mac mini）

```bash
npm run proposal3:daemon-smoke   # 24h 試験前ゲート（必須）
bash deploy/proposal3/launchd/install-macos.sh mal
bash deploy/proposal3/launchd/install-macos.sh aiac   # Org C API
```

手動の場合 — `ProgramArguments` の tenant id を合わせる。

## 5. 24h 常駐試験（Mac mini）

| 時点 | 確認 |
|------|------|
| 直後 | `npm run proposal3:daemon-smoke` · `launchctl list \| grep steward` |
| 1h | `tail /tmp/steward-*.log` · relay エラーなし |
| 24h | `npm run orgos -- --tenant mal protocol tls verify` · Wire Console で 1 通デモ |

## 6. TLS ローテーション（本番）

```bash
npm run orgos -- --tenant aiac protocol tls rotate
npm run orgos -- --tenant mal protocol tls rotate
# PEM 更新 → デーモン再起動 →
npm run orgos -- --tenant mal protocol tls verify
npm run proposal3:daemon-smoke
```

## 7. デモ seed

```bash
npm run demo:wire-console-three-org
```

seed 実行時も HTTPS + mTLS で Org C API を起動し、client yaml を書き込む。

*版: 2026-06-28*
