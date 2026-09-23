# Skill: jp_statutory_meetings（株主総会・取締役会手続）

**Module:** `jp_statutory_meetings` · **Agent:** Corporate Governance · **法域:** JP のみ

**Path:** `steward/jurisdiction-packs/JP/modules/jp_statutory_meetings/agent.md`
**Cursor（任意）:** `@steward/jurisdiction-packs/JP/modules/jp_statutory_meetings/agent.md`

## Skill

| id | 用途 | CLI |
|----|------|-----|
| `jp_shareholder_meeting_pack` | 株主総会（定時 · 臨時 · 書面決議） | `operations statutory-meetings checklist --meeting <id>` |
| `jp_board_meeting_pack` | 取締役会（招集 · 招集省略 · 書面決議） | `operations statutory-meetings schedule --meeting <id>` |

## 手順

1. `meetings.yaml` に会議を登録し、`statutory-meetings.yaml` に同じ id で法定詳細を記載
2. `operations statutory-meetings validate`
3. `schedule --meeting <id>` — 招集通知の発出期限 · 基準日の行使期限 · 省略手続の可否
4. `checklist --meeting <id>` — 通知時期 · 決議要件 · 議事録記載事項 · 備置（`needs_review` は人間確認）
5. `draft --meeting <id> --write` — 招集通知 · 議事録ドラフトを `docs/company/governance/<id>/` に生成
6. 人間（取締役 · 専門家）がレビューし、発出 · 署名 · 備置を行う

## 禁止

- 適法性の断定 · 自動発出 · 自動登記申請
- 株主名簿 · 個人住所など L2 の tracked 転記
