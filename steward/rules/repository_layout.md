# Steward OS — リポジトリ構成（正本）

**版:** 2026-06-25 · **対象:** 組織 OS 4 層 + テナント · Cursor Rules · 人間

2026-06 テナント分離 · **案 A レイヤ整理** 後の **物理パス正本**。作業前に本書と [folder_access_policy.md](folder_access_policy.md) を参照する。

---

## 5 ゾーン

| ゾーン | パス | 中身 | 索引 |
|--------|------|------|------|
| **フレームワーク** | `steward/` · `src/` · `schemas/` · ルート `docs/` | コア · modules · 法域 · CLI | [README.md](../../README.md) |
| **テナント正データ** | `tenants/{id}/data/` | YAML 正本 | [tenants/00-README.md](../../tenants/00-README.md) |
| **テナント人向け** | `tenants/{id}/docs/` | MD · CSV · PDF 索引 | 各 `tenants/{id}/docs/00-このフォルダについて.md` |
| **テナントルール** | `tenants/{id}/rules/` | 会社固有コンテキスト | `company_context.md` · `active_context.md` |
| **試行** | `scratch/` | gitignore 試行 | [scratch/00-README.md](../../scratch/00-README.md) |

**論理パス:** Agent · CLI ログの `data/` · `docs/` は **アクティブテナント**（`STEWARD_TENANT` または `default: true`）内を指す。

---

## 組織 OS — `steward/` 4 層

```
steward/
├── core/                    ① 常時 — Agent · Skill · routing · orchestrators
├── modules/{id}/            ② 業務 — 横断業種モジュール（module_contract）
├── jurisdiction-packs/{code}/  ③ 法域 — 規程 · 税 seed · 法域固有 modules/
├── jurisdictions/           索引のみ — registry.yaml · packs.lock.yaml · countries.yaml
├── platform/                ④ Phase 2/3 — webhook · cloud agent
├── locale/                  表示言語 registry
├── standards/iso/           ISO テンプレ（横断）
├── standards/regulations/   移設済リダイレクト → jurisdiction-packs/JP/
└── rules/                   原則 · ポリシー · 本書
```

| 層 | パス | 接続 |
|----|------|------|
| **コア** | [core/](core/00-このフォルダについて.md) | 常時有効 · 6 Agent |
| **業務モジュール** | [modules/](modules/00-このフォルダについて.md) | `tenants/{id}/modules.yaml` |
| **法域パック** | [jurisdiction-packs/](jurisdiction-packs/pack_contract.md) | `tenants/{id}/tenant.yaml` · `jurisdiction` |
| **法域索引** | [jurisdictions/](jurisdictions/00-README.md) | `pack_root` pin のみ |
| **プラットフォーム** | [platform/](platform/00-このフォルダについて.md) | webhook / cloud agent 設定 |

**Skill 正本:** コア → `steward/core/skills/` · 業務 → `steward/modules/{id}/skills/`（`registry.yaml` 各所 · 集約 `src/lib/skill-registry.ts`）

**パス定数:** `src/lib/steward-paths.ts`

---

## `tenants/{id}/` 構成

```
tenants/mal/
├── tenant.yaml              テナントメタ · jurisdiction · locale
├── modules.yaml             業務モジュール ON/OFF · パスバインド
├── standards.yaml           ISO 有効化
├── regulations.yaml         社内規程有効化
├── data/                    正データ
├── docs/                    人向け書類
└── rules/
    ├── company_context.md   法人 · 事業 · STK 索引
    └── active_context.md    有効モジュール/規程（sync-context 生成）
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

## `src/` · `schemas/`

| パス | 内容 |
|------|------|
| `src/cli/registrars/` | CLI ドメイン登録（core · platform · executive …） |
| `src/lib/module-cli.ts` | モジュール CLI 集約 · `operations` サブコマンド登録 |
| `src/lib/steward-paths.ts` | steward レイヤ物理パス正本 |
| `src/lib/modules.ts` | 業務 + 法域 pack モジュール解決 |
| `src/lib/skill-registry.ts` | core + module Skill 集約 |
| `schemas/modules/core-ids.ts` | 横断業務モジュール id |
| `schemas/modules/pack-ids.ts` | 法域 pack モジュール id |

---

## ルート `docs/`（フレームワークのみ）

| ファイル | 用途 |
|---------|------|
| [spec.md](../../docs/spec.md) | 仕様正本（CLI · テナント · Phase 1–3） |
| [agent_architecture.md](../../docs/agent_architecture.md) | Agent 設計索引 |
| [org-os/](../../docs/org-os/) | 法域パック契約 · OSS ガバナンス |
| [spec/history/](../../docs/spec/history/) | 旧版 spec アーカイブ |

---

## 関連

- [folder_access_policy.md](folder_access_policy.md) — エージェント別 R/W
- [steward_os_principles.md](steward_os_principles.md) — 4 層原則
- [tenants/00-README.md](../../tenants/00-README.md) — テナント運用
- [modules/module_contract.md](../modules/module_contract.md) — 業務モジュール契約
