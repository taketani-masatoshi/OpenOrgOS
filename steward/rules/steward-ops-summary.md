---
description: Steward OS tenant/docs layout — summary (domain detail in 09-openorgos-domain)
globs: "tenants/**/*,scratch/**/*,docs/**/*"
alwaysApply: false
---

# Steward OS 運用ルール（要約）

**詳細ドメイン（4 層 · Catalog/Roster · Wire）:** [engineering/09-openorgos-domain.md](engineering/09-openorgos-domain.md)

## 4 層（1 行）

Steward → Agent → Skill + CLI → Data — 詳細は上記 09 参照 · [steward_os_principles.md](steward_os_principles.md)

**テナント:** `tenants/{id}/`（既定: `mal`）。論理 `data/` · `docs/` はアクティブテナント内。

- **Steward:** `docs/reports/agent-summaries/` + dashboard のみ原則読取
- **Agent:** 部門フォルダ · Skill dispatch
- **Skill:** `steward/core/skills/`

## 分け方の原則

**「誰が読むか」でフォルダを決める。**

| ゾーン | パス | 中身 |
|--------|------|------|
| **データ** | `tenants/{id}/data/` `scratch/` | YAML 正データ + 試行 |
| **人** | `tenants/{id}/docs/` · ルート `docs/` | 書類 MD · フレームワーク仕様 |
| **定義** | `steward/` | Agent · Skill · Rules |
| **プログラム** | `src/` `schemas/` | TS |

## 必須 CLI

1. `data/` YAML 更新 → `npm run validate`
2. 試行は `scratch/` → 確定後 `docs/` または `data/` へ

## 参照

- [repository_layout.md](repository_layout.md)
- [folder_access_policy.md](folder_access_policy.md)
- [operator-policy.md](operator-policy.md)
