# Secretary — 使い方クイックスタート

社長（段）向け。**YAML を直接触らなくてよい**運用を目指す。秘書の話し方・長さは [`rules/secretary_behavior.md`](../../rules/secretary_behavior.md) でカスタム可。

---

## いまの Phase 0（今日から）

| やりたいこと | やり方 |
|-------------|--------|
| 予定を確認 | Cursor で「今週の予定を見せて」→ **ローカル** `data/executive/calendar.yaml` を要約（Git 非追跡） |
| MTG を設定 | 「@secretary_agent 〇〇との mtg を設定して」→ **アクションカード**が `correspondence-drafts/` にできる |
| 招待を送る | 下書き MD の **3ステップ**（カレンダー追加 → Gmail → **ローカル YAML** 更新） |
| 1-on-1 準備 | `one-on-one-prep-*.md` を開く |
| 新 clone 後 | `data/executive/` で `cp *.yaml.example *.yaml`（[00-README](../../../data/executive/00-README.md)） |

正データは **ローカル** `data/executive/*.yaml`（gitignore）。Git には `*.example.yaml` のみ。人が触るのは **下書き MD のリンク** が中心。

---

## Google 連携 — 何を使うべきか

| サービス | 優先度 | 用途 | Steward との関係 |
|---------|--------|------|-----------------|
| **Google Calendar** | ★★★ 最優先 | 予定・リマインド・Meet URL | YAML → カレンダーへ **書き出し**（Phase 1） |
| **Gmail** | ★★☆ | 招待メール送信 | 下書き MD から compose リンクで開く（Phase 0 で可） |
| **Google Meet** | ★★☆ | オンライン MTG | Calendar 予定に付与（手動 or Calendar API） |
| **Google Drive** | ★☆☆ 後回し | 資料共有・PDF 保管 | **予定管理には向かない**。契約 PDF 等は `docs/` + Drive ミラーが現実的 |

### 結論

- **日程調整には Google Drive ではなく Google Calendar。**
- Drive は「議事録・契約 PDF を相手と共有したい」ときの補助。
- Steward の SoT は YAML のまま。Calendar は **表示・通知用のミラー** にする（双方向同期は Phase 2 以降で検討）。

---

## ロードマップ

| Phase | 内容 | 体験 |
|-------|------|------|
| **0（今）** | YAML + アクションカード MD + Calendar/Gmail リンク | 3クリックで招待 |
| **1** | `steward executive calendar push` — YAML → Google Calendar API | Agent が予定登録、Meet 自動付与 |
| **1** | `steward executive brief` — 週次ブリーフ自動生成 | 月曜朝に今日やることが1枚 |
| **2** | Calendar → YAML 差分取込（変更検知） | スマホで動かした予定も SoT に反映 |

OAuth・サービスアカウントは Phase 1 で `.env` 管理（gitignore）。

---

## ファイルの見方

```
docs/executive/
├── secretary-quickstart.md          ← 本ファイル
├── correspondence-draft-template.md ← Agent が下書きを作る型
├── correspondence-drafts/           ← 承認待ち（★ ここを開く）
├── one-on-one-prep-*.md             ← MTG 前の議題
└── weekly-brief-template.md

data/executive/
├── calendar.yaml           ← 予定 SoT（gitignore · ローカル正本）
├── calendar.yaml.example   ← Git 追跡テンプレ
├── tasks.yaml              ← 社長タスク（gitignore）
├── one-on-ones.yaml        ← gitignore
└── external-contacts.yaml  ← gitignore
```

---

## 関連

- [secretary_agent.md](../../steward/agents/secretary_agent.md)
- [one-on-one-guide.md](one-on-one-guide.md)
- [secretary_steward_boundary.md](../../steward/rules/secretary_steward_boundary.md)
