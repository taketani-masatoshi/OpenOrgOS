# Steward OS — リポジトリ構成（正本）

**版:** 2026-06-07 · **対象:** 全 8 Agent · Cursor Rules · 人間

2026-06 再編後の **物理パス正本**。エージェントは作業前に本書と [folder_access_policy.md](folder_access_policy.md) を参照する。

---

## 4 ゾーン

| ゾーン | パス | 中身 | 索引 |
|--------|------|------|------|
| **正データ** | `data/` · `scratch/` | YAML 正本 · 試行（scratch は gitignore） | [data/00-README.md](../../data/00-README.md) |
| **人向け** | `docs/` | MD · CSV · PDF | [docs/00-このフォルダについて.md](../../docs/00-このフォルダについて.md) |
| **定義** | `steward/` | Agent · Skill · Rules · Orchestrators | [steward/agents/](../agents/00-このフォルダについて.md) |
| **プログラム** | `src/` · `schemas/` · `assets/` | CLI · 検証 · フォント | ルート [README.md](../../README.md) |

**原則:** 「誰が読むか」でフォルダを決める。CLI/Cursor の生成元では決めない。

---

## `docs/` ドメイン

```
docs/
├── io/inbox/          受信トレイ
├── io/outbox/         出力トレイ（corporate/ に決算 PDF）
├── company/           法人 · 規程 · HR · 許認可（旧 docs/corporate/）
├── finance/           経理 · 税務 · 会計テンプレ（旧 operations/accounting/）
├── properties/        PROP-001-bancho · PROP-002-kamezawa
├── compliance/        ISO · 個情（旧 operations/privacy/）
├── contracts/         契約書 MD
├── exports/           CSV 正本（旧 docs/data/）
├── plans/             決算書 · 予実 MD
├── executive/         秘書向けテンプレ
└── reports/           CLI 生成 · agent-summaries/
```

---

## `data/` 主要パス

| パス | 用途 |
|------|------|
| `company.yaml` | 会社概要 |
| `properties/PROP-{NNN}.yaml` | 物件 |
| `contracts/CTR-{NNN}.yaml` | 契約 |
| `finance/**` | 月次 · 口座（L2 gitignore）· 固定資産 |
| `plans/**` | 計画 YAML |
| `executive/**` | 秘書 SoT（stakeholders は gitignore） |
| `operations/kamezawa-*.yaml` | 旅館公開/機密 |
| `document-io.yaml` | inbox/outbox 台帳 |
| `classification-registry.yaml` | L0–L3 分類正本 |

---

## `steward/` 定義

| パス | 内容 |
|------|------|
| [agents/](../agents/00-このフォルダについて.md) | 8 Agent 定義 |
| [skills/](../skills/00-このフォルダについて.md) | Skill 定義 |
| [rules/](00-このフォルダについて.md) | 原則 · ポリシー · **本書** |
| [orchestrators/](../orchestrators/00-このフォルダについて.md) | 横断ワークフロー |

---

## 削除済みレガシー（参照禁止）

| 旧パス | 移行先 |
|--------|--------|
| `cursor/data/` | `data/` |
| `cursor/scratch/` | `scratch/` |
| `prompts/*.md` | `steward/agents/` · `steward/skills/` |
| `docs/corporate/` | `docs/company/` |
| `docs/data/*.csv` | `docs/exports/` |
| `docs/operations/` | `docs/finance/` · `docs/company/hr/` · `docs/properties/` · `docs/compliance/` |

---

## 関連

- [folder_access_policy.md](folder_access_policy.md) — エージェント別 R/W
- [steward_os_principles.md](steward_os_principles.md) — 4 層原則
- [.cursor/rules/steward.mdc](../../.cursor/rules/steward.mdc) — Cursor 要約
