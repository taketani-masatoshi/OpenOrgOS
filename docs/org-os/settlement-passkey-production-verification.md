# Settlement PassKey — 本番現場検証チェックリスト

**目的:** ADR 0037 · [passkey-iphone-qr-implementation-plan.md](./passkey-iphone-qr-implementation-plan.md) **フェーズ 4** の「実テナント公開ホストでの現場検証」を完了させる。  
**正本:** 本書 · 環境手順: [operator-production.md](../operator-production.md) · 設計: [ADR 0037](../adr/0037-dual-passkey-settlement-stepup.md)

---

## 記録シート（検証前に記入）

| 項目 | 記入 |
|------|------|
| 実施日 | |
| 実施者 | |
| テナント ID | |
| 公開 URL（`WIRE_CONSOLE_WEBAUTHN_ORIGIN`） | |
| RP ID（`WIRE_CONSOLE_WEBAUTHN_RP_ID`） | |
| Mac ブラウザ | Chrome / Safari（どちらか 1 つ必須 · 両方推奨） |
| iPhone OS | |
| iPhone Bluetooth | オン / オフ（ネガティブ用） |

**フェーズ 4 完了条件:** 下記 **§1–§7 の必須項目がすべて `[x]`** であること。完了後、[passkey-iphone-qr-implementation-plan.md](./passkey-iphone-qr-implementation-plan.md) フェーズ 4 の未チェック項目を `[x]` に更新する。

---

## 0. 前提（検証開始前）

### 0.1 機材

- [ ] Mac（Touch ID 対応）— ログイン PassKey 用
- [ ] iPhone（Face ID / Touch ID）— settlement hybrid 用
- [ ] Mac と iPhone の **Bluetooth がオン**（Google PassKey と同様 · hybrid 必須）
- [ ] Mac と iPhone を **数メートル以内** に置く（caBLE 近接）

### 0.2 権限

- [ ] 検証用 operator が `tenants/{id}/data/org/operators.yaml` で **ceo または approver**（`chat:approve` · Wire 承認可）
- [ ] Wire 検証時: `protocol:draft` / `protocol:approve` 相当の権限
- [ ] tier B まで **完全承認** まで試す場合: REG-004 の **2 名承認** が可能な共同承認者 ID を把握（下記 §6 注記）

### 0.3 金額 tier（JP · REG-004）

| Tier | 税込目安（JPY） | settlement step-up |
|------|-----------------|-------------------|
| A | ≤ 100,000 | 不要 |
| B | 100,001 – 1,000,000 | **必須** |
| C | > 1,000,000 | **必須**（取締役会決議も必要） |

本チェックリストの **メインシナリオは tier B（例: ¥500,000）** を推奨する。

---

## 1. 自動プリフライト（Mac ターミナル）

**一括（推奨）:**

```bash
cd /path/to/OS_Steward
export ORGOS_TENANT=<tenant-id>
npm run settlement-passkey:verify -- --url https://<公開ホスト> --tenant <tenant-id>
```

`prod:verify`（HTTP · webauthn 整合）+ `tests/settlement-stepup.test.ts` を実行します。

**個別:**

```bash
export ORGOS_ENV=production
# 本番と同じ WIRE_CONSOLE_WEBAUTHN_* を export してから:

npm run prod:verify -- --url https://<公開ホスト> --tenant <tenant-id>
```

- [ ] `/health` → 200 · `ok: true`
- [ ] `/chat/v1/auth/config` → `mode: prod`
- [ ] `orgos doctor` → `prod_*` 警告なし
- [ ] `ORGOS_SETTLEMENT_STEPUP=0` **が設定されていない**

### 1.1 環境変数（本番ホスト）

- [ ] `WIRE_CONSOLE_WEBAUTHN_RP_ID` = 公開ホスト名（例: `operator.example.com` · **ポートなし**）
- [ ] `WIRE_CONSOLE_WEBAUTHN_ORIGIN` = `https://` + 上記ホスト（末尾スラッシュなし）
- [ ] `WIRE_CONSOLE_AUTH=prod` · dev passkey 未設定
- [ ] `ORGOS_COOKIE_SECURE=1` · HTTPS 経由でアクセス
- [ ] ブラウザのアドレスバー origin が **ORIGIN と完全一致**（`www` 有無 · `localhost` 混在なし）

---

## 2. ログイン PassKey（Mac · tier 不要）

1. `https://<公開ホスト>/` を開く
2. **Touch ID でログイン**（platform PassKey · `hints: client-device`）

