# Git 履歴 — executive 個情の残存リスク（SEC-P0-2）

**Risk:** R-001 · **Owner:** Compliance · **Operations 補助:** [backup-procedure.md](../../executive/backup-procedure.md) §Git 履歴清掃  
**Secretary 返却 1 行:** 「履歴対策 — [git-history-decision.md](git-history-decision.md) で **案 A / 案 C** を選択（推奨: 案 A）」

---

## 段向け判断メモ（1 ページ · L2 値なし）

### 問題

executive 正本（予定 · タスク · 1-on-1 · 社外連絡 · 利害関係者 · 下書き文面）は **現 HEAD では gitignore 済み**。  
ただし **2026-06 以前の commit blob** に個人名付きファイル名・予定・下書きが残存しうる（`git log --all -- tenants/mal/data/executive/` で 3 commit 確認済み）。forward-only の gitignore では **過去履歴は消えない**。

### 3 案 + リスク比較

| 案 | 概要 | 残存リスク | 工数 | 可逆性 |
|----|------|-----------|------|--------|
| **A. filter-repo** ◎ | 対象 path を全履歴から削除 · `--force-with-lease` push | **低**（協力者 clone 更新後） | 中（1 回 · 2–4h） | 低（mirror バックアップ必須） |
| **B. 新規 private repo** | 現 HEAD を initial commit · remote 差替 | **低**（履歴ゼロ） | 高（CI/連携再設定） | 低 |
| **C. 現状維持** | private 継続 · 新規 commit 禁止のみ | **中〜高**（旧 clone/fork/cache） | ゼロ | — |

**Compliance 推奨:** **案 A**（非公開継続でも **中優先度で 1 回実施**）。外部協力者追加 · 公開化 · 監査提出前は **必須**。案 B は A 失敗時のフォールバック。

### 案 C — 受容条件（accepted にできる条件）

段が **書面（本ファイルへの initials または issue コメント）** で以下 **すべて** を選択した場合のみ R-001 を `accepted` にできる:

1. リポジトリを **private 継続** · 公開化予定なし（または公開前に必ず A/B 実施）
2. 協力者 clone を **棚卸し** — 不要な fork / 旧 Mac の clone を破棄または再 clone 方針を文書化
3. **新規 L2 の Git 追跡禁止** を継続（`classification check` · pre-commit 運用）
4. **年 1 回** 本メモ §6 検証コマンドで blob 残存を再確認

---

## 1. 現状（2026-06-09）

| 項目 | 状態 |
|------|------|
| index（現 HEAD） | executive 実 YAML · 下書き MD · STK 実プロフィールは **非追跡** |
| `.gitignore` | RES-EXEC-* 整合 · `npm run orgos -- classification check` ✓ |
| **リモート履歴 blob** | **残存** — 下記 path が過去 commit に存在（実測） |

---

## 2. 対象 path（filter-repo 候補 · 正本）

### 削除対象（`--invert-paths` · L2 実データ）

| path | 備考 |
|------|------|
| `tenants/mal/data/executive/calendar.yaml` | 予定 · 個人名 |
| `tenants/mal/data/executive/tasks.yaml` | タスク |
| `tenants/mal/data/executive/one-on-ones.yaml` | 1-on-1 |
| `tenants/mal/data/executive/external-contacts.yaml` | 社外連絡 |
| `tenants/mal/data/executive/stakeholders.yaml` | 利害関係者（履歴に無い場合も将来漏洩防止で指定可） |
| `tenants/mal/docs/executive/correspondence-drafts/` | 下書き MD 一式 |
| `tenants/mal/docs/executive/one-on-one-prep-*.md` | prep 実ファイル（`*-taketani.md` 等 · 履歴実測） |

### 削除しない（追跡テンプレ · L0/L1 運用文書）

| path | 理由 |
|------|------|
| `tenants/mal/data/executive/*.example.yaml` | 匿名サンプル |
| `tenants/mal/data/executive/00-README.md` | 運用 README |
| `tenants/mal/docs/executive/stakeholders/*.example.md` | 匿名 STK サンプル |
| `tenants/mal/docs/executive/correspondence-drafts/00-*` · `*.example.md` | テンプレ |
| `tenants/mal/docs/executive/one-on-one-prep-*.example.md` | prep テンプレ |
| `secretary-quickstart.md` · `one-on-one-guide.md` · `weekly-brief-template.md` 等 | L1 運用ドキュメント |

`paths-filter-repo.txt` 例（mirror 作業ディレクトリに配置）:

