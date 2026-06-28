# orgos-reference/homebrew-tap

```bash
brew tap orgos-reference/tap
brew install orgos          # Core CLI
brew install orgos-wire     # Wire overlay（任意 · @orgos/wire peer）
```

初回:

```bash
mkdir ~/my-orgos && cd ~/my-orgos
orgos workspace init
orgos init demo --name "Demo Corp"
orgos doctor
```

Formula の `sha256` は GitHub Release `v*` tarball 公開後に [Formula/orgos.rb](Formula/orgos.rb) を更新してください。初回は `brew install --build-from-source ./Formula/orgos.rb` でローカル検証できます。

Quickstart: リポジトリ内 [docs/quickstart.md](../docs/quickstart.md)
