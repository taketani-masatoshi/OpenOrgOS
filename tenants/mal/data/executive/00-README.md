# data/executive — 社長オペレーション正データ

**Owner:** Secretary Agent（秘書エージェント）  
**用途:** 社長のスケジュール・タスク・1-on-1・社外連絡先の Source of Truth

---

## Git 追跡とローカル正本

| パス | Git | 説明 |
|------|-----|------|
| `*.yaml.example` | **追跡** | スキーマ・構造のテンプレート（個人名は示例のみ） |
| `calendar.yaml` 等 4 ファイル | **非追跡** | ローカル正本（社外氏名・予定 · gitignore） |
| `stakeholders.yaml` | **非追跡** | 利害関係者レジストリ（同上） |
| `00-README.md` | 追跡 | 本ファイル |

**初回セットアップ（新 clone 後）:**

```bash
cd tenants/{id}/data/executive
for f in calendar tasks one-on-ones external-contacts; do
  cp "${f}.yaml.example" "${f}.yaml"
done
cp stakeholders.yaml.example stakeholders.yaml   # 未作成の場合
```

**バックアップ（Git 以外）:** [docs/executive/backup-procedure.md](../../docs/executive/backup-procedure.md)（Time Machine + 週次暗号化 SSD 推奨 · REG-009 第7条参照）。

**validate:** `npm run validate` — executive YAML 未作成時に **警告** を表示。

---

## ファイル一覧

| パス | スキーマ | 説明 |
|------|---------|------|
| `calendar.yaml` | calendarFile | 予定（会議・会食・移動 · **gitignore**） |
| `tasks.yaml` | tasksFile | 社長タスク（**gitignore**） |
| `one-on-ones.yaml` | oneOnOnesFile | 1-on-1 レジストリ（**gitignore**） |
| `external-contacts.yaml` | externalContactsFile | 社外連絡先（**gitignore**） |
| `stakeholders.yaml` | stakeholdersFile | 利害関係者（**gitignore**） |
| `*.yaml.example` | 各スキーマ | テンプレート（Git 追跡） |

プロフィール MD: [`docs/executive/stakeholders/`](../../docs/executive/stakeholders/00-このフォルダについて.md)（実体は gitignore）

---

## 境界

- **Executive Steward** は本ゾーンを **読まない**（経営 KPI は dashboard / agent-summaries 経由）
- **Secretary** は `data/finance/**` · `contracts/**` を **読まない**
- 詳細: [steward/rules/secretary_steward_boundary.md](../../steward/rules/secretary_steward_boundary.md)

---

## 更新手順

1. ローカル `*.yaml` を編集（Git には載らない）
2. `npm run validate`
3. 週次ブリーフは `docs/executive/` テンプレに沿って Secretary が生成

*将来: `steward executive` CLI でカレンダー同期を検討（Phase 0 では未実装）*
