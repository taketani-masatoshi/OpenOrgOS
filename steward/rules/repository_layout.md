# Steward OS — リポジトリ構成（正本）

**版:** 2026-06-08 · **対象:** 6 コア Agent + 業務モジュール · Cursor Rules · 人間

2026-06 テナント分離後の **物理パス正本**。エージェントは作業前に本書と [folder_access_policy.md](folder_access_policy.md) を参照する。

---

## 5 ゾーン

| ゾーン | パス | 中身 | 索引 |
|--------|------|------|------|
| **フレームワーク** | `steward/` · `src/` · `schemas/` · ルート `docs/` | コア Agent · modules · standards · CLI | [README.md](../../README.md) |
| **テナント正データ** | `tenants/{id}/data/` | YAML 正本 | [tenants/00-README.md](../../tenants/00-README.md) |
| **テナント人向け** | `tenants/{id}/docs/` | MD · CSV · PDF 索引 | 各 `tenants/{id}/docs/00-このフォルダについて.md` |
| **テナントルール** | `tenants/{id}/rules/` | 会社固有コンテキスト | `company_context.md` |
| **試行** | `scratch/` | gitignore 試行 | [scratch/00-README.md](../../scratch/00-README.md) |

**論理パス:** Agent · CLI ログの `data/` · `docs/` は **アクティブテナント**（`STEWARD_TENANT` または `default: true`）内を指す。

---

## `tenants/{id}/` 構成

```
tenants/mal/
├── tenant.yaml              テナントメタ
├── modules.yaml             業務モジュール ON/OFF
├── data/                    正データ
├── docs/                    人向け書類
└── rules/
    └── company_context.md   法人 · 事業 · STK 索引
```

---

## `tenants/{id}/docs/` ドメイン

```
docs/
├── io/inbox|outbox/     受信 · 出力トレイ
├── company/             法人 · 規程 · HR · 許認可
├── finance/             経理 · 税務
├── properties/          PROP-001 · PROP-002
├── compliance/          テナント ISO 記録 · 個情（標準は steward/standards/iso/）
├── contracts/           契約書 MD
├── exports/             CSV
├── plans/               決算 · 予実
├── executive/           秘書向け
└── reports/             CLI 生成
```

---

## `tenants/{id}/data/` 主要パス

| 論理パス | 用途 |
|---------|------|
| `company.yaml` | 会社概要 |
| `properties/PROP-{NNN}.yaml` | 物件 |
| `contracts/CTR-{NNN}.yaml` | 契約 |
| `finance/**` | 月次 · 口座（L2 gitignore） |
| `plans/**` | 計画 YAML |
| `executive/**` | 秘書 SoT |
| `classification-registry.yaml` | L0–L3 分類 |

---

## `steward/` 定義（汎用）

| パス | 内容 |
|------|------|
| [agents/](../agents/00-このフォルダについて.md) | 6 コア Agent 定義 |
| [modules/](../modules/00-このフォルダについて.md) | 業務モジュールカタログ · `{id}/seed/` 雛形 |
| [standards/iso/](../standards/iso/00-このフォルダについて.md) | ISO 標準テンプレート（汎用） |
| [skills/](../skills/00-このフォルダについて.md) | Skill 定義 |
| [rules/](00-このフォルダについて.md) | 原則 · ポリシー · **本書** |
| [orchestrators/](../orchestrators/00-このフォルダについて.md) | 横断ワークフロー |

---

## ルート `docs/`（フレームワークのみ）

| ファイル | 用途 |
|---------|------|
| [spec-v0.2.md](../../docs/spec-v0.2.md) | CLI 仕様 |
| [agent_architecture.md](../../docs/agent_architecture.md) | 8 Agent 設計 |

---

## 関連

- [folder_access_policy.md](folder_access_policy.md) — エージェント別 R/W
- [steward_os_principles.md](steward_os_principles.md) — 4 層原則
- [tenants/00-README.md](../../tenants/00-README.md) — テナント運用
