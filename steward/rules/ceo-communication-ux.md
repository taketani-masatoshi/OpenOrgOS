# CEO 直接コミュニケーション UX

**版:** 1.0 · **日付:** 2026-07-10  
**正本:** 本書 · **対象:** Secretary · Mail Intake · Mail Outbound（**CEO とのやりとりのみ**）

---

## 原則

CEO（人間）の時間は経営判断に使う。**ファイルを増やして読ませない。**

| 相手 | 手段 | 情報量 |
|------|------|--------|
| **CEO（直接）** | Today / Steward Chat **インライン質問** + **返信下書き承認** | 最小 — 30 秒で答えられる |
| **Agent 間** | handoff MD · routing-queue · 構造化 YAML | **過不足なし** — 誤解防止のため文脈・根拠・次アクションを完備 |

**CONSULT MD** は CEO 向けではなく、原則 **Agent 間エスカレーション** または `ceo_question_mode: consult` 時の例外。

---

## CEO 直接（秘書 UX）

### 優先順

1. **インライン質問** — 正本: `data/executive/ceo-inline-questions.yaml`  
   - はい/いいえ · 時刻 · 1 行テキスト  
   - Today / `orgos chat today` に表示  
   - CLI: `orgos mail intake ceo answer --id CEO-Q-...`

2. **返信下書き承認** — `mail outbound correspondence draft` → `org approval approve --reviewed`  
   - 断定・送信は CEO/approver のみ  
   - 下書き本文に内部注釈（「送信前の下書きです」等）を **載せない**（送信時 sanitize）

3. **CONSULT** — 既定 **使わない**（`receive.ceo_question_mode: consult` のときのみ）

### 設定

| 設定 | 正本 | 既定 |
|------|------|------|
| `receive.ceo_question_mode` | `records/executive/mail-config.yaml` | `inline` |
| 環境変数上書き | `ORGOS_MAIL_CEO_QUESTION_MODE` | 未設定 = inline |

---

## Agent 間（情報完備）

Mail Intake → Secretary / Mail Outbound への handoff では **省略しない**:

- メール ID · 差出人 · 件名 · トリアージ結果  
- 送信者照合（EXT/STK）· 解釈多数決（intent · 貸借 · agreement）  
- 推奨アクション · 参照パス（L2 eml は path のみ）  
- CEO へ既に出した質問 ID（あれば）

正本パス例:

- `docs/executive/correspondence-drafts/inbound-MSG-....md`
- `docs/reports/routing-queue/HO-....md`
- `data/executive/mail-interpretation-queue.yaml`

---

## メール解釈（CEO 確認前）

- **複数 LLM 多数決** — `receive.interpret_ensemble` / `ORGOS_MAIL_INTERPRET_ENSEMBLE`  
- モデル一覧 — `receive.interpret_models` / `ORGOS_MAIL_INTERPRET_MODELS`  
- 不一致（agreement < 67%）→ CEO インライン質問のみ（長文 CONSULT 禁止）

---

## 関連

- [secretary_agent.md](../core/agents/secretary_agent.md)
- [mail_intake_agent.md](../core/agents/mail_intake_agent.md)
- [mail_outbound_agent.md](../core/agents/mail_outbound_agent.md)
- [secretary-contact-registry.md](secretary-contact-registry.md)
