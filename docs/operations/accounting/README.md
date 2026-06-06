# 経理・会計台帳

税理士連携を前提とした **簡易台帳** です。  
本格的な会計ソフト導入後も、索引・固定資産管理として利用できます。

---

## 帳簿一覧

| 帳簿 | テンプレート | 用途 | 保管 |
|------|-------------|------|------|
| **現金出納帳** | [templates/現金出納帳.csv](templates/現金出納帳.csv) | 現金の入出金 | 7年 |
| **経費精算台帳** | [templates/経費精算台帳.csv](templates/経費精算台帳.csv) | 経費申請・承認 | 7年 |
| **領収書索引** | [templates/領収書索引.csv](templates/領収書索引.csv) | 証憑の所在管理 | 7年 |
| **固定資産台帳** | [templates/固定資産台帳.csv](templates/固定資産台帳.csv) | 番町・亀沢資産 | 7年 |

---

## 運用

1. 支出発生 → [REG-005 経費精算規程](../../corporate/regulations/keihi-seisan-kisoku.md) に従い承認
2. 経費精算台帳に記入 → 領収書は `records/receipts/{年}/` にスキャン保管（Git 非推跡）
3. 月次: `cursor/data/finances/monthly/` YAML と照合
4. 決算: 税理士へ CSV・領収書を提出

---

## 固定資産（初期値）

| 資産 | 参照 |
|------|------|
| 番町ハイム312 | PROP-001, CTR-002 |
| 亀沢土地・建物 | PROP-002, CTR-006/007 |

---

## records/

[`records/README.md`](records/README.md) — 記入済み・領収書スキャンは Git 外。

---

## 関連

- [REG-005 経費精算](../../corporate/regulations/keihi-seisan-kisoku.md)
- [REG-004 稟議・決裁](../../corporate/regulations/ringi-kessai-kisoku.md)
- [fy2026-pl.md](../../plans/fy2026-pl.md)
