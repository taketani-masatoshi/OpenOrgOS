# OrgOS Quickstart

**いちばん早い試し方は Docker。** Core インストールや git clone は「自社データを作りたい」「開発する」ときで十分です。

| 層 | 目的 | 所要 |
|----|------|------|
| **A. 試す** | Operator Console をブラウザで見る | Docker · 数分 |
| **B. 自社で試す** | `orgos init` で workspace | npm / brew · 30 分 |
| **C. 開発** | 参照実装 · テスト · PR | git clone · 環境構築 |
| **D. 本番** | 常駐・認可・TLS | [operator-production.md](operator-production.md) · **Demo イメージ禁止** |

設計正本（Demo Docker）: [org-os/demo-docker.md](org-os/demo-docker.md)

---

## 0. いちばん早い試し方（Docker · 推奨）

**前提:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) または Docker Engine（Mac · Windows · Linux）

### 0a. 公開イメージ（GHCR · 最短）

`main` マージまたは `v*` タグで workflow [`demo-docker`](../.github/workflows/demo-docker.yml) が公開します。

**イメージ名:** `ghcr.io/<owner>/orgos-demo:<tag>`  
`<owner>` = GitHub の org/user（**小文字**）。fork では自分の org 名に置き換えてください。

| きっかけ | タグ例 |
|----------|--------|
| `main` push | `:main` |
| タグ `v0.8.0` | `:0.8.0` · `:latest` |

#### Public パッケージ（推奨 · 匿名 pull 可）

メンテナ: GitHub → **Packages** → `orgos-demo` → **Public**（手順 [deploy/demo/PUBLISH.md](../deploy/demo/PUBLISH.md)）

```bash
export ORGOS_DEMO_IMAGE=ghcr.io/taketani-masatoshi/orgos-demo:main
docker pull "$ORGOS_DEMO_IMAGE"
docker run --rm -p 127.0.0.1:9470:9470 "$ORGOS_DEMO_IMAGE"
```

#### Private パッケージ（認証付き pull）

```bash
# PAT に read:packages が必要
echo "$GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
export ORGOS_DEMO_IMAGE=ghcr.io/taketani-masatoshi/orgos-demo:main
docker pull "$ORGOS_DEMO_IMAGE"
docker run --rm -p 127.0.0.1:9470:9470 "$ORGOS_DEMO_IMAGE"
```

#### 永続 volume 付き `docker run`（workspace を残す）

```bash
docker volume create orgos-demo-workspace
docker run -d --name orgos-demo \
  -p 127.0.0.1:9470:9470 \
  -v orgos-demo-workspace:/workspace \
  ghcr.io/taketani-masatoshi/orgos-demo:main
# 停止: docker stop orgos-demo && docker rm orgos-demo
# データ削除: docker volume rm orgos-demo-workspace
```

#### 公開後の検証（B1–B2 · メンテナ／利用者）

```bash
# Actions の publish 成功後、手元で同じ確認
ORGOS_DEMO_IMAGE=ghcr.io/taketani-masatoshi/orgos-demo:main npm run demo:docker:verify-ghcr
```

`main` マージ直後は Actions → **demo-docker** → **publish** が green であることを確認してください。

### 0b. リポジトリから build（常に使える）

```bash
git clone <repo-url> orgos-reference && cd orgos-reference
docker compose -f deploy/demo/docker-compose.yaml up --build
```

ブラウザ:

| URL | 内容 |
|-----|------|
| http://127.0.0.1:9470/ | Steward Chat（デモ · auth オフ） |
| http://127.0.0.1:9470/wire/ | Wire Console |
| http://127.0.0.1:9470/health | ヘルスチェック |

受け入れスモーク（compose 起動後）:

```bash
bash deploy/demo/acceptance.sh
```

停止（compose）:

```bash
docker compose -f deploy/demo/docker-compose.yaml down
```

### 注意（デモ専用）

