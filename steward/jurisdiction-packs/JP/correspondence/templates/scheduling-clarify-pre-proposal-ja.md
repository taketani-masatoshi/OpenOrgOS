# テンプレ: 候補日提示前の会場ご相談（対面）

**用途:** 候補日時を出す**前**の clarify のみ。日時・形式・アレルギー行は含めない。  
**参照:** [email-style-ja.md](../email-style-ja.md) · 汎用 clarify（日時あり）は [scheduling-clarify-ja.md](scheduling-clarify-ja.md)

```
{full_name} 様

お世話になっております。
株式会社{company}の秘書です。

今回は貴社との{purpose_confirmed}としてご調整できればと存じます。

下記会場案をご検討いただけますと幸いです。ご希望をお知らせください。日程のご提案は改めてご連絡いたします。

・エリア: {area}
{cost_line}

【会場案】（ご希望をお知らせください。弊社にて手配いたします）
A. {venue_a}{venue_a_facts_suffix}
B. {venue_b}{venue_b_facts_suffix}
C. {venue_c}{venue_c_facts_suffix}

何卒よろしくお願い申し上げます。

株式会社{company}
秘書
```

### 規則

- `purpose_confirmed` は CEO 確認済み文言のみ
- `venue_*_facts_suffix` は空、または ` — 事実`（個室・会席・徒歩分など）。売り文句禁止
- **禁止:** 日時・候補枠・アレルギー質問（アレルギーは相手 DB 正本）
- `{cost_line}` は空、または `・費用: …` の1行
