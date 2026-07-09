# 社外調整 — アクションカード（テンプレート）

> Secretary Agent が `correspondence-drafts/` に生成するときの形式。  
> **自動送信禁止** — 社長承認後にリンクをクリック。

---

## 今日やること — {件名}

| # | やること | 状態 |
|---|---------|------|
| 1 | [Googleカレンダーに追加](#googleカレンダー) | ☐ |
| 2 | [Gmail で下書きを開く](#gmail) → 確認して送信 **または** `orgos secretary correspondence send`（承認後） | ☐ |
| 3 | 送信後 `calendar.yaml` の `{EVT-ID}` を `confirmed` に更新 | ☐ |

---

## 予定サマリー

| 項目 | 内容 |
|------|------|
| 日時 | {YYYY-MM-DD（曜）} {HH:MM}–{HH:MM} |
| 相手 | {名前}（{EXT-ID}） |
| 形式 | {オンライン / 対面} |
| 関連 | {EVT-XXX} · {TASK-XXX} |

---

## Googleカレンダー

[📅 カレンダーに追加]({google_calendar_template_url})

※ 社長用 Google アカウントで開く。Meet URL はカレンダー上で「Google Meet を追加」が最短。

---

## Gmail

[Gmail で下書きを開く]({gmail_compose_url})

---

## メール本文（コピー用）

**宛先:** {email}  
**件名:** {subject}

```
{body}
```

---

## 内部メモ（社外に送らない）

| 項目 | 内容 |
|------|------|
| 契約確約 | 含めない → Contract へ |
| external_visible | {true/false} |

---

## URL の作り方（Agent 用）

**Google Calendar（JST → UTC）**

```
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text={タイトル URL エンコード}
  &dates={開始UTC}/{終了UTC}   # 例 14:00 JST → T050000Z
  &details={詳細}
  &location={場所}
```

**Gmail compose**

```
https://mail.google.com/mail/?view=cm&fs=1
  &to={email}
  &su={件名}
  &body={本文 URL エンコード}
```
