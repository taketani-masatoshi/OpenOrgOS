# operations/records — 継続蓄積ガイド（REG-010/012/016）

**対象:** 亀沢旅館 PROP-002 · **gitignore:** 個情詳細は `records/` 配下

**法定帳簿一覧:** [statutory-records-catalog.md](statutory-records-catalog.md)

---

## 月次ルーティン

| タイミング | 記録 | 様式 |
|-----------|------|------|
| チェックイン後 | 宿泊者名簿 | `templates/compliance/宿泊者名簿.csv` → `records/{YYYY}/{MM}/宿泊者名簿.csv` |
| 外国籍 CI 後24h | 外国人宿泊者届 | `compliance/外国人宿泊者届.csv` |
| 毎日 | 日次運営記録 | `operations/日次運営記録.csv` |
| チェックアウト後 | 清掃記録 | `housekeeping/清掃記録.csv` |
| 月1 | 消防点検・定期点検 | `maintenance/消防点検記録.csv` · `定期点検-{YYYY-MM}.md` |
| クレーム発生時 | クレーム | `guest-service/クレーム記録.csv`（24h 以内一次応答） |

```bash
# 蓄積確認（CLI）
STEWARD_TENANT=mal npm run orgos -- operations hospitality records-check
STEWARD_TENANT=mal npm run orgos -- operations hospitality register-validate
```

---

## ディレクトリ（2026-08 以降）

```
operations/records/
└── 2026/
    └── 08/
        ├── 宿泊者名簿.csv
        ├── compliance/
        ├── operations/
        ├── housekeeping/
        ├── maintenance/
        └── guest-service/
```

各カテゴリ CSV は **テンプレを月フォルダへコピー** し、年を通して追記する。

---

## 個情（REG-010）

- 名簿は **5年** 保管（REG-007 連携 · 法定下限 3年）
- 清掃委託先に **ゲスト個情を渡さない**（入室日時 · 鍵のみ）
- 原本スキャンは `records/`（リポジトリ外）— CSV は最小項目のみ

---

## 内部監査

- 第1回: 2026-08-18 完了 — [audit-01-report.md](../../../compliance/iso/audit-records/fy2026/audit-01-report.md)
- 記録不足は NC として是正 · 月次で `records-check` を実行

---

## 関連

- [statutory-records-catalog.md](statutory-records-catalog.md)
- [guest-register-rules.md](../guest-register-rules.md)
- [daily-operations-guide.md](../daily-operations-guide.md)
