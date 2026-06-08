# Git 履歴 — executive 個情の残存リスク

**対象:** `data/executive/calendar.yaml` · `tasks.yaml` · `one-on-ones.yaml` · `external-contacts.yaml`（2026-06 以前に Git 追跡されていた期間）

## 履歴対策要否（Compliance 判断 · 2026-06-09）

**filter-repo: 要（段承認後に実施）。** 2026-06-09 時点で `calendar.yaml` · `tasks.yaml` · `one-on-ones.yaml` · `external-contacts.yaml` は index から削除済みだが、**リモート履歴の blob に個人名・予定・社外関係が残存**する。private repo かつ clone 限定でも、fork・キャッシュ・旧 clone が漏えい経路になりうる。`.gitignore` は前方適用のみのため、**`git filter-repo`（対象4 path 個別削除）+ `--force-with-lease`**、または **新規 private repo へ履歴なし移行**を推奨。公開化予定がなければ filter-repo は「中」優先度（R-001 mitigated 維持 · 清掃完了で closed）。

## 参照

- [classification-registry.yaml](../../../data/classification-registry.yaml) — RES-EXEC-*
- [risk-register.csv](../iso/ISO-27001/risk-register.csv) — R-001
