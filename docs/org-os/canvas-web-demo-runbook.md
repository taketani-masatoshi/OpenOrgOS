# Canvas Web — デモ最短構成ランブック

**日付:** 2026-07-14  
**目的:** 運用・デモ向けに、MAL / Southwood を混ぜずに読取専用ボードを見せる（Mac 直の不特定公開はしない）  
**関連:** [canvas-readonly-web-plan.md](canvas-readonly-web-plan.md) · ADR [0016](../adr/0016-canvas-web-lan-bearer-auth.md) · [0017](../adr/0017-canvas-web-tenant-allowlist-demo.md)

---

## 1. 役割分担（デモ）

| チャネル | 用途 | 変更・承認 |
|----------|------|-----------|
| **Canvas Web**（PC / iPhone Safari） | ボード閲覧のみ | 不可 |
| **Cursor / CLI / Steward Chat（PC）** | 承認 · エージェント · データ変更 | 可 |
| **Slack 等メッセージ** | 秘書・Steward との **短文コミュニケーションのみ** | エージェント変更 · DB 構成変更 · モジュール改修は **不可** |

認証管理は重要。デモでも **テナント別トークン** を分け、共有しない。

---

## 2. 到達経路（気持ち悪さ対策）

| 優先 | 方法 | 備考 |
|------|------|------|
| **推奨** | Tailscale（または同等 VPN）で Mac にだけ届く | インターネットにポート開放しない |
| 可 | `--lan` + 社内 Wi‑Fi のみ · ルータ WAN 開放なし | それでも不特定多数には晒さない |
| 開発 | `127.0.0.1` のみ | 本人確認用 |
| 禁止 | 生の Port をインターネット向けに DNAT / 誰でも Tunnel | — |

デモ相手には **Tailscale invite + テナント用 URL（?token=）** を渡す。

---

## 3. 起動（テナント分離）

既定では **起動テナント以外の View API は 404**（他テナントの存在を隠す）。

### MAL 専用（ポート 5175）

```bash
# View Model 更新
ORGOS_TENANT=mal npm run orgos -- canvas present --suite all

# 配信（Tailscale 経由なら loopback のまま相手の TS へ、または --host <tailscale-ip>）
ORGOS_TENANT=mal npm run orgos -- canvas web serve \
  --tenant mal \
  --port 5175 \
  --token "$ORGOS_CANVAS_WEB_TOKEN_MAL"
```

スマホ: `http://<tailscale-ip>:5175/t/mal?token=…`  
（ホーム画面に追加で「チェック用」PWA 風に使える）

### Southwood 専用（ポート 5176）

```bash
ORGOS_TENANT=southwood npm run orgos -- canvas present --suite secretary
# （Southwood に canvas-views が無い場合は先に present）

ORGOS_TENANT=southwood npm run orgos -- canvas web serve \
  --tenant southwood \
  --port 5176 \
  --token "$ORGOS_CANVAS_WEB_TOKEN_SOUTHWOOD"
```

### 特権（両方見えるオペレータ）

```bash
npm run orgos -- canvas web serve \
  --tenant mal \
  --allow-tenants mal,southwood \
  --port 5180 \
  --token "$ORGOS_CANVAS_WEB_TOKEN_PRIVILEGED"
```

またはテナント別秘密:

```bash
npm run orgos -- canvas web serve \
  --tenant mal \
  --allow-tenants mal,southwood \
  --tenant-token "mal=$ORGOS_CANVAS_WEB_TOKEN_MAL" \
  --tenant-token "southwood=$ORGOS_CANVAS_WEB_TOKEN_SOUTHWOOD" \
  --port 5180
```

同一プロセスでトークンがテナントに紐づく。MAL トークンでは Southwood の JSON は 404。

環境変数でも可: `ORGOS_CANVAS_WEB_TOKEN_MAL` / `ORGOS_CANVAS_WEB_TOKEN_SOUTHWOOD`。

---

## 4. API（デモ）

| Path | 内容 |
|------|------|
| `GET /api/health` | 生存確認（トークン不要） |
| `GET /api/config.json` | `default_tenant` · **この Bearer で見える** `allow_tenants` |
| `GET /api/registry.json` | ボード登録 |
| `GET /api/t/{tenant}/views/{suite}/{id}.json` | View Model（allowlist + トークン一致時のみ） |

書き込みはすべて 405。

---

## 5. モバイル

- 当面は **レスポンシブ Web**（ネイティブ App は後続）
- iPhone Safari で閲覧 · 操作ボタンなし
- 秘書への短い意思表示は **Slack / Steward Chat（PC）**（Web に POST を足さない）

---

## 6. トークン運用

- デモゲスト: **短命・単テナント** · 終了後ローテ
- `?token=` は履歴に残る → デモ後に必ず失効（新しい秘密に差し替え）
- 本番前に IdP / operator `canvas:read` へ移行（本ランブックの次段階）

---

## 7. チェックリスト

- [ ] MAL / Southwood でそれぞれ `canvas present` 済み  
- [ ] プロセスをテナント専用（または特権 allowlist）で起動  
- [ ] Tailscale（推奨）· WAN ポート開放なし  
- [ ] ゲストに渡す URL はテナント＋トークンが一致  
- [ ] 承認デモは PC の Cursor / Chat で実施  
- [ ] Slack に「設定変更して」系の依頼を載せて実行しない  