```
tenants/mal/data/executive/calendar.yaml
tenants/mal/data/executive/tasks.yaml
tenants/mal/data/executive/one-on-ones.yaml
tenants/mal/data/executive/external-contacts.yaml
tenants/mal/data/executive/stakeholders.yaml
tenants/mal/docs/executive/correspondence-drafts/
tenants/mal/docs/executive/one-on-one-prep-
```

---

## 3. 実施チェックリスト — 案 A（filter-repo）

### 事前

- [ ] **段承認**（本メモ §段向け · 案 A 選択）
- [ ] **Operations:** [backup-procedure.md §Git 履歴清掃](../../executive/backup-procedure.md#git-履歴清掃前後の正本保全) — ローカル正本を SSD に退避
- [ ] 協力者へ **72h 前** 通知:「`main` force-push 予定 · 作業中は push 禁止 · 完了後 fresh clone または hard reset」
- [ ] bare mirror: `git clone --mirror git@github.com:ORG/Steward.git steward-mirror.git`
- [ ] mirror を **別ディスク** に丸ごとコピー（ロールバック用）
- [ ] `pip install git-filter-repo`（未導入時）

### 実行（mirror 上 · 作業 clone ではない）

```bash
cd steward-mirror.git
git filter-repo --paths-from-file paths-filter-repo.txt --invert-paths
git push --force-with-lease origin 'refs/heads/*'
git push --force-with-lease origin 'refs/tags/*'   # tag がある場合
```

### 事後 · 検証

- [ ] §6 検証コマンド — 対象 path の `git log` が **空**
- [ ] 全協力者: 旧 clone 破棄 → 新 clone（または `git fetch --all && git reset --hard origin/main`）
- [ ] GitHub: 不要 fork · Dependabot cache · Actions artifact に旧 blob が無いか目視
- [ ] ローカル正本を SSD から **復元**（Git には載せない）
- [ ] `npm run validate` · `classification check` ✓
- [ ] R-001 → **closed**（§4）· ISO 運用記録 §5

---

## 4. 実施チェックリスト — 案 B（新規 private repo）

### 事前

- [ ] 段承認（案 B 選択 · 案 A 不可の理由を 1 行記録）
- [ ] Operations 正本退避（案 A と同様）
- [ ] 新 repo 作成（private）· アクセス権は現 repo と同一最小集合
- [ ] CI secrets · branch protection · Cursor / webhook URL 一覧

### 実行

- [ ] 作業 tree で `git checkout --orphan clean-main` · 現 HEAD 内容のみ commit
- [ ] 新 remote へ push · 旧 remote を archive または delete（段判断）
- [ ] 協力者へ remote URL 変更通知 · 全員 fresh clone

### 事後 · 検証

- [ ] 新 repo に **履歴 1 commit のみ**
- [ ] 旧 repo が archive 済み · fork 無効化
- [ ] 正本復元 · validate ✓
- [ ] R-001 → **closed**

---

## 5. R-001 ステータス更新条件

| ステータス | 条件 | risk-register |
|-----------|------|---------------|
| **mitigated**（現状） | index 非追跡 · gitignore 整合 · 新規 L2 commit なし | `status=mitigated` |
| **accepted** | 段が **案 C** を §案 C 受容条件すべてで明示選択 | `status=accepted` · `treatment` に受容日 |
| **closed** | **案 A または B 完了** · §6 検証 OK · 協力者 clone 更新確認 | `status=closed` · `review_date` 更新 |

`risk-register.csv` 更新例:

```csv
# accepted（案 C）
R-001,...,accepted,YYYY-MM-DD

# closed（案 A/B 完了）
R-001,...,closed,YYYY-MM-DD
```

---

## 6. 事後検証コマンド（L2 出力なし）

```bash
# 各 path で commit が残っていないこと（出力空 = OK）
git log --all --oneline -- tenants/mal/data/executive/calendar.yaml
git log --all --oneline -- tenants/mal/docs/executive/correspondence-drafts/
git log --all --oneline -- tenants/mal/docs/executive/one-on-one-prep-

# 現 index に L2 実ファイルが無いこと
git ls-files tenants/mal/data/executive/ tenants/mal/docs/executive/correspondence-drafts/
```

---

## 7. ISO-27001 運用記録（1 行テンプレ）

[operations-log.md](../iso/ISO-27001/operations-log.md):

```markdown
| YYYY-MM-DD | executive Git 履歴清掃 | 案 A filter-repo 完了 · R-001 closed · 検証 §6 OK | Compliance |
```

---

## 参照

- [git-history-decision.md](git-history-decision.md) — **段の選択欄のみ**
- [risk-register.csv](../iso/ISO-27001/risk-register.csv)
- [backup-procedure.md](../../executive/backup-procedure.md)
