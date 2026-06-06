# Inbox — 受信トレイ（Input）

**契約書・申請書・領収書・許認可スキャン**など、未処理の原本・PDF をここに集めます。

中身（PDF・画像）は **gitignore**。この README と台帳（`cursor/data/document-io.yaml`）のみ Git 管理。

---

## フォルダ

| パス | 置くもの |
|------|---------|
| [contracts/](contracts/) | 契約書原本・署名済 PDF |
| [licenses/](licenses/) | 許認可・保険証券スキャン |
| [applications/](applications/) | 申請書・届出・見積 |
| [receipts/](receipts/) | 領収書・請求書 |
| [corporate/](corporate/) | 議事録署名版・登記書類 |
| [misc/](misc/) | 上記以外 |

---

## 使い方

### 1. ファイルを置く（どちらでも可）

- **手動:** 上記フォルダに PDF/画像をドラッグ
- **CLI:** 任意の場所からコピー＋台帳登録

```bash
npm run steward -- io inbox add \
  --from ~/Downloads/保険見積.pdf \
  --category applications \
  --title "火災保険見積" \
  --related CTR-013
```

### 2. Cursor で処理

Chat に「INB-001 を処理して」と依頼 → YAML・MD 更新・保管先決定

### 3. 完了

```bash
npm run steward -- io inbox done INB-001 \
  --archive docs/corporate/licenses/insurance/records/policy-2026.pdf
```

---

## 関連

- 出力トレイ: [../outbox/README.md](../outbox/README.md)
- 台帳: [`cursor/data/document-io.yaml`](../../cursor/data/document-io.yaml)
- ガイド: `npm run steward -- io guide`
