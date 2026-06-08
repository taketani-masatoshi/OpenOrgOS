# data/executive — 社長オペレーション正データ

**Owner:** Secretary Agent（秘書エージェント）  
**用途:** 社長のスケジュール・タスク・1-on-1・社外連絡先の Source of Truth

---

## ファイル一覧

| パス | スキーマ | 説明 |
|------|---------|------|
| `calendar.yaml` | calendarFile | 予定（会議・会食・移動・ブロック） |
| `tasks.yaml` | tasksFile | 社長タスク（dashboard P0 とは別） |
| `one-on-ones.yaml` | oneOnOnesFile | 1-on-1 レジストリと次回準備 |
| `external-contacts.yaml` | externalContactsFile | 主要社外連絡先（最小限） |
| `stakeholders.yaml` | stakeholdersFile | **利害関係者レジストリ（gitignore · ローカル正本）** |
| `stakeholders.yaml.example` | stakeholdersFile | テンプレート（Git 追跡） |

プロフィール MD: [`docs/executive/stakeholders/`](../../docs/executive/stakeholders/00-このフォルダについて.md)（実体は gitignore）

---

## 境界

- **Executive Steward** は本ゾーンを **読まない**（経営 KPI は dashboard / agent-summaries 経由）
- **Secretary** は `data/finance/**` · `contracts/**` を **読まない**
- 詳細: [steward/rules/secretary_steward_boundary.md](../../steward/rules/secretary_steward_boundary.md)

---

## 更新手順

1. YAML を編集
2. `npm run validate`
3. 週次ブリーフは `docs/executive/` テンプレに沿って Secretary が生成

*将来: `steward executive` CLI でカレンダー同期を検討（Phase 0 では未実装）*
