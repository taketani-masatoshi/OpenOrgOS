# OrgOS Quickstart

**Core のインストール** と **会社 workspace** は分離します。

- **Install（Core）** — `ORGOS_HOME`: `steward/` · `schemas/` · コンパイル済み CLI
- **Workspace** — `ORGOS_WORKSPACE` または cwd の `orgos.yaml` + `tenants/`

---

## 1. インストール

### 開発リポジトリ（参照実装）

```bash
git clone <repo-url> orgos-reference && cd orgos-reference
npm install
npm run orgos -- doctor
```

### npm（段階 1）

```bash
npm install -g @orgos/cli
export ORGOS_HOME="$(npm root -g)/@orgos/cli"   # bin/orgos.js が自動設定
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
```

---

## 4. Wire（オプション · 段階 4）

Proposal 3（Org C relay + mTLS）:

```bash
npm install -g @orgos/wire    # peer: @orgos/cli
orgos wire setup              # dev PKI · protocol-api-client.yaml
orgos wire console build      # SPA（doctor で確認）
orgos wire console start
```

詳細: [deploy/proposal3/README.md](../deploy/proposal3/README.md)

---

## トラブルシュート

| 症状 | 対処 |
|------|------|
| `Framework missing — set ORGOS_HOME` | Core 未インストール · `orgos doctor` |
| `No workspace` | `orgos workspace init` |
| `Wire Console not built` | `orgos wire console build` |
| OpenSSL なし | macOS: Xcode CLT · Linux: `openssl` パッケージ |
