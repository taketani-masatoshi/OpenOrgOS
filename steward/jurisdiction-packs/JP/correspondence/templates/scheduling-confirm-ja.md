# テンプレ: 日程確定（対面）

**参照:** [email-style-ja.md](../email-style-ja.md) · [email-blocks-ja.md](email-blocks-ja.md)

```
{full_name} 様

お世話になっております。
株式会社{company}の秘書です。

ご返信ありがとうございました。
ご希望どおり、下記にて確定いたしました。

・日時: {datetime_label}
・会場: {venue_formal_name}
・アクセス: {access_line}
・費用: {cost_line}

{optional_next_step_one_line}

当日は何卒よろしくお願い申し上げます。

株式会社{company}
秘書
```

### 埋め方ルール

| 変数 | 規則 |
|------|------|
| `full_name` | 連絡先正本の氏名。様はテンプレ側 |
| `venue_formal_name` | 通称だけでなく店舗の正式表記 |
| `access_line` | 駅名 + 徒歩約N分（公開情報）。不明なら行ごと省略 |
| `cost_line` | 合意済みの目安・負担。未合意なら行省略し CEO 確認 |
| `optional_next_step_one_line` | 「集合場所の詳細は、追ってご連絡いたします。」等。デモ注記禁止 |
