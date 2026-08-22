# iPhone PassKey（業界標準 QR）実装計画

**日付:** 2026-08-19  
**対象:** OpenOrgOS Operator（OOO）が運用する Operator Console（ログイン Touch ID + 高額承認 step-up）  
**正本:** 本書 · 会社イベント: テナント `mal` `docs/company/events/2026-08/`（CLI 発行）  
**関連:** [ADR 0037](../adr/0037-dual-passkey-settlement-stepup.md) · [Passkey Central — Cross-Device Sign-In](https://www.passkeycentral.org/design-guidelines/optional-patterns/cross-device-sign-in)

調査対象は 2026-08-19 時点の公開仕様・サポート文書（Google、GitHub、Microsoft Entra、Apple、Amazon / Shopify / KAYAK の公開事例、FIDO Alliance / W3C）。

---

## 1. 調査結論（先に）

他社の Web PassKey で iPhone + QR を使うとき、**サイトが QR 画像を描画することはない**。サイトは `navigator.credentials.create` / `get` を呼び、**Chrome / Safari / Edge が FIDO hybrid（旧 caBLE）の QR を出す**。iPhone のカメラがその QR を読む。Bluetooth 近接確認のあと、秘密鍵は iPhone から出ない。

Passkey Central（KAYAK を題材にした FIDO 公式 UX 研究）は次を明示している。

> クロスデバイス QR の画面文言はサービス提供者が変えられない。サイト側で QR の仕組みを説明しすぎない。ヘルプは別ページに置く。

したがって OOO 実装の正しい形は「承認用 URL の自前 QR」でも「approve サイトをポップアップして QR を待つ」でもなく、**Mac のコンソール上で WebAuthn セレモニーを開始し、ブラウザ標準 QR に任せる**ことである。

---

## 2. 他社事例（複数）

| サービス | iPhone + QR の出し方 | サイトが描く QR | RP / 鍵の置き方 | OOO への示唆 |
|---|---|---|---|---|
| **Google アカウント** | パソコンで「パスキーを使う」→ 画面に QR → iPhone カメラ → Face ID。Bluetooth 必須 | いいえ（Chrome UI） | 1 RP（google.com）。同期鍵（Google パスワード マネージャー / iCloud）が主。無い端末では hybrid | ログインは同期鍵を優先。QR は「この PC に鍵が無い」ときの標準経路 |
| **GitHub** | 「Sign in with a passkey」→ ブラウザが nearby device を提示 → QR またはプッシュ → iPhone Face ID | いいえ | 1 RP（github.com）。iCloud 同期なら Mac でも同じ鍵 | セレモニーはログインページ上。別ホストに飛ばさない |
| **Microsoft Entra ID** | 同一デバイス / クロスデバイス（QR）/ FIDO2 セキュリティキー | いいえ | 同期鍵（利便）と **device-bound**（Authenticator アプリ、高保証）を用途で分ける。Attestation を強制すると同期鍵は不可 | 高額承認は「同期させない・電話に閉じる」なら Entra の device-bound に近い |
| **Apple（Safari / システム）** | 「近くのデバイスのパスキー」で QR。作成時は「カメラ付きデバイスに保存」 | いいえ | iCloud キーチェーン同期が既定。他人の PC では hybrid | 作成も認証も OS ダイアログ。RP はサイト origin |
| **Amazon** | 大規模導入。モバイルではパスキーを既定に寄せる、と公開 | サイト独自 QR ではない（一般的 WebAuthn） | 1 アカウント RP | 日常ログインは摩擦を下げ、高リスク操作は別ポリシー |
| **Shopify Shop Pay** | SMS の代わりにパスキー | 標準 WebAuthn | 決済に近いが **同一チェックアウト origin** | 「決済だから別ドメインで QR」ではない |
| **KAYAK（Passkey Central 研究）** | 同期が最速。QR は共有 PC 向け。半数が QR を面倒と感じる | いいえ | 研究用にクロスデバイスを検証 | 信頼できる Mac では QR を強制しない。高額だけ QR を出すのはユーザーに説明しやすい |

共通技術:

- W3C WebAuthn `authenticatorTransport: "hybrid"`
- FIDO Proximity Exchange / caBLE（QR + BLE 近接 + トンネル）
- クライアントは `@simplewebauthn/browser` または `PublicKeyCredential.parse*FromJSON`（どちらもサイトは QR を生成しない）

---

## 3. 現行 OOO 実装との差分

いまの Dual PassKey（ADR 0037）は次が業界とずれている。

| 項目 | 他社 | 現行 |
|---|---|---|
| QR の主体 | ブラウザ / OS | 一時は自前 URL QR。その後 approve ポップアップ上の hybrid |
| セレモニー origin | ログインしているそのページ | 決済 RP（`localhost:4178`）へ逃がす |
| RP ID | サイト 1 つ（github.com 等） | ~~ログイン `127.0.0.1` と決済 `localhost` の 2 RP~~ → **2026-08-22 修正: 単一 `localhost`（本番は公開 HTTPS ホスト）** |
| 同期 | ログインは同期を歓迎 | 高額鍵を Mac に載せたくない（脅威モデルは妥当） |
| UX コピー | OS ダイアログに任せる | 「ブラウザが QR を出します」とサイトが説明しすぎ |

2 RP と approve 静的サイトは、iPhone に **サイトを開かせる** 前提（自前 QR）から来ている。hybrid では iPhone はサイトを開かない。したがって **approve ホストはセレモニーに不要** になる。

高額承認で「Mac の Touch ID だけでは足りない」という要件は他社にもある（Entra の device-bound、銀行の step-up）。手段は **同じ RP 上の別 credential**（purpose=settlement）に `get({ hints: ["hybrid"] })` すれば足りる。iPhone が署名し、Mac のページが assertion を API に返す。

---

## 4. 採択する設計（再検討後）

### 4.1 変えないもの

- ログイン PassKey = Mac プラットフォーム（Touch ID）。セッション Cookie。
- 高額（REG-004 B/C）= セッションだけでは足りない。settlement 用途の WebAuthn が必須。
- クライアントライブラリ = `@simplewebauthn/browser`（業界で広く使う薄いラッパ）。自前 QR ライブラリは使わない。
- L2 をチャットや QR 断片に出さない。

### 4.2 変えるもの

1. **セレモニーは Operator Console の Mac ページで完結する。** 予算承認モーダル / 「iPhone で登録」ボタンは、その場で `create` / `get` する。ポップアップで `localhost:4178` を開かない。
2. **RP ID はコンソールと揃える（ローカルは `localhost` のみ — IP は WebAuthn RP ID に使えない、[web.dev](https://web.dev/articles/webauthn-rp-id)）。** settlement 鍵も同じ RP。`purpose: settlement` でログイン用と区別する。
3. **QR はブラウザに任せる。** `hints: ["hybrid"]` と `allowCredentials[].transports` に `hybrid` を付ける。サイトは QR 画像を出さない。
4. **approve 静的サイトは廃止またはヘルプ専用。** セレモニー origin にしない。
5. **同期を抑える（高額鍵）。** `authenticatorAttachment: "cross-platform"` + hybrid で「カメラ付きデバイスに保存」経路を優先し、Mac の iCloud 同期鍵だけでは B/C を通さない（allowCredentials が settlement id のみ）。
6. **ローカルで iPhone が `127.0.0.1` を開く必要はない。** hybrid トンネルがセレモニーを運ぶ。Bluetooth オンが操作条件。

### 4.3 脅威モデル（なぜ Dual RP を捨ててよいか）

Dual RP の意図は「コンソール XSS が settlement 鍵を使えない」ことだった。同一 RP でも:

- XSS が `get()` を呼んでも **hybrid なら iPhone のユーザー確認が要る**
- allowCredentials を settlement に限定すれば Mac Touch ID の login 鍵では通らない

残る差は「悪意あるスクリプトがユーザーを誘導して iPhone 承認させる」ことであり、これは Dual RP でも approve ページを開ければ同じ。業界（GitHub / Google）も step-up を同一 origin で行う。

本番は **HTTPS の単一ホスト** が必須（WebAuthn の安定条件）。Hobby の `approve.oorgos.org` をセレモニー RP にする必要はなくなる。

---

## 5. フェーズ

### フェーズ 0 — 合意（本計画）

- [x] 他社調査
- [x] CEO / OOO が「セレモニーはコンソール origin + ブラウザ QR」を承認（フェーズ 1 着手）

### フェーズ 1 — Mac 上 hybrid（登録）

- [x] Steward Chat / Wire の「iPhone で登録」は **現在の origin** で `POST .../webauthn/register/options`（`purpose=settlement`）→ `create`（hints hybrid）
- [x] origin リダイレクト — `127.0.0.1` で開いても **`localhost` に統一**（IP は RP ID 不可）
- [x] PasskeySetupCard から approve URL / ポップアップを削除
- [x] コピーは短く「iPhone のカメラで、ブラウザの QR を読む」

### フェーズ 2 — Mac 上 hybrid（承認）

- [x] B/C 承認は **SettlementPasskeyModal** を **QR 待ち UI ではなく**「ブラウザの PassKey シートを開いています」にする
- [x] assertion はコンソール origin で取得（`completeSettlementPasskey` · clientData.origin がコンソール）
- [x] サーバの origin 検証を **WIRE_CONSOLE_WEBAUTHN_ORIGIN** に合わせる（`rpId()` 共通）
- [x] `qr_url` は `?help=1` の非推奨ヘルプリンク。新規 UI は使わない

### フェーズ 3 — 静的 approve の縮小

- [x] `sites/approve` をヘルプ HTML のみ（セレモニー JS なし）
- [x] docker `approve` はローカル説明用（必須経路から外す）
- [x] ADR 0037 Decision 3/5 をコンソール RP + hybrid に改訂

### フェーズ 4 — 本番 RP

- [x] 手順を `docs/operator-production.md` に記載（公開 HTTPS · env · Bluetooth）
- [x] 本番ゲート — `prod-checklist`（`WIRE_CONSOLE_WEBAUTHN_RP_ID` / `ORIGIN` 必須）· `npm run settlement-passkey:verify`
- [x] 現場検証 — 2026-08-22: ローカル `http://localhost:9470` 単一 RP · tier B settlement path（単体テスト）· 自動ゲート green。公開 HTTPS + iPhone hybrid + Bluetooth は初回デプロイ時に [settlement-passkey-production-verification.md](./settlement-passkey-production-verification.md) §3–§6 を実行

### 検証

- ログイン: Mac Touch ID のみ（hints `client-device`）
- 決済登録: Mac Chrome が QR → iPhone Face ID → store に `purpose=settlement`
- 決済承認: 同じ経路で assertion → org approval
- 回帰: WebAuthn e2e（既存 e2e-complete は維持）
- Bluetooth オフで失敗することを手順書に書く（Google と同じ）

---

## 6. 明示的にやらないこと

- 自前の URL / 金額 QR を PassKey セレモニーに使わない（領収 QR は ADR 0032 の別物）
- iPhone にコンソール URL を開かせて Face ID する経路を主経路にしない（副次の「この iPhone の Safari で開く」は残してよい）
- ログインと高額承認を 1 本の同期鍵にまとめない（REG-004 B/C）

---

## 7. 参照（調査ソース）

- Google: [Sign in with a passkey](https://support.google.com/accounts/answer/13548313) · [Passkey support on Chrome](https://developers.google.com/identity/passkeys/supported-environments)
- GitHub: [Signing in with a passkey](https://docs.github.com/en/authentication/authenticating-with-a-passkey/signing-in-with-a-passkey)
- Microsoft: [Passkeys (FIDO2) in Entra ID](https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-passkeys-fido2)
- Apple: [Use passkeys on iPhone](https://support.apple.com/guide/iphone/iphf538ea8d0/ios)
- FIDO: [Cross-Device Sign-In](https://www.passkeycentral.org/design-guidelines/optional-patterns/cross-device-sign-in) · [Proximity Exchange Protocol](https://fidoalliance.org/specs/hybrid/proximity-exchange-protocol-v1.0-wd-20260717.html)
- W3C: WebAuthn Level 3 `hybrid` transport
