# OrgOS Core — Release process

正本バージョン: `package.json` · `@orgos/cli` · Homebrew Formula は **同一 semver** を揃える。

## 段階 0 チェックリスト

1. `main` で CI green（`validate` · `steward-chat-smoke` · `operator-console-e2e` · `test-docker` · `wire-console-smoke` · **`demo-docker` smoke**）
2. `npm test` · `npm run steward-chat:release-check` · `npm run package:publish-check` · `npm run build:package` · `npm run orgos -- doctor`
3. 変更内容を `CHANGELOG` 相当（PR 本文）に記載
4. タグ付け:

```bash
git tag -a v0.8.0 -m "OrgOS Core 0.8.0 — npm @orgos/cli · workspace model"
git push origin v0.8.0
```

5. GitHub Release を作成（tarball は tag から自動生成 · Release body に Demo Docker pull 例）
6. npm 公開（任意）:

```bash
npm run build:package
npm publish -w @orgos/cli --access public
npm publish -w @orgos/wire --access public
```

7. Homebrew tap: `homebrew-tap/Formula/orgos.rb` の `sha256` を Release tarball の値に更新
8. **Demo Docker:** workflow `demo-docker` が tag / `main` で GHCR に **multi-arch** push。初回は [deploy/demo/PUBLISH.md](deploy/demo/PUBLISH.md) で Package **Public** と Actions **publish** green を確認

```bash
ORGOS_DEMO_IMAGE=ghcr.io/<owner>/orgos-demo:0.8.0 npm run demo:docker:verify-ghcr
```

## アーティファクト

| 配布 | パス | 用途 |
|------|------|------|
| npm `@orgos/cli` | `packages/orgos-cli/` | Core CLI · `ORGOS_HOME` |
| npm `@orgos/wire` | `packages/orgos-wire/` | Wire オプション（peer） |
| Homebrew | `homebrew-tap/Formula/orgos.rb` | `brew install orgos` |
| curl | `install.sh` | `ORGOS_INSTALL_DIR` へ CLI を配置 |
| Demo Docker | `deploy/demo/` · `ghcr.io/<owner>/orgos-demo` | 利用者試用 · **本番禁止** · alpine ~330MB · amd64+arm64 · [demo-docker.md](docs/org-os/demo-docker.md) |

```bash
# GHCR（公開後 · localhost のみ）
docker pull ghcr.io/<owner>/orgos-demo:0.8.0
docker run --rm -p 127.0.0.1:9470:9470 ghcr.io/<owner>/orgos-demo:0.8.0
# 検証: ORGOS_DEMO_IMAGE=... npm run demo:docker:verify-ghcr
# ローカル build: docker compose -f deploy/demo/docker-compose.yaml up --build
```

入口: [docs/quickstart.md](docs/quickstart.md)

## バージョン bump

`package.json` · `packages/orgos-cli/package.json` · `packages/orgos-wire/package.json` · `src/cli.ts` の `--version` · Formula `url` タグを同時に更新する。
