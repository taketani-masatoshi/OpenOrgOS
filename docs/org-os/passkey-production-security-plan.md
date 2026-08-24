# PassKey 本番セキュリティ実装計画

**日付:** 2026-08-24  
**状態:** Wave 1–2 実装済み · 現場 HTTPS 検証は [passkey-field-validation-log.md](passkey-field-validation-log.md)  
**対象:** Operator Console WebAuthn（ログイン / 決済 Dual PassKey）  
**関連:** [ADR 0037](../adr/0037-dual-passkey-settlement-stepup.md) · [ADR 0041 bootstrap](../adr/0041-passkey-bootstrap-token.md) · [passkey-iphone-qr-implementation-plan.md](passkey-iphone-qr-implementation-plan.md) · [operator-production.md](../operator-production.md)

> **スコープ:** Dual PassKey UX（ADR 0037 · hybrid QR）は実装済み。本計画は **検証 harden** と本番初回登録の強化。  
> **番号:** bootstrap token の ADR は **0041**（0038 = HumanApprovalContext · 0039 = agent-fs-guard）。

外部レビュー（「未認証 bootstrap で管理者乗っ取り」等）を **現行 `OS_Steward` コード** と照合した結果。指摘の一部は既に直っている。残件だけを実装対象にする。

---

## 0. レビュー照合（何が妥当か）

評価書のファイルパスは Codex 作業コピー。正本は次。

| 評価の主張 | 判定（2026-08-24） |
|---|---|
| 開発用共有 PassKey と本番 WebAuthn の分離、challenge 5 分・一回、ES256、HttpOnly / SameSite=Strict | **実装済み** |
| credential JSON 破損を 0 件扱い → bootstrap 再開 | **修正済み** — `WebAuthnCredentialStoreCorruptError` · bootstrap 再開しない · atomic/`0600` |
| ログイン / 決済で RP ID Hash · UP / UV 未検証 | **修正済み** — `webauthn-assertion.ts` 共有 |
| Origin 欠落を許可 | **修正済み** — `webauthnOriginsEqual` 欠落は false |
| Secure Cookie 未付与 | **修正済み** — `cookieSecureEnabled()` 時に `; Secure` |
| ワンタイム bootstrap token | **実装済み** — [ADR 0041](../adr/0041-passkey-bootstrap-token.md) · `orgos operator passkey-bootstrap mint` |
| env 名不一致（docs） | **残** — production.env.example / runbook 追従 |

**結論:** Wave 1–2（origin · store · assertion · Secure Cookie · bootstrap token）はコード側を仕様のセキュア案に合わせた。残りは現場 HTTPS 検証記録（Wave 4）。

---

## 1. 目標

本番 WebAuthn を次の条件で「起動してよい」にする。

1. `clientData.origin` と authenticatorData の RP ID hash / UP / UV を **欠落拒否** で検証する。
2. credential ファイルの読取失敗は **空配列にしない**（bootstrap を再開しない）。
3. 初回ログイン PassKey は **人間が発行した一回限りトークン** と、既存の Community SSO セッションの **両方** を要する。
4. `ORGOS_COOKIE_SECURE=1` が Set-Cookie に実際に効く。
5. 設定例の環境変数名が実装と一致する。
6. 上記の異常系テストが vitest で赤/緑になる。

対象外（後続ランブック）: 実機 Touch ID、本番 TLS、複数コンテナの challenge 共有、紛失復旧のオペレーション訓練。計画末尾にチェックリストだけ置く。

---

## 2. 設計

### 2.1 共通 assertion 検証（ログインと決済で同じ関数）

新設: `src/lib/wire-console/auth/webauthn-assertion.ts`

```
verifyWebAuthnAssertion({
  expectedRpId,
  expectedOrigin,          // 必須。未設定なら失敗
  clientDataJsonBase64,
  authenticatorDataBase64,
  signatureBase64,
  publicKeySpkiBase64,
  previousSignCount?,
}): { ok: true, signCount } | { ok: false, error }
```

検証順（W3C WebAuthn Level 2 §7.2 のサーバ側必須に寄せる）:

| # | 検査 | 失敗時 |
|---|---|---|
| 1 | `clientData.type` / `challenge` | mismatch |
| 2 | `clientData.origin` が存在し `webauthnOriginsEqual(actual, expected)` | origin 欠落・不一致 |
| 3 | `expectedOrigin` 未設定 | 本番・テストとも失敗（テストは env をセット） |
| 4 | `authenticatorData` 先頭 32 byte == SHA-256(expectedRpId) | rpId hash mismatch |
| 5 | flags bit 0 (UP) == 1 | user not present |
| 6 | flags bit 2 (UV) == 1 | user not verified |
| 7 | 署名（既存 `verifyWebAuthnAssertionSignature`） | invalid signature |
| 8 | sign count: 解析失敗は失敗。`signCount > 0 && <= previous` は replay。0 は一部 authenticator 向けに許可し更新スキップ | |

`webauthnOriginsEqual` を変更する:

```
if (!expected || !actual) return false;
```

