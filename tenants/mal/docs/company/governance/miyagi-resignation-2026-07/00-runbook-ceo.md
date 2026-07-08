# CEO 段取り — 宮城万貴子 取締役退任

**株式会社MAL** · **作成:** 2026-07-02 · **想定退任日:** 2026-07-31（変更可）

---

## 概要

| 項目 | 内容 |
|------|------|
| 対象者 | 宮城万貴子（EMP-002） |
| 現役職 | 取締役・代表取締役（共同代表） |
| 退任後 | 代表取締役 **段燕燕** のみ（登記反映後） |
| 株主 | 段燕燕 100% — 臨時株主総会は段単独で可決可能 |
| 登記期限 | 辞任の効力発生日から **2週間以内**（司法書士経由） |

---

## フェーズ 1 — 送付（CEO / Secretary）

- [ ] **1-1** `02-jinin-todoke-miyagi.md` の **退任希望日** を宮城と口頭またはメールで確認し、必要なら日付を修正
- [ ] **1-2** 宮城向け PDF を生成（下記「PDF 化」参照）
- [ ] **1-3** [cover-email-to-miyagi.md](correspondence/cover-email-to-miyagi.md) をベースに送付メール送信
- [ ] **1-4** `document-io.yaml` OUT-003 を `sent` 相当のメモで更新（送付日記録）
- [ ] **1-5** 返送期限を明示（目安: 送付から **7営業日以内**）

### PDF 化（ローカル）

```bash
# Markdown をブラウザで開き「PDF として保存」、または pandoc 等
# 出力先例:
# docs/io/outbox/corporate/governance/miyagi-resignation-packet-2026-07.pdf
```

---

## フェーズ 2 — 返送受領（CEO）

宮城から **押印済み辞任届 PDF** を受け取ったら:

- [ ] **2-1** `docs/io/inbox/corporate/governance/` に保存し `io inbox add` で登録
- [ ] **2-2** 退任希望日・署名・押印を目視確認
- [ ] **2-3** 受領日を `02-jinin-todoke-miyagi.md` 末尾「会社受領欄」に記入（社内控）

---

## フェーズ 3 — 社内決議（CEO 押印）

返送受領後 **3営業日以内** を目安:

- [ ] **3-1** [03-torishimari-kai-gijiroku-draft.md](03-torishimari-kai-gijiroku-draft.md) — 日付・受領日を確定し **段燕燕** が議長として押印
- [ ] **3-2** [04-shukai-gijiroku-draft.md](04-shukai-gijiroku-draft.md) — 段燕燕（100%株主）が議長・出席者として押印
- [ ] **3-3** 議事録 PDF を `docs/company/meetings/` に保管（例: `2026-08-xx-torishimari-kai-miyagi-jinin.md`）

**招集省略:** 取締役2名中1名のみ残る場合、残る取締役の同意で招集省略可（REG-002 第2条3項）。株主総会は全株主同意で招集省略可（REG-003 第4条2項）。

---

## フェーズ 4 — 登記（司法書士 · 人間ゲート）

- [ ] **4-1** [05-touki-shinsei-checklist.md](05-touki-shinsei-checklist.md) を司法書士に共有
- [ ] **4-2** 登記申請（役員変更 · 代表取締役の表示変更）
- [ ] **4-3** 登記完了通知（登記簿謄本）を `licenses/corporate-registry/records/` に保管

---

## フェーズ 5 — 正本更新（登記完了後）

- [ ] **5-1** `data/company.yaml` — `directors` / `representative` から宮城を削除
- [ ] **5-2** `data/hr/employees.yaml` — EMP-002 `status: resigned`、退任日追記
- [ ] **5-3** REG-002 / REG-003 — 議事録作成者条項（宮城 → 段または後任）を改定議案化
- [ ] **5-4** 登記完了を会社イベントで `closed`
- [ ] **5-5** `orgos validate --tenant mal`

---

## リスク・確認事項

| 論点 | 対応 |
|------|------|
| 共同代表が1名に | 株主総会で代表取締役の表示変更を決議（段のみ残存） |
| 宮城は非株主 | 株主総会は段単独 — 手続簡素 |
| 定款上の取締役員数 | 1名体制で定款と整合するか司法書士確認 |
| 印鑑届 | 代表者変更に伴い法務局届出 — 司法書士判断 |
| 役員報酬・貸付 | 退任日基準で Finance / Contract が別途整理 |

---

## 連絡先

- 社内窓口: info@malkk.com（返送先メールは cover-email に記載）
- 司法書士: （顧問先 — 社内 contacts 参照）
