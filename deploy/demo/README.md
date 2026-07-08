# OrgOS Demo — Docker All-in-one

**利用者入口（推奨）:** [docs/quickstart.md](../../docs/quickstart.md) §0  
**設計正本:** [docs/org-os/demo-docker.md](../../docs/org-os/demo-docker.md)  
**GHCR 公開手順:** [PUBLISH.md](PUBLISH.md)  
**用途:** 手元で試す（利用者獲得）· **本番禁止**

## すぐ試す

```bash
# GHCR（Public パッケージ · main マージ後）
docker pull ghcr.io/orgos-reference/orgos-demo:main
docker run --rm -p 127.0.0.1:9470:9470 ghcr.io/orgos-reference/orgos-demo:main

# 永続 workspace
docker volume create orgos-demo-workspace
docker run -d --name orgos-demo -p 127.0.0.1:9470:9470 \
  -v orgos-demo-workspace:/workspace \
  ghcr.io/orgos-reference/orgos-demo:main

# リポジトリルートから build
docker compose -f deploy/demo/docker-compose.yaml up --build
bash deploy/demo/acceptance.sh
```

Private パッケージ: `docker login ghcr.io` — [quickstart.md](../../docs/quickstart.md) §0a

## 検証・公開（メンテナ）

```bash
ORGOS_DEMO_IMAGE=ghcr.io/orgos-reference/orgos-demo:main npm run demo:docker:verify-ghcr
```

手順: [PUBLISH.md](PUBLISH.md) · CI: `.github/workflows/demo-docker.yml`

ブラウザ: http://127.0.0.1:9470/ · http://127.0.0.1:9470/wire/

## ファイル

| ファイル | 役割 |
|----------|------|
| `docker-compose.yaml` | ローカル build · `127.0.0.1:9470` バインド |
| `Dockerfile` | alpine · multi-arch（CI） |
| `verify-ghcr.sh` | B1–B2 手元検証 |
| `PUBLISH.md` | main マージ · Package Public |
| `acceptance.sh` | A1–A3 |

## 本番へ行きたいとき

このイメージは使わない。[docs/operator-production.md](../../docs/operator-production.md) · `orgos init` — [quickstart.md](../../docs/quickstart.md)「次のステップ」
