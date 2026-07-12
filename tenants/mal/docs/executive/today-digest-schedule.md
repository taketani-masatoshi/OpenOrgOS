# MAL · Today digest 定時提示

**版:** 2026-07-12 · **テナント:** `mal` · **LLM:** なし（`orgos chat today` のみ）

---

## 目的

段への経営ダッシュボード（Today）を **1 日 3 回**、CLI で生成し、通知する。Cursor 秘書チャットは自動起動しない。

| スロット（JST） | 用途 |
|-----------------|------|
| **09:00** | 仕事開始 |
| **13:00** | 午後開始 |
| **17:00** | 夕方確認 |

平日（月–金）のみ。Mac のタイムゾーンを **Asia/Tokyo** にすること。

---

## 成果物

| パス | 内容 |
|------|------|
| `docs/reports/dashboard/today-digest/latest.md` | 直近 1 回分（上書き） |
| `docs/reports/dashboard/today-digest/YYYY-MM-DD-HHMM-today.md` | 履歴 |
| `/tmp/orgos-mal-today-digest.log` | 実行ログ |
| macOS 通知 | 結論行の要約 |

---

## インストール

```bash
bash tenants/mal/docs/executive/scripts/install-today-digest-launchd.sh
```

手動 1 回:

```bash
bash tenants/mal/docs/executive/scripts/orgos-today-digest.sh
open tenants/mal/docs/reports/dashboard/today-digest/latest.md
```

アンロード:

```bash
launchctl bootout "gui/$(id -u)/com.steward.mal-today-digest" 2>/dev/null \
  || launchctl unload ~/Library/LaunchAgents/com.steward.mal-today-digest.plist
```

---

## 秘書の使い方

1. 通知または `latest.md` を見る  
2. 必要ならチャットで **結論だけ** リレー（CLI 出力を再解釈しない）  
3. 判断・承認・日程は Today の項目に従う  

関連: [secretary_behavior.md](../../rules/secretary_behavior.md) · バックアップ月曜リマインド plist と同型

---

## メール intake との役割分担

| 処理 | 頻度 | 担当 |
|------|------|------|
| Today digest | 平日 3 回 | 本 launchd |
| Mail intake sync | 別途 cron（任意 · 15–30 分） | Mail Intake |

Today には高優先メール・承認・日程調整が載るため、intake と組み合わせると気づきやすい。
