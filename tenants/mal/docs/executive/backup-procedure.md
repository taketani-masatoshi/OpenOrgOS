# Executive データ — バックアップ手順

**Owner:** Operations · **Secretary SoT 整合:** REG-009 第7条（情報資産の保管・廃棄）  
**対象:** `data/executive/*.yaml` · `docs/executive/correspondence-drafts/` · `one-on-one-prep-*.md` · `stakeholders/*.md`（いずれも **Git 非追跡 · ローカル正本**）

---

## 方針

executive 正本は **Git に載せない**。消失リスクは **Git 以外のバックアップ** で緩和する。Time Machine のみに依存しない。

| 方式 | 用途 | 頻度 | 備考 |
|------|------|------|------|
| **A. macOS Time Machine** | 開発 Mac 全体 | 自動（日次） | 手軽だが単一端末依存 |
| **B. 暗号化 USB / 外付 SSD** | executive フォルダのみ手動コピー | 週次（Secretary 確認） | `cp -a tenants/mal/data/executive tenants/mal/docs/executive /Volumes/BACKUP/steward-executive-$(date +%Y%m%d)/` |
| **C. 社内 NAS / iCloud Drive（個人アカウント不可）** | 会社管理の暗号化共有 | 日次 sync | REG-009 · アクセス権は段 + Secretary のみ |
| **D. オフサイト（将来）** | クラウド vault（会社契約） | — | Phase 2 候補 · Compliance 承認後 |

**推奨最小構成:** A（自動）+ B（週次手動）の併用。

---

## Git 履歴清掃前後の正本保全（filter-repo / repo 移行時）

**実施タイミング:** Compliance が案 A または B を実行する **直前** と **直後**（[git-history-remediation.md](../compliance/privacy/git-history-remediation.md)）。

1. **清掃前:** 暗号化 SSD へ `cp -a tenants/mal/data/executive tenants/mal/docs/executive /Volumes/BACKUP/steward-executive-pre-filter-$(date +%Y%m%d)/` — Git 操作は **mirror のみ**、作業 Mac の正本 tree は触らない。
2. **清掃中:** 正本は Git 非追跡のまま維持 · `git filter-repo` は **bare mirror** 上のみ実行（誤って正本 YAML を commit しない）。
3. **清掃後:** 協力者が fresh clone したあと、SSD から `data/executive/*.yaml` · `docs/executive/correspondence-drafts/` · `one-on-one-prep-*.md` を **上書き復元** → `npm run validate` · Secretary で calendar/tasks 整合確認。
4. **記録:** `scratch/executive-backup-last.txt` 更新 · ISO 運用記録 1 行（清掃前後で計 2 行可）。

---

## Secretary 週次確認（3 行 · **毎週月曜**）

1. 暗号化 SSD で §「手順 B」を実施したか — 未実施なら段へ「今週バックアップ未実施」と報告
2. 実施後: `echo $(date +%Y-%m-%d) > scratch/executive-backup-last.txt`（validate · `npm run weekly` が 7 日超で warning）
3. ISO 運用記録 1 行追記（下記 §ISO 運用記録）

**段への確認テンプレ（Secretary）:** 「今週の executive バックアップ（USB/SSD）は実施済みでしょうか。未実施の場合は本日中の実施をお願いします。」

---

## 手順（週次 · Operations / Secretary）

1. `npm run validate` — executive YAML が存在することを確認（未作成時は警告）
2. 外付 SSD を接続（FileVault またはボリューム暗号化済み）
3. 上記 **B** のコマンドで `data/executive` と `docs/executive`（下書き・prep 含む）を日付付きでコピー
4. コピー先を eject · 社内金庫または段指定の保管場所へ
5. ISO-27001 運用記録 1 行追記（下記 §ISO 運用記録）
6. `echo $(date +%Y-%m-%d) > scratch/executive-backup-last.txt`

---

## リストア（新 Mac / clone 後）

1. `data/executive/` で `cp *.yaml.example *.yaml`（[00-README](../../data/executive/00-README.md)）
2. 最新バックアップ（B または C）から `*.yaml` · 下書き MD を **上書き復元**
3. `npm run validate` · Secretary で calendar/tasks の整合確認

---

## ISO 運用記録（1 行 · REG-009 / ISO-27001）

`docs/compliance/iso/ISO-27001/operations-log.md` に追記:

```markdown
| YYYY-MM-DD | executive バックアップ | SSD 週次コピー実施 · scratch/executive-backup-last.txt 更新 | Secretary |
```

---

## 四半期リストア演習（1 行 · ISO-27001）

**頻度:** 四半期 1 回（1・4・7・10 月第 1 週推奨）  
**内容:** 最新 SSD バックアップから **1 ファイル**（例: `calendar.yaml`）を別名で復元 → `npm run validate` → 元に戻す  
**記録:** `docs/compliance/iso/ISO-27001/operations-log.md` に 1 行 — `executive リストア dry-run · 成功`

---

## 関連

- [data/executive/00-README.md](../../data/executive/00-README.md)
- [git-history-remediation.md](../compliance/privacy/git-history-remediation.md)
- REG-009 情報セキュリティ管理規程 第7条
