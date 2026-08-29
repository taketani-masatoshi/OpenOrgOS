# Correspondence style contract

**版:** 1.0 · **対象:** すべての jurisdiction `correspondence/` パック

各法域・locale は、以下を **必ず** 定義する。未定義の locale で社外メールを自動生成してはならない（中立フォールバックは事実箇条書きのみ）。

---

## 1. 必須成果物

| ファイル | 内容 |
|----------|------|
| `style.yaml` | formality · honorifics · forbidden_phrases · required_blocks · self_reference · other_reference |
| `email-style-{lang}.md` | 人間可読の品格ガイド（教育・Agent 添付用） |
| `templates/` | 最低: opener · scheduling-confirm · scheduling-clarify |

---

## 2. `style.yaml` 必須キー

```yaml
locale: ja-JP          # BCP 47
formality: high        # high | medium | low
self_reference:
  first_mention: "..."   # 初出の自社名乗り
  later: ["弊社", "..."]
other_reference:
  organization: "..."    # 例: 貴社 / your company
  person_suffix: "..."   # 例: 様 / Mr./Ms.
forbidden_phrases: []    # 部分一致で lint fail
required_blocks:         # メール種別ごと
  scheduling_confirm: [addressee, self_intro_once, datetime, venue_or_link]
speculation_banned: true # 未確認の関係性・組織構造を書かない
```

---

## 3. 普遍ルール（locale 非依存）

1. **事実のみ** — 先方メール・CEO 指示・SoT に無い関係性・意図を書かない  
2. **一件一義** — 1 通の主目的は1つ（調整 / 確定 / お詫び を混在させすぎない）  
3. **短文・箇条書き** — 長文の装飾より、相手が即答できる選択肢  
4. **送信元アドレスの説明禁止**  
5. **L2（電話番号の本文転記等）禁止** — 既に先方が知っている場合もチャット・tracked MD に出さない  
6. **デモ注記は社外本文に書かない** — 内部 notes のみ  

---

## 4. 文化差（パックが埋める領域）

| 次元 | 説明 | 例 |
|------|------|-----|
| Opening | 定型挨拶の有無・長さ | ja: お世話になっております / en-US: 短い挨拶+目的 |
| Naming | 姓・名、敬称、いつ first name に移るか | ja: 姓+様 維持 / en-US: 合意後 first name |
| Org deixis | 自他の呼び方 | ja: 貴社・弊社 / en: your company · we |
| Directness | 依頼・拒否の言い方 | ja: 婉曲可 / en-US: より直接 |
| Closing | 結び・署名 | ja: 何卒… / en: Best regards |

**受信者の文化を優先する**（自社が JP でも相手が US なら en-US テンプレ）。

---

## 5. 検証

- `secretary correspondence style lint` / `mail outbound correspondence style lint` が `forbidden_phrases` と構造ルールを検査  
- **`mail outbound` / `approve-send` の実送信パスで style-lint error は送信拒否**（ガードレール）  
- ユニットテストは locale ごとにゴールデン文を1通以上  
- LIVE-MEASURE / DEMO-ONLY / TEST-REF / HP-PROOF / REH- / PROOF- は社外文 **error**（計測・証明用プレースホルダ禁止）

---

## 6. 非目標

- 季節の挨拶の完全網羅（任意）  
- 手書き社交文書の全様式  
- 外部予約サイト操作（Venue Booking Agent）  
