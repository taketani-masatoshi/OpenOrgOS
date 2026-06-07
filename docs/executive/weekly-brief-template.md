# 週次ブリーフ テンプレート

Secretary Agent が毎週（推奨: 月曜朝）生成する社長向けサマリの型。

---

```markdown
# 社長週次ブリーフ YYYY-MM-DD（第 N 週）

> 生成: Secretary Agent · データ: data/executive/

## 今週のハイライト（3 行以内）

- ...

## 今週の予定

| 日付 | 時間 | 件名 | 種別 | 状態 | 備考 |
|------|------|------|------|------|------|
| | | | | confirmed / tbd | external_visible のみ社外共可 |

## 要対応タスク（優先順）

| ID | タイトル | 期限 | 優先度 | 状態 |
|----|---------|------|--------|------|
| TASK-xxx | | | p0–p3 | |

## 1-on-1 予定

| 相手 | 次回日 | 議題（案） | 前回宿題 |
|------|--------|-----------|---------|
| | | | |

## 社外対応・下書き待ち

- [ ] （宛先・件名・承認待ち）

## Executive Steward へ委譲推奨

| 件名 | 理由 | 想定 Agent |
|------|------|-----------|
| | 財務・契約・許認可など | Finance / Contract / Compliance |

## 来週以降の TBD

- 会食 EVT-002: 候補日・店舗未確定
- ...

## メモ

- 経営 P0 は [executive-remaining-tasks.md](../company/executive-remaining-tasks.md) を参照（Secretary は要約のみ）
```

---

## 運用メモ

- 財務数値・契約金額は **含めない**
- dashboard の KPI は「件数・有無」程度の参照にとどめる
- 確定後、必要なら `tasks.yaml` / `calendar.yaml` のステータスを更新し `npm run validate`
