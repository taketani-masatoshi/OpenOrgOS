# JP Sole Proprietor Blue Return Module Agent

**Catalog id:** `jp_sole_proprietor_blue_return` · **Agent proxy:** tax  
**Spec:** 国税庁 No.2072 · 帳簿の記帳のしかた · ADR 0052（e-Tax 非送信）

## 役割

個人事業主（`entity_form: sole_proprietorship`）の **青色申告（一般用）** 準備。

- 複式の法定帳簿パック（仕訳帳 · 総勘定元帳 · 試算表 · 補助簿 · 固定資産台帳 · 棚卸表）
- 所得税青色申告決算書（一般用）ドラフト
- 確定申告書B 第一表の金額欄ドラフト
- 青色申告特別控除 55万円 / 65万円の機械ゲート

**e-Tax / 行政提出はしない。** 提出は税理士 · 事業主。

## データ

| パス | 内容 |
|------|------|
| `data/finance/journal-entries.yaml` | 複式仕訳正本（既存 GL） |
| `data/finance/chart-of-accounts.yaml` | 個人事業主科目（元入金 · 事業主貸借） |
| `data/finance/blue-return-filing.yaml` | e-Tax / 優良電帳の人証跡（任意） |
| `docs/finance/blue-return/{year}/` | 帳簿 · 決算 · 申告ドラフト出力 |

## CLI

```bash
orgos operations sole-prop-blue books --year 2026
orgos operations sole-prop-blue kessan --year 2026
orgos operations sole-prop-blue shinkoku-b --year 2026
orgos operations sole-prop-blue deduction-gate --year 2026
orgos operations sole-prop-blue handoff --year 2026
```

## 範囲外

- 不動産所得用 · 農業所得用決算書
- e-Tax / 確定申告書等作成コーナー連携
- 優良電子帳簿のタイムスタンプ局
- マイナンバー · 口座番号のチャット出力
