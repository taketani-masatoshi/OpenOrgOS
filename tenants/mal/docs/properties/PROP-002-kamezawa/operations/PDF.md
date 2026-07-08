# ゲスト向け PDF

Markdown から PDF を生成し、亀沢に掲示する。

## 対象

| ソース | 用途 |
|--------|------|
| [welcome-sheet.md](../templates/guest-facing/welcome-sheet.md) | 玄関 |
| [house-rules.md](../templates/guest-facing/house-rules.md) | リビング |
| [local-guide-en.md](../templates/guest-facing/local-guide-en.md) | リビング |
| [緊急時連絡・避難.md](../templates/guest-facing/緊急時連絡・避難.md) | 玄関 |
| [guest-privacy-notice.md](../../../../../compliance/privacy/guest-privacy-notice.md) | CI |

## 手順

1. `kamezawa-secrets.yaml` を作成（[example](../../../data/operations/kamezawa-secrets.yaml.example)）
2. welcome-sheet の Wi-Fi 欄を secrets から転記
3. ブラウザで MD を開き **印刷 → PDF**、又は:

```bash
npx --yes md-to-pdf docs/properties/PROP-002-kamezawa/operations/templates/guest-facing/welcome-sheet.md --dest docs/io/outbox/lodging/
```

4. 生成 PDF は **`docs/io/outbox/lodging/`**（gitignore）— USB 又は現地 PC にコピー

```bash
npm run orgos -- io outbox scan    # 台帳に登録
npm run orgos -- io outbox list    # 印刷待ち確認
```

## 掲示セット

- welcome-sheet + house-rules + 緊急 + 個情告知（最低4点）
- local-guide-en（外国人向け推奨）
