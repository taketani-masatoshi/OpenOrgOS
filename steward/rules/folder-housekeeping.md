# Steward OS — フォルダ整理・定期片付け

**版:** 2026-07-09 · **正本:** 本ファイル · **上位:** [repository_layout.md](repository_layout.md) · [folder_access_policy.md](folder_access_policy.md)

「綺麗に分類する」ことより **誰が読むか・どこが正本か** を守るための軽量メンテナンス手順。

---

## 1. 置き場の原則（再掲）

| 置くもの | 正しい場所 | 置かない |
|---------|-----------|---------|
| 会社 YAML 正本 | `tenants/{id}/data/` | ルート `data/` · ルート `docs/` |
| 会社 MD · CSV · PDF | `tenants/{id}/docs/` | ルート `docs/`（フレームワーク仕様のみ） |
| 試行・下書き | `scratch/`（gitignore） | `data/` · `docs/` 直置き |
| Agent · Skill 定義 | `steward/` | `.cursor/` 単独正本 |
| CLI · 検証 | `src/` · `schemas/` | `scratch/` 確定後放置 |
| プロトコル dev ランタイム | ルート `data/hub-*` · `proposal3-pki/` | テナント `data/` と混同しない |
| IDE ミラー | `.cursor/rules/`（sync 生成） | ポリシー正本 |

**論理パス** `data/` · `docs/` は常に **アクティブテナント**（`ORGOS_TENANT`）内を指す。

---

## 2. 定期片付け（推奨頻度）

| 頻度 | コマンド | 内容 |
|------|---------|------|
| **週次** | `npm run housekeeping` | 残骸検出 · 安全な自動削除（`--fix`） |
| **月次** | 上記 + 目視 | legacy スタブ期限 · `scratch/` 確定物の昇格 |
| **四半期** | `npm run weekly` 前後 | `tenants/*-demo` 触らない確認 · 索引 MD 更新 |

週次パイプラインに組み込む場合:

```bash
npm run housekeeping -- --fix
npm run weekly
```

---

## 3. チェック項目（`orgos housekeeping`）

| ID | 検出内容 | 既定 | `--fix` |
|----|---------|------|---------|
| `root_cursor_dir` | 空のルート `cursor/`（`.cursor/` と別） | warn | 削除 |
| `root_tgz` | ルート `orgos-*.tgz`（npm pack 成果物） | warn | 削除 |
| `scratch_ds_store` | `scratch/.DS_Store` | warn | 削除 |
| `tenant_empty_corporate` | 空の `tenants/*/docs/corporate/` | warn | 削除 |
| `tenant_legacy_csv` | `tenants/*/docs/data/*.csv`（`exports/` と重複） | warn | CSV 削除 + リダイレクト stub 確認 |
| `root_data_readme` | ルート `data/00-README.md` 欠落 | warn | —（手動） |
| `scratch_stale` | `scratch/` 内 30 日超の試行ファイル | info | —（手動で昇格 or 削除） |

**`--fix` が触らないもの（手動判断）:**

- `tenants/mal/data/**` 等の正データ
- legacy スタブ（`docs/inbox/` 等）— 2026-12 まで維持
- `node_modules/` · `dist/` · `.orgos/`
- L2 gitignore 配下

---

## 4. 手動チェックリスト（月次 5 分）

- [ ] `scratch/` に確定物が残っていないか → `data/` または `docs/` へ移動
- [ ] `docs/exports/*.csv` が `orgos sync` と整合しているか
- [ ] ルートにビルド成果物（`*.tgz` · 空 `cursor/`）がないか
- [ ] テナント `docs/` に **正本と重複する旧パス**（`docs/data/` 等）へ新規ファイルを置いていないか
- [ ] データ変更後 `npm run validate` を実行したか

---

## 5. legacy パス（mal テナント）

2026-06 再編で canonical へ移行済み。スタブは **2026-12 まで** 維持。

| 旧パス | 正本 |
|--------|------|
| `docs/inbox/` | `docs/io/inbox/` |
| `docs/outbox/` | `docs/io/outbox/` |
| `docs/iso/` | `docs/compliance/iso/` |
| `docs/data/*.csv` | `docs/exports/*.csv` |

新規ファイルは **正本のみ** に置く。リンク修正時は `docs/exports/` · `docs/io/` を使う。

---

## 6. 関連

- [repository_layout.md](repository_layout.md) — 5 ゾーン物理正本
- [steward_os_principles.md](steward_os_principles.md) — 4 層 · 整理の目的
- [tool-neutral-development.md](tool-neutral-development.md) — `.cursor/` はミラーのみ

**CLI:** `orgos housekeeping [--fix] [--json]`