- [ ] ログイン成功 · Steward Chat が表示される
- [ ] `/wire/` へ遷移しても **再ログイン不要**（同一 origin セッション）
- [ ] DevTools → Application → Cookies にセッション cookie あり · `Secure` 付き

---

## 3. Settlement PassKey 登録（iPhone hybrid）

1. ログイン画面または Chat 設定の **PasskeySetupCard** を開く
2. **「iPhone で登録」**（primary CTA）を押す
3. Mac ブラウザが **OS 標準の PassKey QR** を表示（サイト独自 QR 画像は出ない）
4. iPhone カメラで QR を読み取り · Face ID で完了

- [ ] ブラウザ QR が表示される（Chrome: Google パスキー / Safari: iCloud 近くのデバイス）
- [ ] iPhone で Face ID 成功
- [ ] UI に「Settlement PassKey 登録済み」相当の表示

### 3.1 API 確認（任意）

```bash
curl -sS "https://<公開ホスト>/chat/v1/auth/config" | jq '.webauthn.settlement_count'
```

- [ ] `settlement_count` ≥ 1

---

## 4. コントロール — Tier A（settlement 不要）

**目的:** B/C 以外では hybrid シートが出ないことを確認する。

### 4A. 設定変更承認（金額なし · tier A）

1. Chat の **設定変更の承認**（`ApprovalsQueue`）で tier A 項目を 1 件用意  
   （例: `orgos tenant-config propose ...` で起案済みの pending）
2. **「承認して適用」** を押す

- [ ] **SettlementPasskeyModal は出ない**
- [ ] Touch ID / セッションのみで承認完了

### 4B. 低額 Wire（任意 · tier A）

```bash
npm run orgos -- --tenant <tenant-id> protocol notice propose \
  --peer <PEER-ID> --contract <CTR-ID> --amount 50000 \
  --operator "<operator-id>"
```

Wire `/wire/` → 承認待ち → 承認

- [ ] settlement モーダルなしで承認できる（または tier A として通る）

---

## 5. メイン — Tier B settlement step-up（必須）

### 5.1 承認待ちの用意

**CLI（推奨 · 金額を明示）:**

```bash
npm run orgos -- --tenant <tenant-id> protocol notice propose \
  --peer <PEER-ID> \
  --contract <CTR-ID> \
  --amount 500000 \
  --operator "<operator-id>" \
  --message "Settlement PassKey 本番検証 tier B"
```

返却された `notice_id` / `approval_id` を記録: _______________

**Wire UI:** `/wire/` → 承認待ち に載ることを確認

### 5.2 承認セレモニー（Mac + iPhone）

1. 承認待ち行を選択 → **「承認」**
2. **SettlementPasskeyModal** が開く  
   - 文言: 「ブラウザの PassKey シートを開いています」系  
   - 金額 · tier B が summary に表示される
3. ブラウザ OS ダイアログ → **QR 表示**
4. iPhone カメラ → Face ID
5. モーダルが **完了** → 閉じる

- [ ] 最初の approve が step-up を要求（DevTools: `POST .../approve` → **409** · `code: step_up_required`）
- [ ] `POST /chat/v1/settlement/challenge` → 200
- [ ] ブラウザ **標準 QR**（自前 QR 画像なし）
- [ ] iPhone Face ID 成功
- [ ] `POST /chat/v1/settlement/complete` → **200**
- [ ] モーダル **done** 表示 · エラーなし

### 5.3 tier B · 共同承認者について（重要）

REG-004 tier B は **2 名承認** が必要。settlement step-up は **共同承認者より先** に検証される。

| 検証の深さ | 合格基準 |
|-----------|----------|
| **フェーズ 4 最小（本書の必須）** | §5.2 まで — hybrid 登録 · step-up · `settlement/complete` 200 |
| **フル Wire 完了（推奨）** | 上記のあと、共同承認者を指定して approve が最終完了 · Wire 送信/flush まで |

フル完了を試す場合:

```bash
# 2 人目が UI から承認する、または API に co_approver_id を付与
# （Wire Console が共同承認者 UI を持たない場合は CLI）
npm run orgos -- --tenant <tenant-id> protocol notice approve \
  --id <NOTICE-ID> \
  --approver "<代表承認者>" \
  --co-approver "<共同承認者>"
```

- [ ] （推奨）tier B notice が `approved` / 送信済みまで到達

### 5.4 監査フィールド（任意）

承認後の `OperatorAttestation` に以下があること:

