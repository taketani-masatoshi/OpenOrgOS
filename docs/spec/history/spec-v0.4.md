> **履歴アーカイブ — 正本は [docs/spec.md](../../spec.md)。** 本書は凍結コピー。

# Steward OS — Specification v0.4

> **正本:** 本ドキュメント（骨格 v2 · 100%）。v0.3 は [spec-v0.3.md](spec-v0.3.md)（履歴）。

## v0.4 変更概要（骨格 v2 100%）

| 領域 | 追加 · 変更 |
|------|------------|
| **完成度** | [framework-assessment.md](framework-assessment.md) §7 = 100% · DoD D1–D10 |
| **バックログ** | [framework-backlog.md](framework-backlog.md) SKEL-100 系列 |
| **第 3 テナント** | `tenants/acme/` — `tenant init` 参照 · validate · CI |
| **tenant init** | `*.yaml.example` コピー · executive gitignore パターン |
| **map CLI** | `steward map list` · `steward map resolve <path>` |
| **modules** | `steward modules check --all` · restaurant 骨格 seed |
| **品質ゲート** | `npm run check` = validate · demo · acme · modules --all · classification |

v0.3 の §1–§11 は **有効**（本書で上書きした条項を除く）。

---

## 1. 目的

（v0.3 §1 と同旨）Steward OS は **テナント分離型の経営支援フレームワーク**。

---

## 2. 参照テナント（骨格）

| テナント | 用途 |
|---------|------|
| `tenants/demo/` | 最小骨格 · 賃貸1物件 · MAL パス非依存 |
| `tenants/acme/` | 第3転用性実証 · `tenant init` 生成物 |
| `tenants/_template/` | init ソース · example のみ Git 追跡（executive 等） |

```bash
npm run steward -- tenant init acme --name "ACME Corp" --from rental
npm run steward -- --tenant acme validate
npm run check
```

---

## 3. map CLI（v0.4 新設）

論理パス（`data/` · `docs/` · `steward/modules/`）を物理パスに解決する。

```bash
npm run steward -- map list
npm run steward -- map resolve data/company.yaml
npm run steward -- map resolve steward/modules/rental
```

実装: `src/lib/tenant-map.ts` · `src/commands/map.ts`

---

## 4. データ分類 · executive gitignore

- `data/executive/*.yaml`（calendar · tasks · one-on-ones · external-contacts · stakeholders）は **Git 非追跡**
- `*.yaml.example` のみ追跡 · `classification-registry.yaml` の `git: ignore` と `.gitignore` 双方向整合
- 正本: テナント `data/classification-registry.yaml` · `_template` 骨格

---

## 5. MVP CLI 一覧（v0.4 追加分）

v0.3 §9 に加え:

14. **map** — `steward map list` · `steward map resolve`
15. **modules check --all** — catalog 全件（tier  aware）

---

## 6. 評価 · バックログ

| 文書 | スコープ |
|------|---------|
| [framework-assessment.md](framework-assessment.md) §7 | 骨格 v2 **100%** |
| [framework-backlog.md](framework-backlog.md) | SKEL-100 タスク |
| [framework-executive-notes.md](framework-executive-notes.md) | ブロッカー（5 行以内） |

---

## 7. 関連

- [spec-v0.3.md](spec-v0.3.md)
- [spec/invoice.md](spec/invoice.md)
- [spec/yojitsu-v2.md](spec/yojitsu-v2.md)
