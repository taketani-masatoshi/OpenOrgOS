# OTA メッセージテンプレート

**亀沢旅館** · Airbnb / Booking 等にコピー登録

`{{変数}}` は手動置換。自動メッセージと併用。

---

## 1. 予約確定（自動送信後の追記）

```
{{guest_name}} 様

亀沢旅館をご予約いただきありがとうございます。
チェックインは {{check_in_date}} 15:00 以降、チェックアウトは {{check_out_date}} 10:00 までです。

ご到着前日に、入室方法の詳細をお送りします。
ご質問があれば、このメッセージへお気軽にどうぞ。

株式会社MAL
```

---

## 2. チェックイン前日

```
Hi {{guest_name}},

Your check-in is tomorrow. Key details:

【Address】Kamezawa 1-chome, Sumida-ku, Tokyo
【Station】Ryogoku (Oedo Line) — 1 min walk, exit A3 or A4
【Check-in】From 3:00 PM / Code: {{access_code}}
【Wi-Fi】{{wifi_ssid}} / {{wifi_password}}

House rules (short): Quiet 10 PM–7 AM · No smoking anywhere · Trash in kitchen bins only — never on the street.

Passport holders: please have passport ready for check-in (Japanese law).

See you soon!
MAL Inc.
```

*Full guide: [check-in-guide.md](../guest-facing/check-in-guide.md) · [local-guide-en.md](../guest-facing/local-guide-en.md)*

---

## 3. チェックイン当日（午前）

```
本日15:00よりチェックイン可能です。
鍵コード: {{access_code}}
ご不明点はこのメッセージまで。
```

---

## 4. 滞中（CI 翌日）

```
{{guest_name}} 様

快適にお過ごしください。
設備の不具合やご不明点があれば、すぐにお知らせください。

※22時以降は近隣の皆様への配慮をお願いします。
```

---

## 5. チェックアウト前日

```
Tomorrow check-out is by 10:00 AM.

Please:
· Turn off AC & lights
· Lock windows & door
· Sort trash in kitchen bins only (do NOT leave bags outside)
· No need to strip beds

Thank you for staying in Hokusai's neighborhood!
```

---

## 6. チェックアウト後（レビュー依頼 · 任意）

```
{{guest_name}} 様

ご宿泊ありがとうございました。
よろしければ {{channel}} にてレビューをお寄せください。

またのお越しをお待ちしています。
```

---

## 7. トラブル初動（社内メモ兼用）

```
ご連絡ありがとうございます。状況を確認します。
【初動目標】24時間以内に一次回答
緊急（漏水・鍵・安全）: 即電話 TBD
```

→ [クレーム記録.csv](../guest-service/クレーム記録.csv) へ転記

---

## 変数一覧

| 変数 | 例 |
|------|-----|
| `{{guest_name}}` | 山田 太郎 |
| `{{check_in_date}}` | 2026-08-15 |
| `{{check_out_date}}` | 2026-08-17 |
| `{{access_code}}` | （スマートロック） |
| `{{channel}}` | Airbnb |
