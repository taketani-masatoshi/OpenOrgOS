# Skill: jp_permit_application（業免許取得プロジェクト）

**Module:** `jp_permit_application` · **Agent:** Compliance（proxy）· **runtime:** `cli`  
**Path:** `steward/jurisdiction-packs/JP/modules/jp_permit_application/skills/jp_permit_application_ops.md`

## 目的

取得・更新・変更届の申請案件を進め、チェックリスト · ドラフト · TeX PDF · handoff · 承認後の PER 反映までを CLI で実行する。行政への自動提出はしない。

## 提出可能水準（Gate）

テンプレ出力の **「（未記載）」は提出不可シグナル**。検出したら PDF 確定・公式様式転記を止め、人間に質問する。

```bash
orgos operations permit-app clarify --application APP-…
orgos operations permit-app checklist --application APP-… --write
```

| 状況 | Agent の行動 |
|------|----------------|
| `clarify_questions` あり | 番号付きで質問 → 回答待ち |
| 回答あり | `prepare --business-type …` 等で反映 → 再 checklist |
| `ready_for_export: true` | draft / export-pdf |
| 知り得ない値 | invent 禁止 · 追加質問 |

古物商の典型質問: 取り扱う古物の区分（衣類・機械工具・自動車・時計宝飾・金属くず・書籍 等）。

## CLI

```bash
npm run orgos -- operations permit-app catalog-status
npm run orgos -- operations permit-app create --type <pt-…> [--property PROP-…] [--phase obtain|renew|change] [--write]
npm run orgos -- operations permit-app prepare --application APP-… [--business-type …] [--structure-use …] [--license-type …] [--write]
npm run orgos -- operations permit-app show --application APP-…
npm run orgos -- operations permit-app clarify --application APP-…
npm run orgos -- operations permit-app checklist --application APP-… [--write]
npm run orgos -- operations permit-app draft --application APP-… [--write]
npm run orgos -- operations permit-app export-pdf --application APP-… [--write] [--force]
npm run orgos -- operations permit-app handoff --application APP-… [--contact STK-…] [--authority …] [--write]
npm run orgos -- operations permit-app submit-mark --application APP-… [--write]
npm run orgos -- operations permit-app approve --application APP-… --permit-number "…" --issued-on YYYY-MM-DD [--write]
npm run orgos -- operations permit-app intake attest --type <pt-…> --permit-number "…" --issued-on YYYY-MM-DD --evidence /path.pdf [--module hospitality] [--write]
```

国法級カタログ 138 種は業モジュールなしで `create` / `intake attest`（`--module` 省略）から取得可能。

カタログ検査（registry 経由）:

```bash
npm run orgos -- operations permit catalog validate
```

## 入力

- `data/permit-applications/application-registry.yaml`
- registry `catalog/*.csv` · forms / field-map / templates
- `data/company.yaml` · `data/properties/`

## 禁止

- 許可番号の invent
- 行政への自動提出
- （未記載）残存のまま提出完了扱い
- L2 のチャット転記
