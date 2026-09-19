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

`probe` が無認証で CE イメージを引けたときだけ `inclusion` が `confirmed_live` になります。引けなければスタブのまま、`--groupware` は使いません。2026-09-19 の確認では公開マニフェストは取れませんでした。

## 境界

将来 OpenCode に出す `openDesk-extension-ooo` は別パッケージです。正本: [opendesk-extension-boundary.md](../../docs/org-os/opendesk-extension-boundary.md)
