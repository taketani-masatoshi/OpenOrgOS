# OrgOS Demo — GHCR 公開チェックリスト（メンテナ向け）

**利用者向け入口:** [docs/quickstart.md](../../docs/quickstart.md) §0  
**設計:** [docs/org-os/demo-docker.md](../../docs/org-os/demo-docker.md)

---

## 1. `main` マージ後 — Actions で B1–B2 を確認

1. GitHub → **Actions** → workflow **`demo-docker`**
2. 最新の `main` push で **smoke** と **publish** が green であること
3. **publish** ジョブ内の `B2 — pull published image and re-accept` が成功していること

手元でも同じ検証:

```bash
# main ブランチのイメージ
ORGOS_DEMO_IMAGE=ghcr.io/<owner>/orgos-demo:main npm run demo:docker:verify-ghcr

# タグ v0.8.0 公開後
ORGOS_DEMO_IMAGE=ghcr.io/<owner>/orgos-demo:0.8.0 npm run demo:docker:verify-ghcr
```

`<owner>` は GitHub の org/user 名（**小文字**）。fork では org 名が変わる。

手動トリガ: Actions → **demo-docker** → **Run workflow**（`workflow_dispatch`）

---

## 2. Package visibility（Public 推奨）

匿名 `docker pull` には **Public** が必要です。

1. GitHub → **Packages** → **orgos-demo**
2. **Package settings** → **Change visibility** → **Public**

Private のままにする場合は利用者に **認証付き pull** を案内（[quickstart.md](../../docs/quickstart.md) §0a）。

### 認証付き pull（Private 時）

```bash
# PAT: read:packages スコープ
echo "$GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
docker pull ghcr.io/<owner>/orgos-demo:main
```

---

## 3. リリースタグ `v*`

`v0.8.0` push で workflow `demo-docker` と `release` が走ります。

| タグ | GHCR イメージタグ |
|------|-------------------|
| `v0.8.0` | `:0.8.0` · `:latest` |
| `main` push | `:main` |

Release 本文にも `docker pull` 例が入ります（`release.yml`）。

---

## 4. 残リスクと対策（実装済み）

| リスク | 対策 |
|--------|------|
| ホストに 9470 を全インターフェース公開 | compose / `docker run` は **`127.0.0.1:9470:9470`** 既定 |
| GHCR 未検証 | `verify-ghcr.sh` · CI publish 末尾 B2 |
| Private package | Public 手順 + PAT pull を quickstart に記載 |
| fork で owner 不一致 | イメージ名を `<owner>` プレースホルダで統一 |
| デモを本番利用 | 全入口に **本番禁止** · [operator-production.md](../../docs/operator-production.md) |

---

## 5. ローカル開発（GHCR なし）

```bash
npm run demo:docker:up
npm run demo:docker:accept
npm run demo:docker:down
```
