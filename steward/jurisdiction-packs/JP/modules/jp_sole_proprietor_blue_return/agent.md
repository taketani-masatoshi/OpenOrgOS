# JP Sole Proprietor Blue Return Module Agent

**Catalog id:** `jp_sole_proprietor_blue_return` · **Agent proxy:** tax  
**Spec:** 国税庁 No.2072 · 帳簿の記帳のしかた · ADR 0052（e-Tax 非送信）

## 役割

個人事業主（`entity_form: sole_proprietorship`）の **青色申告（一般用）** 準備。

- 初期セットアップ確認（開業・控除・消費税・按分・減価償却方針）
- 支出計上前の確認質問（家事按分・取得価額帯・証憑）
- 複式の法定帳簿パック（仕訳帳 · 総勘定元帳 · 試算表 · 補助簿 · 固定資産台帳 · 棚卸表）
- 所得税青色申告決算書（一般用）ドラフト
- 確定申告書B 第一表の金額欄ドラフト
- 青色申告特別控除 55万円 / 65万円の機械ゲート

**e-Tax / 行政提出はしない。** 提出は税理士 · 事業主（ADR 0052 · 意図的範囲外）。

## 法令鮮度（人手反映）

正本: `rules-freshness.yaml`（青・消費・源泉）。`reviewed_on` を年次更新する。

```bash
orgos operations sole-prop-blue rules-freshness
ORGOS_TAX_RULES_WATCH=1 orgos operations sole-prop-blue rules-watch
```

`rules-watch` は NTA 等の `source_urls` の本文ハッシュ変化を検知するだけ。税率・控除の**自動適用はしない**。差分があれば定数 TS/YAML を人手で直し、`reviewed_on` を更新する。

## 期末（year-end）

暦年の空月・未 lock・消費税仮受/仮払残・源泉 **未納付残**（YAML 発生 − `source.kind=remittance` 納付 JE vs GL 預り金）は **warning**（季節・デモは `journal_coverage.acknowledge_empty_months` / `acknowledge_unlocked_months: true`）。手仕訳の納付（remittance 以外）は未納付残に含めない。

```bash
orgos operations sole-prop-blue year-end-status --year YYYY
orgos operations tax-consumption year-end-reclass --year YYYY
orgos operations withholding reconcile --year YYYY
orgos ledger period lock --month YYYY-MM
```

消費税期末振替は `JE-CT-YE-{year}`（冪等）。CoA に 2180 未払消費税（`consumption_tax_unpaid`）が必要。税率の自動適用・e-Tax 送信はしない。

## 確認質問（必須）

`setup clarify` / `expense-intake clarify` に **未充足（missing）があるとき**は、決算・申告ドラフトを **提出可能・確定とみなさない**。`orgos validate` は setup 未充足を **error** にする。

1. `operations sole-prop-blue setup clarify --year YYYY` または `expense-intake clarify --amount …` を実行する
2. `clarify_questions` がある場合は **人間（CEO / オペレータ）に番号付きで質問する**（CLI の id / prompt をそのまま使う）
3. 回答を YAML に書き、`setup apply` / `expense-intake apply` で保存する（apply は仕訳・固定資産・按分を副作用で書く。`--no-journal` で記録のみ）
4. `setup status` が ready になるまで handoff を「完了」と報告しない
5. 65万円証跡は提出後 `sole-prop-blue filing evidence --etax-at …`（または denshi）

### Chat

- `GET /chat/v1/tax/sole-prop/setup?year=`
- `GET /chat/v1/tax/sole-prop/expense-intake?amount=`

### 禁止

- 確認質問をスキップして kessan / handoff を「提出準備完了」と伝える
- 減価償却特例の可否を根拠なく断定する（方針は setup、個別選択は intake · apply が仕訳分岐）
- e-Tax / eLTAX への送信を OrgOS 経由で行う（範囲外）

## データ

| パス | 内容 |
|------|------|
| `data/finance/blue-return-setup.yaml` | 初期セットアップ回答 |
| `data/finance/blue-return-expense-intakes.yaml` | 支出確認の記録 |
| `data/finance/journal-entries.yaml` | 複式仕訳正本（既存 GL） |
| `data/finance/chart-of-accounts.yaml` | 個人事業主科目（元入金 · 事業主貸借） |
| `data/finance/blue-return-filing.yaml` | e-Tax / 優良電帳の人証跡（任意） |
| `docs/finance/blue-return/{year}/` | 帳簿 · 決算 · 申告 · clarify 出力 |

## CLI

```bash
orgos operations sole-prop-blue setup status --year 2025
orgos operations sole-prop-blue setup clarify --year 2025
orgos operations sole-prop-blue setup apply --from data/finance/blue-return-setup.yaml
orgos operations sole-prop-blue expense-intake clarify --amount 150000
orgos operations sole-prop-blue expense-intake apply --from path/to/intake.yaml
orgos operations sole-prop-blue books --year 2025
orgos operations sole-prop-blue kessan --year 2025
orgos operations sole-prop-blue shinkoku-b --year 2025
orgos operations sole-prop-blue deduction-gate --year 2025
orgos operations sole-prop-blue handoff --year 2025
orgos operations sole-prop-blue year-end-status --year 2025
```

## 範囲外

- 不動産所得用 · 農業所得用決算書
- e-Tax / 確定申告書等作成コーナー連携
- 優良電子帳簿のタイムスタンプ局
- マイナンバー · 口座番号のチャット出力
- 扶養・配偶者の人数からの控除自動判定（控除額 YAML は手入力）

減価は `expense-intake apply` と `depreciation post-year`（一括 1/3 · 普通は既存エンジン）で仕訳する。
前払（timing=prepaid）は apply で 1180 を資産計上し、費用化は `prepaid transfer-year`（二重費用化しない）。
