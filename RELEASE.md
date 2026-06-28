# OrgOS Core — Release process

正本バージョン: `package.json` · `@orgos/cli` · Homebrew Formula は **同一 semver** を揃える。

## 段階 0 チェックリスト

1. `main` で CI green（`validate` · `test-docker` · `wire-console-smoke`）
2. `npm test` · `npm run build:package` · `npm run orgos -- doctor`
3. 変更内容を `CHANGELOG` 相当（PR 本文）に記載
4. タグ付け:

```bash
git tag -a v0.8.0 -m "OrgOS Core 0.8.0 — npm @orgos/cli · workspace model"
git push origin v0.8.0
```

5. GitHub Release を作成（tarball は tag から自動生成）
6. npm 公開（任意）:

```bash
npm run build:package
npm publish -w @orgos/cli --access public
npm publish -w @orgos/wire --access public
```

7. Homebrew tap: `homebrew-tap/Formula/orgos.rb` の `sha256` を Release tarball の値に更新

## アーティファクト

| 配布 | パス | 用途 |
|------|------|------|
| npm `@orgos/cli` | `packages/orgos-cli/` | Core CLI · `ORGOS_HOME` |
| npm `@orgos/wire` | `packages/orgos-wire/` | Wire オプション（peer） |
| Homebrew | `homebrew-tap/Formula/orgos.rb` | `brew install orgos` |
| curl | `install.sh` | `ORGOS_INSTALL_DIR` へ CLI を配置 |

## バージョン bump

`package.json` · `packages/orgos-cli/package.json` · `packages/orgos-wire/package.json` · `src/cli.ts` の `--version` · Formula `url` タグを同時に更新する。
