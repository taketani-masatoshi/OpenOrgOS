# 亀沢旅館 — 日常運用フォーマット

**PROP-002** · 1棟貸し · 最大7名  
運用の全体像: [daily-operations-guide.md](daily-operations-guide.md)

| ゾーン | 内容 | Git |
|--------|------|-----|
| `templates/` | 空様式・ゲスト掲示用 MD | 追跡 |
| `records/` | 記入済（個情含む） | **非追跡** |

---

## 様式カタログ

### A. 法令・コンプライアンス

| 様式 | ファイル | タイミング |
|------|---------|-----------|
| 宿泊者名簿 | [compliance/宿泊者名簿.csv](templates/compliance/宿泊者名簿.csv) | チェックイン |
| 外国人宿泊者届 | [compliance/外国人宿泊者届.csv](templates/compliance/外国人宿泊者届.csv) | 外国籍 CI 後24h |
| 運用規則 | [guest-register-rules.md](guest-register-rules.md) | — |
| 個人情報告知 | [../privacy/guest-privacy-notice.md](../privacy/guest-privacy-notice.md) | CI 時掲示 |

### B. 予約・日次運営

| 様式 | ファイル | タイミング |
|------|---------|-----------|
| 予約・稼働台帳 | [operations/予約稼働台帳.csv](templates/operations/予約稼働台帳.csv) | 予約確定時 |
| 日次運営記録 | [operations/日次運営記録.csv](templates/operations/日次運営記録.csv) | **毎日** |
| チェックイン確認 | [operations/チェックイン確認.csv](templates/operations/チェックイン確認.csv) | 各 CI |
| チェックアウト確認 | [operations/チェックアウト確認.csv](templates/operations/チェックアウト確認.csv) | 各 CO |

### C. 清掃・ハウスキーピング

| 様式 | ファイル | タイミング |
|------|---------|-----------|
| 清掃発注・引継 | [housekeeping/清掃発注引継.csv](templates/housekeeping/清掃発注引継.csv) | CO 時 |
| 清掃記録 | [housekeeping/清掃記録.csv](templates/housekeeping/清掃記録.csv) | 清掃完了 |
| 清掃チェックリスト | [housekeeping/清掃チェックリスト.md](templates/housekeeping/清掃チェックリスト.md) | 清掃時（CTR-012 別紙） |
| 消耗品在庫 | [housekeeping/消耗品在庫.csv](templates/housekeeping/消耗品在庫.csv) | 週次 |

### D. 設備・メンテナンス

| 様式 | ファイル | タイミング |
|------|---------|-----------|
| メンテナンス記録 | [maintenance/メンテナンス記録.csv](templates/maintenance/メンテナンス記録.csv) | 作業時 |
| 設備故障報告 | [maintenance/設備故障報告.csv](templates/maintenance/設備故障報告.csv) | 故障時 |
| 光熱メーター記録 | [maintenance/光熱メーター記録.csv](templates/maintenance/光熱メーター記録.csv) | 月次 |
| 定期点検（月次） | [maintenance/定期点検-月次.md](templates/maintenance/定期点検-月次.md) | 月1 |

### E. ゲスト対応

| 様式 | ファイル | タイミング |
|------|---------|-----------|
| クレーム記録 | [guest-service/クレーム記録.csv](templates/guest-service/クレーム記録.csv) | 受付時 |
| OTA メッセージ | [messages/OTAメッセージテンプレート.md](templates/messages/OTAメッセージテンプレート.md) | 随時 |

### F. ゲスト向け掲示・送付

→ **[guest-facing/README.md](templates/guest-facing/README.md)** 一覧

| 様式 | ファイル |
|------|---------|
| Welcome 1枚 | [welcome-sheet.md](templates/guest-facing/welcome-sheet.md) |
| House Rules（英） | [house-rules.md](templates/guest-facing/house-rules.md) |
| ハウスルール（日） | [ハウスルール.md](templates/guest-facing/ハウスルール.md) |
| **観光案内（英）** | [local-guide-en.md](templates/guest-facing/local-guide-en.md) |
| 周辺案内（日） | [local-guide-ja.md](templates/guest-facing/local-guide-ja.md) |
| チェックイン | [check-in-guide.md](templates/guest-facing/check-in-guide.md) |
| 緊急 | [緊急時連絡・避難.md](templates/guest-facing/緊急時連絡・避難.md) |

---

## 初回セットアップ

1. `records/2026/` 以下にカテゴリフォルダを作成
2. 各 CSV を **年次ファイル** としてコピー（例: `operations/日次運営記録-2026.csv`）
3. ゲスト向け MD を PDF 化し、亀沢に **掲示セット**（welcome-sheet · house-rules · 緊急 · 個情告知 · local-guide-en）
4. OTA メッセージテンプレを Airbnb/Booking に登録
5. 清掃業者にチェックリスト + 発注フローを共有

---

## 関連

- [daily-operations-guide.md](daily-operations-guide.md)
- [REG-012](../../corporate/regulations/shukuhaku-unyo-kisoku.md)
- [ISO 21401](../../iso/ISO-21401/README.md)

*最終更新: 2026年6月*