- **本番利用禁止** — TLS · 認可 · Operator レジストリは弱い／オフです
- **ホストは localhost のみ** — `-p 127.0.0.1:9470:9470`（LAN 公開しない）
- Workspace は compose の volume または `docker run -v orgos-demo-workspace:/workspace`
- LLM は既定モック（`ORGOS_LLM_MOCK=1`）。実キーは [deploy/demo/env/demo.env.example](../deploy/demo/env/demo.env.example)
- CI: `.github/workflows/demo-docker.yml` · multi-arch · 公開手順 [deploy/demo/PUBLISH.md](../deploy/demo/PUBLISH.md)
- イメージサイズ目安: ~330MB（alpine）

詳細: [deploy/demo/README.md](../deploy/demo/README.md) · [org-os/demo-docker.md](org-os/demo-docker.md)

---

## 1. Core のインストール（自社 workspace · 開発）

**Core**（`ORGOS_HOME`）と **会社 workspace**（`ORGOS_WORKSPACE`）は分離します。

### npm（段階 1）

```bash
npm install -g @orgos/cli
orgos doctor
```

### Homebrew（段階 2）

```bash
brew tap orgos-reference/tap
brew install orgos
orgos doctor
```

### curl（段階 2 中間）

```bash
curl -fsSL https://raw.githubusercontent.com/orgos-reference/orgos/main/install.sh | bash
orgos doctor
```

### 開発リポジトリ（参照実装）

```bash
git clone <repo-url> orgos-reference && cd orgos-reference
npm install
npm run orgos -- doctor
```

---

## 2. 会社 workspace

```bash
mkdir ~/my-company-orgos && cd ~/my-company-orgos
orgos workspace init --name "My Company"
# または workspace + tenant を一度に:
orgos init acme --name "ACME Corp" --from rental
orgos doctor
export ORGOS_TENANT=acme
orgos validate
```

`orgos workspace show` で解決パスを確認できます。

---

## 3. 日常 ops

```bash
export ORGOS_TENANT=acme
orgos validate
orgos status
orgos modules list
orgos ops daily
orgos controls list          # 有効 ISO の統制一覧
orgos compliance gap         # REG + 統制ギャップ
orgos agent readiness --min 90 # 全 Agent 完成度（厳し目）
orgos agent pulse --extensions
```

---

## 4. Wire（オプション）

Proposal 3（Org C relay + mTLS）:

```bash
npm install -g @orgos/wire    # peer: @orgos/cli
orgos wire setup              # dev PKI · protocol-api-client.yaml
orgos wire console build      # SPA（doctor で確認）
orgos wire console start
```

詳細: [deploy/proposal3/README.md](../deploy/proposal3/README.md)

---

## 次のステップ（Demo のあと · B 層）

デモで UI を触ったら、**自社 workspace** は Core を入れて `orgos init` します（Demo イメージの `/workspace` は本番に使わない）。

```bash
npm install -g @orgos/cli
mkdir ~/my-company-orgos && cd ~/my-company-orgos
orgos init acme --name "ACME Corp" --from rental && orgos validate
```

本番常駐は [operator-production.md](operator-production.md) — Demo Docker は使いません。

---

## トラブルシュート

| 症状 | 対処 |
|------|------|
| `docker pull` 失敗 · `denied` | Package を Public にするか `docker login ghcr.io`（§0a）· [PUBLISH.md](../deploy/demo/PUBLISH.md) |
| GHCR イメージの動作確認 | `ORGOS_DEMO_IMAGE=ghcr.io/<owner>/orgos-demo:main npm run demo:docker:verify-ghcr` |
| Docker: port 9470 使用中 | 他プロセスを止めるか compose の `ports` を変更 |
| Docker: `Cannot connect to the Docker daemon` | Docker Desktop / Engine を起動 |
| Docker: health が来ない | `docker compose -f deploy/demo/docker-compose.yaml logs` · 120 秒待つ |
| `Framework missing — set ORGOS_HOME` | Core 未インストール · `orgos doctor` |
| `No workspace` | `orgos workspace init` |
| `Wire Console not built` | `orgos wire console build` |
| OpenSSL なし | macOS: Xcode CLT · Linux: `openssl` パッケージ |

本番運用: [operator-production.md](operator-production.md) · [runbook-orgos.md](runbook-orgos.md)
