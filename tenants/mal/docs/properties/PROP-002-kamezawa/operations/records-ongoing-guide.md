# operations/records — 継続蓄積ガイド（REG-010/012/016）

**対象:** 亀沢旅館 PROP-002 · **gitignore:** 個情詳細は `records/` 配下

---

## 月次ルーティン

| タイミング | 記録 | 様式 |
|-----------|------|------|
| チェックイン後 | 宿泊者名簿 | `templates/compliance/宿泊者名簿.csv` → `records/{YYYY}/{MM}/` |
| チェックアウト後 | 清掃記録 | `清掃記録.csv` |
| クレーム発生時 | クレーム | `クレーム記録.csv`（24h 以内一次応答） |

```bash
# 蓄積確認（CLI）
npm run orgos -- skills run records-check
```

---

## ディレクトリ

```
operations/records/
└── 2026/
    └── 08/
        ├── 宿泊者名簿.csv
        ├── 清掃記録.csv
        └── クレーム記録.csv
```

---

## 個情（REG-010）

- 名簿は **5年** 保管（REG-007 連携）
- 清掃委託先に **ゲスト個情を渡さない**（入室日時 · 鍵のみ）
- 原本スキャンは `records/`（リポジトリ外）— CSV は最小項目のみ Git 可

---

## 内部監査

- 第1回: 2026-08-18 完了 — [audit-01-report.md](../../../compliance/iso/audit-records/fy2026/audit-01-report.md)
- 記録不足は NC として是正 · 月次で `records-check` を実行

---

## 関連

- [guest-register-rules.md](../guest-register-rules.md)
- [daily-operations-guide.md](../daily-operations-guide.md)
