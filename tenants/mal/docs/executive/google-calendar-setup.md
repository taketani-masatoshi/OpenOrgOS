# Google Calendar 連携 — 初回セットアップ（約 5 分）

**正本:** [google-calendar.env.example](google-calendar.env.example) · `steward executive calendar push|pull`

---

## 1. Google Cloud プロジェクト

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. **Google Calendar API** を有効化
3. **OAuth 同意画面** — 内部 or テストユーザーに段の Google アカウントを追加

## 2. OAuth クライアント（デスクトップ）

1. 認証情報 → **OAuth 2.0 クライアント ID** → アプリケーション種類 **デスクトップ**
2. クライアント ID / シークレットを控える（`.env` には **トークンのみ** 載せる）

## 3. refresh token 取得（初回のみ）

```bash
# 例: google-auth-library または OAuth Playground で offline access
# スコープ: https://www.googleapis.com/auth/calendar.events
```

取得した **refresh token** を `.env` に保存（アクセストークンは短命 · refresh で更新）。

## 4. `.env`（リポジトリルート · gitignore）

```bash
cp tenants/mal/docs/executive/google-calendar.env.example .env
# 編集:
# GOOGLE_CALENDAR_ID=primary  # または共有カレンダー ID
# GOOGLE_CALENDAR_REFRESH_TOKEN=...
# GOOGLE_CALENDAR_ACCESS_TOKEN=...  # 初回 · 以降 refresh 自動（将来）
# GOOGLE_CALENDAR_TIMEZONE=Asia/Tokyo
```

> **現 Phase:** `GOOGLE_CALENDAR_ACCESS_TOKEN` を手動更新可。refresh 自動化は backlog（SEC4-4 拡張）。

## 5. 動作確認

```bash
npm run steward -- executive calendar push --dry-run
npm run steward -- executive calendar push          # 本番 · google_event_id 書戻し
npm run steward -- executive calendar pull --since 2026-06-01
npm run validate   # 未同期 warning 確認
```

## 6. 日常運用（3 行）

1. **変更は YAML 先** — `calendar.yaml` が SoT
2. **YAML → Google:** `executive calendar push`（Meet 自動付与）
3. **スマホのみ変更:** 週 1 回 `executive calendar pull --apply` で ID リンク · 新規は Secretary が YAML へ手動反映

---

関連: [secretary-quickstart.md](secretary-quickstart.md) · [secretary_behavior.md](../../rules/secretary_behavior.md)
