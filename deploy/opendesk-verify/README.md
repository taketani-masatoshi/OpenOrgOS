# openDesk verify stack

公式 openDesk は Kubernetes + Helmfile です。この compose は **同じ公開 API** を話す Community Edition イメージだけを localhost に立てます。AGPL のソースは同梱しません。

## 起動

```bash
orgos integrations opendesk up
orgos integrations opendesk probe
# 下記 env を export してから
orgos integrations opendesk verify
orgos integrations opendesk down
```

Windows / Mac / Linux の Docker Desktop で同じコマンドです。待受は `127.0.0.1` だけです。

| サービス | URL |
|---|---|
| Matrix (Synapse) | `http://127.0.0.1:8008` |
| Nextcloud | `http://127.0.0.1:8081` |
| Keycloak | `http://127.0.0.1:8082` |
| Open-Xchange | profile `groupware` のときだけ `http://127.0.0.1:8083` |

```bash
export ORGOS_MATRIX_BASE_URL=http://127.0.0.1:8008
export ORGOS_MATRIX_USER=ooo-verify
export ORGOS_MATRIX_PASSWORD=opendesk-verify
export ORGOS_MATRIX_SHARED_SECRET=opendesk-verify-shared
export ORGOS_NEXTCLOUD_BASE_URL=http://127.0.0.1:8081
export ORGOS_NEXTCLOUD_USER=admin
export ORGOS_NEXTCLOUD_APP_PASSWORD=opendesk-verify
export ORGOS_KEYCLOAK_BASE_URL=http://127.0.0.1:8082
export ORGOS_KEYCLOAK_REALM=master
```

パスワードは localhost 検証専用です。本番の openDesk には顧客側の URL を向けます。Keycloak は OIDC discovery の疎通だけで、Community SSO は置き換えません。

## OX

`probe` が無認証で CE イメージを引けたときだけ `inclusion` が `confirmed_live` になります。引けなければスタブのまま、`--groupware` は使いません。2026-09-20 の確認では `registry.opencode.de` が無認証を拒否し、メールとカレンダーは未接続です。スタブはネットワークへ出ません。

## ゲート

この compose と CI は公式 openDesk ではありません。

- 回帰は `.github/workflows/opendesk-verify.yml` です。`ubuntu-latest`（x64）で groupware なしの同じ公開 API を再実行します。イメージは Synapse `v1.161.0`、Nextcloud `34.0.4`、Keycloak `26.3.5` に固定しています
- 出荷前に、人が x64 Linux 上の Community Edition へ `ORGOS_*_BASE_URL` を向けます。公式 Helmfile はこのリポジトリに置きません
- `connector_matrix` などの出荷フラグは既定 false です。ローカル疎通ではコンソール接続（`platform_ready`）は開きません。フラグを変えるのは人間です
- Keycloak は OIDC discovery のみです。ユーザー作成、Nubus、Community SSO の置き換えはしません
- 人の画面は Steward Chat のままです。Element、OpenProject、Jitsi、Collabora は入れません

## 境界

将来 OpenCode に出す `openDesk-extension-ooo` は別パッケージです。正本: [opendesk-extension-boundary.md](../../docs/org-os/opendesk-extension-boundary.md)
