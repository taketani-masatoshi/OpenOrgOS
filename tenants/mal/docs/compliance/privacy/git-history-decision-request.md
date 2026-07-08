# Git 履歴清掃 — 段への選択依頼（R-001）

**Secretary relay 用 · 1 ページ**  
**正本（記入）:** [git-history-decision.md](git-history-decision.md)  
**詳細:** [git-history-remediation.md](git-history-remediation.md)

---

## 段へお願いしたいこと

executive データの **過去 Git 履歴** について、次の **1 案** に ✓ を入れて署名してください。

| 案 | 概要 | 推奨 |
|----|------|:----:|
| **A** | filter-repo で履歴から executive path 削除 | ★ データ境界 4.9 向け |
| **B** | 新規 private repo · HEAD のみ | 協力者少ない場合 |
| **C** | 現状維持（accepted）· 受容 4 条件に同意 | 公開化予定なしの場合 |

**記入先:** [git-history-decision.md](git-history-decision.md)（日付 · 署名 · 選択欄）

---

## 選択後の流れ

| 選択 | 次 |
|------|-----|
| A | Compliance が filter-repo checklist 実行 → R-001 **closed** |
| B | Operations が remote 差替 → fresh clone 案内 |
| C | risk-register **accepted** · 年 1 回 §6 検証 |

**Secretary relay 例:** 「段が案 A を選択 · Compliance 手順開始をお願いします」

---

*未選択の間: R-001 は mitigated · 秘書品質「データ境界」は 4.9 未達*
