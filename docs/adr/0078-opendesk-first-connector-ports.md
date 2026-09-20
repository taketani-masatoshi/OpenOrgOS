# ADR 0078: openDesk ファーストのコネクタ Port と OSS verify

**状態:** Accepted · **日付:** 2026-09-19
**決定者:** OpenOrgOS コアメンテナ

---

## Context

コンソールの外部連携は Slack / Asana / Gmail / Google Drive が第一級に見えていた（[ADR 0070](0070-console-saas-connectors.md)）。正本は OrgOS の YAML / MD のまま、外へ出すものは L1 の写し、という点は維持する。

オフィススイートの正本面は、ZenDiS の openDesk（Matrix / Nextcloud / Open-Xchange / Nubus=OpenLDAP+Keycloak）に合わせる。公式配布は Kubernetes + Helmfile であり、Core に Helm 一式は載せない。代わりに **同じ公開 API を話す Community Edition イメージ** を `deploy/opendesk-verify/` で立て、コネクタが動くことを確認する。

Windows と Google は排除しない。Windows は Docker Desktop 上の検証クライアントとして第一級。Google / Microsoft 365 / Slack は互換出口（写し）に留める。

## Decision

### 1. 能力で切る

| class | inclusion | 例 |
|---|---|---|
| `sovereign` | `confirmed_live` | Matrix · Nextcloud · Keycloak |
| `sovereign` | `stub_unconfirmed` | Open-Xchange（公開 CE イメージが取れるまで） |
| `compat` | `compat_egress` | Gmail · Slack · Asana · Google Drive · Microsoft 365 |

接続 API は `ChatPort` / `FilesPort` / `MailPort` / `CalendarPort` / `IamPort`。既存の Slack / Drive / Gmail 実装は移動せず、compat 側の Port として登録する。

### 2. OSS として確定した部品だけ実機 verify

`orgos integrations opendesk probe` が `docker manifest inspect` で公開イメージを確認する。

2026-09-20 に手元の ARM で疎通した版を固定する。浮動タグ（`latest` / `stable`）は使わない。

| イメージ | 結果 |
|---|---|
| `matrixdotorg/synapse:v1.161.0` | 公開マニフェストあり。メッセージ送信まで確認 |
| `nextcloud:34.0.4` | 公開マニフェストあり。WebDAV 書き込みまで確認 |
| `quay.io/keycloak/keycloak:26.3.5` | 公開マニフェストあり。OIDC discovery まで確認 |
| `registry.opencode.de/bmi/opendesk/components/ox-app-suite:latest` | 無認証では取れない |
| `registry.opencode.de/zendis/opendesk/ox-appsuite:latest` | 2026-09-20 も `access forbidden`。`stub_unconfirmed` のまま |

OX App Suite のコンテナは Open-Xchange の認証付き registry が本線で、openDesk CE の chart は openCode にある。無認証 pull と HTTP 2xx の両方が揃うまで `groupware` profile は既定 off、`pingOx` はネットワークへ出ない。

verify が送る本文は `opendesk verify` のみ。`data/` は Nextcloud の allowlist で拒否する。カメラ映像・GPS・VLM はクラウド worker に載せない（本 ADR では実装しない）。

### 3. 出荷ゲート

本番コンソールから顧客の openDesk へ繋ぐ口は、verify が通ってから Community フラグ（`connector_matrix` 等）を立てる。既定は false。ローカル verify の env が揃っていれば `usable` になるが、Community 接続（`platform_ready`）はフラグのまま。Keycloak は discovery のみで、Community SSO は置き換えない。

### 4. ライセンス境界

Core は Unlicense。AGPL / GPL の上流ソースは同梱しない。compose はイメージ参照のみ。将来 OpenCode に出す `openDesk-extension-ooo` は別パッケージ（Apache-2.0 想定）。境界: [opendesk-extension-boundary.md](../org-os/opendesk-extension-boundary.md)。

### 5. 秘書メールは MailPort

Secretary の受信・送信は `MailPort`（`fetchSince` / `sendMime`）を経由する。Gmail は互換実装。Open-Xchange は同じ口のスタブで、`inclusion !== confirmed_live` のときネットワークへ出ない。IMAP / SMTP は当面 Port 外。送信の最終承認は従来どおり `send-gate` と `chat:approve`。L1 の triage 件数要約は任意で Nextcloud allowlist へ写せる（`orgos mail intake sync --nextcloud-l1`）。

### 6. 今回やらないこと

次はゲートとして残す。この変更では実装しない。

- Open-Xchange のメールとカレンダーの実 HTTP。公開 CE イメージが無認証で取れるまでスタブのまま
- 公式 Helmfile / Kubernetes スイートの同梱と、このリポジトリ上での再現。回帰 CI（`.github/workflows/opendesk-verify.yml`）は ubuntu x64 で同じ公開 API を再実行するだけである。出荷前に、人が x64 の Community Edition へ `ORGOS_*_BASE_URL` を向ける
- 出荷フラグ（`connector_matrix` など）を立てること。既定は false。ローカル疎通では `platform_ready` を立てない。フラグを変えるのは人間
- Keycloak でのユーザー作成、Nubus（OpenLDAP）、Community SSO の置き換え。Keycloak は OIDC discovery のみ
- Element、OpenProject、Jitsi、Collabora。人の画面は Steward Chat のまま

## Consequences

### Positive

- 公開イメージがある部品は手元で疎通できる
- Big Tech を消さずに、正本面を openDesk 側へ移せる
- OX が未確定でもスタブが外へ出さない

### Negative

- 公式 openDesk クラスタそのものは再現しない。顧客環境へ `base_url` を向ける
- Synapse の signing key 生成はイメージ内の Python に依存する
- OX の実 Mail/Calendar API は probe 成功まで未接続

## 関連

- [0070-console-saas-connectors.md](0070-console-saas-connectors.md)
- [connectors.md](../org-os/ooo-surfaces/connectors.md)
- [deploy/opendesk-verify/README.md](../../deploy/opendesk-verify/README.md)