- [ ] `settlement_credential_id`
- [ ] `settlement_challenge_id`
- [ ] `settlement_rp_id` = 本番 RP ID

---

## 6. ネガティブテスト（必須 1 件 · 推奨 2 件）

### 6.1 Bluetooth オフ（必須）

1. iPhone の Bluetooth を **オフ**
2. §5 と同様に tier B 承認を試行

- [ ] hybrid セレモニーが **失敗**する
- [ ] UI に Bluetooth / 近接に関する日本語エラー（`webauthn-user-error`）
- [ ] **再試行**ボタンで Bluetooth オン後に成功できる

### 6.2 Settlement 未登録（推奨）

別 Mac セッションまたは settlement 未登録 operator で tier B 承認:

- [ ] 登録を促すメッセージ、または allowCredentials 空で失敗（期待どおり）

### 6.3 Settlement バイパス不可（推奨 · 本番ホスト）

- [ ] 本番 env で `ORGOS_SETTLEMENT_STEPUP=0` に **できない**（doctor / 起動拒否）

---

## 7. 回帰（推奨）

```bash
# ローカル CI 相当（本番検証日に合わせて実行）
npm run test:platform -- tests/settlement-stepup.test.ts
playwright test e2e/wire-console-webauthn.smoke.spec.ts
```

- [ ] settlement-stepup 単体テスト green
- [ ] WebAuthn smoke green（ローカル dev 環境）

---

## 8. 完了判定 · 計画書更新

すべての **必須 `[ ]`** が埋まったら:

1. 本書先頭の **記録シート** を保存（社内イベント MD または運用ログへ転記可）
2. [passkey-iphone-qr-implementation-plan.md](./passkey-iphone-qr-implementation-plan.md) を更新:

```markdown
- [x] 実テナント公開ホストでの現場検証（Bluetooth、Chrome または Safari）— 運用時
   · 記録: docs/org-os/settlement-passkey-production-verification.md · 実施日 YYYY-MM-DD · ホスト …
```

3. （任意）会社イベント: `orgos events new` → `docs/company/events/`

---

## 付録 A — ローカル乾式走（本番前 · 任意）

本番 HTTPS の前に、ローカル combined console で hybrid を通す。

```bash
# OS_Steward
npm run operator-console:build
./scripts/start-operator-console-local.sh   # または docker compose -f docker-compose.local.yml
```

| 項目 | 値 |
|------|-----|
| Origin | `http://127.0.0.1:9470`（**localhost と混ぜない**） |
| ヘルプ | `http://127.0.0.1:4178/`（セレモニー origin ではない） |

- [ ] 127.0.0.1 で settlement 登録 · tier B step-up が通る → 本番 §1 へ

---

## 付録 B — トラブルシュート

| 症状 | 確認 |
|------|------|
| QR が出ない | HTTPS/origin 不一致 · RP ID ≠ ホスト名 · 古い bundle（`operator-console:build` 再デプロイ） |
| iPhone が読めない | Bluetooth オフ · 距離 · 別 Apple ID / パスキー未設定 |
| `origin mismatch` | `WIRE_CONSOLE_WEBAUTHN_ORIGIN` とブラウザ URL が 1 文字でも違う |
| approve 409 のまま | settlement 未登録 · `settlement_count=0` |
| complete 400 · co-approver | tier B の 2 名目不足 — §5.3 参照 |
| モーダル閉じたのに OS シート残る | ブラウザ仕様 — **キャンセルは UI のみ**。シートは手動で閉じる |
| Cookie 切れ | `ORGOS_COOKIE_SECURE=1` なのに HTTP で開いている |

---

## 付録 C — DevTools ネットワーク期待値（tier B 承認）

```
POST /console/v1/tenants/.../notices/{id}/approve  → 409  step_up_required
POST /chat/v1/settlement/challenge                 → 200  challenge + allow_credentials
(navigator.credentials.get — hybrid QR)
POST /chat/v1/settlement/complete                  → 200  ok + approval/wire result
```

Chat 経路（設定承認以外）では `POST /chat/v1/approvals/{id}/approve` が 409 になる点のみ異なる。

---

## 関連

- [operator-production.md](../operator-production.md) — env · nginx · Dual PassKey 概要
- [passkey-iphone-qr-implementation-plan.md](./passkey-iphone-qr-implementation-plan.md) — フェーズ 0–4
- `apps/shared/SettlementPasskeyModal.tsx` — 期待 UI
- `src/lib/org/settlement-stepup.ts` — サーバ正本
