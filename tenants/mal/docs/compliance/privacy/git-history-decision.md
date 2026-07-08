# Git 履歴清掃 — 段の選択（R-001）

**日付:** __________ · **署名（段）:** __________

詳細: [git-history-remediation.md](git-history-remediation.md)

---

## 選択（1 つに ✓）

| | 案 | 選択 |
|---|-----|:----:|
| A | **filter-repo** — 履歴から executive path 削除 · `--force-with-lease`（Compliance 推奨） | [ ] |
| B | **新規 private repo** — 現 HEAD のみ · remote 差替 | [ ] |
| C | **現状維持（accepted）** — private 継続 · §案 C 受容 4 条件すべてに同意 | [ ] |

## 案 C 受容（C 選択時のみ · すべて ✓）

- [ ] 公開化予定なし（公開前に A/B 必須）
- [ ] 協力者 clone 棚卸し · 旧 clone 破棄方針
- [ ] 新規 L2 Git 追跡禁止継続
- [ ] 年 1 回 §6 検証

## 実施後

- 案 A/B → Compliance が checklist 実行 · R-001 **closed**
- 案 C → risk-register **accepted** · 本書を Compliance に保管

**Secretary:** 選択後 1 行 relay — 「段が案 _ を選択 · 次は _」