登録 (`verifyWebAuthnRegistration`) も同じ origin 関数 + UP/UV を使う。RP hash は既存のまま共通ヘルパへ抽出。

`buildTestAuthenticatorData` は UV 込み `0x05`（UP|UV）を既定にする。UV 無し fixture を明示テスト用に残す。

呼び出し元:

- `src/lib/wire-console/auth/webauthn.ts` — login
- `src/lib/org/settlement-stepup.ts` — settlement complete
- `src/lib/wire-console/auth/webauthn-register.ts` — create 時の origin / flags

### 2.2 credential store fail-closed

`readStoreFile`:

- ファイル無し → `[]`（初回は正当）
- JSON 破損 / `credentials` 非配列 → **throw**（または `{ error: "corrupt" }` を上位へ）。bootstrap 判定は throw を「0 件」にしない
- `GET /auth/config` と register gate は 503 + `credential store unreadable`。UI は「管理者に連絡」

書込み:

- `writeFileSync(tmp)` → `renameSync`（同一ディレクトリ）
- `mode: 0o600`
- 既存ファイルがあれば `chmod 0600` を初回読取時に best-effort

env 由来 credential の sign counter:

- ファイル側に同じ `credential_id` があればファイルを更新（現状どおり merge は env 優先なので、**env にある ID は counter 更新対象外**と API で明示）
- 更新失敗を握り潰さない。env-only なら warning を返し、replay 検査は previous=undefined 扱いにしない（毎回 0 比較で replay 検知不能なため、env-only は **sign count 検査をスキップせず、previous を 0 固定で「減少だけ拒否」**）

破損時に bootstrap が開かないことが P0 の本体。atomic / 0600 は同 PR でよい。

### 2.3 初回登録: SSO + ワンタイム bootstrap token

**本番デフォルト（`ORGOS_ENV=production` または `WIRE_CONSOLE_AUTH=prod`）:**

1. Community SSO セッション必須（現行維持。`ALLOW_OPEN_BOOTSTRAP` は prod で doctor 失敗）
2. ログイン credential が 0 件のとき、register options / verify に **bootstrap token** が必須
3. トークンはオペレータ ID にバインド。セッションの `operator_id` と一致しなければ 403
4. 一回利用。TTL 既定 24h。ハッシュだけ保存

**発行（人間・CLI）:**

```bash
orgos operator passkey-bootstrap mint --operator-id OP-001 --ttl 24h
```

- 標準出力に **一度だけ** 平文トークン（`pkb_…`）
- 保存は `data/.orgos/passkey-bootstrap.json`（gitignore 済み state dir）に `sha256` + `operator_id` + `expires_at` + `used_at`
- 権限 0600、atomic write

**消費:** `createWebAuthnRegisterOptions` が token を検証し、verify 成功後に `used_at` を書く。options 発行時点で予約（challenge に `bootstrap_token_hash` を載せる）し、verify 失敗でも options の TTL 内は同一 token を再提示可。成功で used。期限切れ・used・hash 不一致は 403。

**ローカル開発:** token 無しで現行どおり SSO セッションのみ（`ORGOS_ENV` 非 production）。テストは token を mint して通すケースと、prod 相当 env で token 無し 401 を置く。

**追加ログイン鍵:** 現行 `WIRE_CONSOLE_WEBAUTHN_ALLOW_ADDITIONAL_LOGIN=1` + セッション。token 不要。

**決済鍵:** 現行どおりログイン済みセッション + 同一 identity。token 不要。

ADR: `docs/adr/0041-passkey-bootstrap-token.md`（Accepted）。README 一覧を更新。

### 2.4 Secure Cookie

`setSessionCookie` / `clearSessionCookie`:

```
HttpOnly; SameSite=Strict; Path=/
+ cookieSecureEnabled() なら `; Secure`
```

`orgos doctor` / `runProdAuthChecks` の `secure_cookie` は、公開 host で flag が立っていても **実装が付与すること** はコードレビューと vitest（Set-Cookie ヘッダ文字列）で担保する。チェックリスト文言は「flag を立てよ」から「Cookie に Secure が付く」に直す。

### 2.5 設定例・ドキュメント

置換（実装名に統一）:

- `deploy/operator-console/env/production.env.example` — `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` → `WIRE_CONSOLE_WEBAUTHN_*`
- `docs/runbook-orgos.md` 認証表の `WEBAUTHN_RP_ID` 行
- 必要なら `WIRE_CONSOLE_WEBAUTHN_ALLOW_REGISTER`（runbook の旧名）を `ALLOW_ADDITIONAL_LOGIN` に注記

prod-checklist に追加:

- `ALLOW_OPEN_BOOTSTRAP=1` は production で fail
- credential store が読める
- bootstrap token 未使用が 1 件以内、またはログイン credential ≥ 1

### 2.6 CSRF

WebAuthn の login / register は challenge が CSRF トークン相当。**Origin 強制（2.1）のあと、exempt は残す。** セッション付き register を CSRF 対象に戻すと、ブラウザの WebAuthn フローが Origin ヘッダ無しで落ちる実装差がある。この計画では CSRF を触らない。

