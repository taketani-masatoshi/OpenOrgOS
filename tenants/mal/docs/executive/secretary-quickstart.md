# Secretary — 使い方クイックスタート

社長（段）向け。**YAML を直接触らなくてよい**運用を目指す。秘書の話し方・長さは [`rules/secretary_behavior.md`](../../rules/secretary_behavior.md) でカスタム可。

**初回 10 分:** [backup-first-run.md](backup-first-run.md) · Google 連携: [google-calendar-setup.md](google-calendar-setup.md)

---

## いまの運用（Phase 1 完了）

| やりたいこと | やり方 |
|-------------|--------|
| 予定を確認 | `npm run steward -- executive calendar list` |
| 競合チェック | `npm run steward -- executive calendar conflicts` |
| 週次ブリーフ | `npm run steward -- executive brief --week` |
| YAML → Google | `executive calendar push`（[google-calendar-setup.md](google-calendar-setup.md)） |
| Google → YAML 差分 | `executive calendar pull --since YYYY-MM-DD` · `--apply` で ID リンク |
| 管轄外 consult | **`secretary escalate --dispatch --subject "…" --q "質問"`**（1 コマンド · スレッド不要） |
| MTG を設定 | 「@secretary_agent 〇〇との mtg を設定して」→ correspondence-drafts |
| 新 clone 後 | `cp *.yaml.example *.yaml` → [backup-first-run.md](backup-first-run.md) |
| 週次バックアップ | SSD コピー → `echo $(date +%Y-%m-%d) > scratch/executive-backup-last.txt` |

正データは **ローカル** `data/executive/*.yaml`（gitignore）。

### カレンダー運用（正規 · 3 行）

1. **SoT は `calendar.yaml`** — 変更は YAML 先 · `push` で Google 反映
2. **スマホのみ変更** — 週 1 回 `pull --apply` · 新規は Secretary が YAML へ（例外）
3. **Meet** — push で自動 · 手動時は YAML `location`

**エスカレ:** `--dispatch` を優先。`MAL · Steward エスカレ` スレッドは **回答待ち** のみ（ピン留め optional）。

---

## Google 連携

| サービス | 用途 | CLI |
|---------|------|-----|
| **Google Calendar** | 表示 · 通知 · Meet | `push` / `pull` |
| **Gmail** | 招待送信 | 下書き MD → compose リンク |
| **Google Drive** | 資料共有（補助） | 予定管理には使わない |

詳細: [google-calendar-setup.md](google-calendar-setup.md)

---

## ロードマップ（残）

| Phase | 内容 | 状態 |
|-------|------|:----:|
| **1** | push · brief · escalate CLI | [x] |
| **2** | pull 差分 · dispatch · validate 未同期 warning | [x] |
| **3** | refresh token 自動 · Calendar 双方向完全同期 | [ ] |

---

## ファイルの見方

```
docs/executive/
├── secretary-quickstart.md          ← 本ファイル
├── backup-first-run.md              ← 初回 10 分
├── google-calendar-setup.md
├── correspondence-drafts/           ← 承認待ち
└── weekly-brief-template.md

data/executive/
├── calendar.yaml           ← 予定 SoT（gitignore）
└── *.yaml.example          ← Git 追跡テンプレ
```

---

## 関連

- [secretary_agent.md](../../steward/core/agents/secretary_agent.md)
- [backup-procedure.md](backup-procedure.md)
- [secretary_steward_boundary.md](../../steward/rules/secretary_steward_boundary.md)