ログイン画面の operator / approver 自由入力は、セッションがある設定ページでは出さない（現行 `PasskeySettingsPage`）。未ログインの `PasskeyAuthPanel` は SSO 誘導が主。**P2 として入力欄を SSO 後は hidden + session 値** にするのは Wave 3。

---

## 3. 実装 Wave

### Wave 1 — 検証を fail-closed にする（本番ブロッカー）

優先: origin / RP hash / UP/UV / store 破損 / Secure Cookie / env 名。

| 項目 | ファイル |
|---|---|
| `webauthnOriginsEqual` 欠落拒否 | `webauthn-origin.ts` + 既存 origin テスト拡張 |
| 共通 assertion 検証 | 新 `webauthn-assertion.ts`。login / settlement / register から呼ぶ |
| 登録時 UP/UV | `webauthn-register.ts` |
| store 破損 throw、atomic + 0600 | `webauthn-store.ts` |
| Secure 属性 | `session.ts` |
| env 例 | `production.env.example`、`runbook-orgos.md` |
| テスト | 下記 §4 Wave 1 |

完了条件: 欠落 origin・RP hash 改ざん・UV=0・破損 JSON がすべて失敗する。Set-Cookie が `ORGOS_COOKIE_SECURE=1` で Secure を含む。

### Wave 2 — bootstrap token

| 項目 | ファイル |
|---|---|
| token store + mint/consume | `src/lib/wire-console/auth/passkey-bootstrap.ts` |
| CLI | `src/commands/` 配下の operator サブコマンド |
| gate | `webauthn-register-gate.ts` / `webauthn-register.ts` |
| UI | 設定ページとログインパネルに「初回トークン」欄（bootstrap 時のみ） |
| doctor | `prod-checklist.ts` |
| ADR 0038 | `docs/adr/` + README |

完了条件: prod 相当 env で token 無し register が 401。token + SSO で 1 回だけ成功。2 回目 403。破損 store では token があっても 503。

### Wave 3 — テスト厚みと UX

- login 画面の ID 欄をセッション確定後に固定
- env-managed credential の counter 更新不能をテストで固定
- Playwright WebAuthn smoke の未コミット差分を整理して CI 緑
- `docs/org-os/passkey-troubleshooting.md` に「store corrupt / bootstrap token / Secure cookie」を追加

### Wave 4 — 運用（コード外）

計画対象外だが、本番判断に必要:

- 実機 Touch ID ログイン、iPhone hybrid 決済
- HTTPS 本番ホストでの登録・ログイン
- credential ファイルの uid / `0600` をデプロイ後に確認
- 紛失: 管理者がファイルから該当 credential を削除し、Wave 2 token で再登録
- 複数プロセス: challenge Map はプロセスローカル。本番は sticky または共有 store（別 ADR）

---

## 4. テスト計画

既存の署名成功・改ざんは残す。追加:

| ケース | Wave |
|---|---|
| origin 欠落 → ログイン失敗 | 1 |
| origin 欠落 → 登録失敗 | 1 |
| expected origin 未設定 → 失敗 | 1 |
| RP hash 不一致 → ログイン失敗 | 1 |
| RP hash 不一致 → 決済 complete 失敗 | 1 |
| UP=0 / UV=0 → 失敗 | 1 |
| 破損 JSON → bootstrap にならない（throw / 503） | 1 |
| `ORGOS_COOKIE_SECURE=1` の Set-Cookie に Secure | 1 |
| prod で未認証 register 401（現行維持） | 1 |
| prod で SSO のみ・token 無し bootstrap 401 | 2 |
| mint token → 登録 1 回成功 → 2 回目失敗 | 2 |
| 他 operator の token を自分のセッションで使う → 403 | 2 |
| `ALLOW_OPEN_BOOTSTRAP=1` が production doctor fail | 2 |

テスト秘密鍵経路（`WIRE_CONSOLE_WEBAUTHN_TEST_SECRET`）は **RP hash / origin / UP/UV をバイパスしない**。バイパスは署名検証だけ。

---

## 5. やらないこと

- CSRF exempt 解除（2.6）
- ログインと決済の RP 再分離（ADR 0037 維持）
- 自前 QR / approve ホストでのセレモニー
- 同期鍵の **attestation 強制**（iPhone hybrid が死ぬ）— `packed` self/leaf 署名検証のみ実装（PKIX 信頼なし）
- challenge の Redis 共有（Wave 4 / 別 ADR）

---

## 6. 作業順（実装時）

1. `webauthn-origin.ts` と assertion ヘルパ（回帰が限定的）
2. login / settlement / register をヘルパへ接続
3. store fail-closed + atomic
4. Secure Cookie
5. env 例と runbook
6. vitest Wave 1
7. bootstrap token + CLI + ADR 0038
8. UI トークン欄 + doctor
9. vitest Wave 2
10. troubleshooting 追記

各ステップ後: `npx vitest run tests/webauthn-origin.test.ts tests/wire-console-webauthn-verify.test.ts tests/webauthn-register-gate.test.ts tests/settlement-stepup.test.ts tests/prod-auth-checklist.test.ts` および関連を追加実行。
