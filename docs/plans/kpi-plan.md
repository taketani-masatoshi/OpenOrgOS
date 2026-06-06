# KPI 計画

**版:** 2026-06-07 · **会計年度:** FY2026（2026-02〜2027-01）

## 目的

全社・物件・モジュールの KPI を単一定義し、ダッシュボードと予実管理の計測基準を統一する。

## 管理対象

- 全社 P/L KPI
- PROP-001 賃貸 KPI
- PROP-002 旅館 KPI
- 契約・コンプライアンス KPI

## 必要な入力情報

- `cursor/data/plans/business-plan.yaml`（kpi セクション）
- `cursor/data/properties/PROP-001.yaml` · `PROP-002.yaml`
- `cursor/data/plans/yojitsu-fy2026.yaml`
- `docs/reports/dashboard/`（CLI 出力）

## 出力すべき情報

- KPI 辞書（本ファイル）
- 月次 KPI 実績（予実 MD / ダッシュボード）
- アラート閾値

## KPI

| ID | KPI | 目標 | 単位 | 計測頻度 | 責任 |
|----|-----|------|------|---------|------|
| K-01 | 亀沢旅館 稼働率 | 70 | % | 週次 | Hospitality |
| K-02 | 番町ハイム 空室率 | 0 | % | 月次 | Property Rental |
| K-03 | FY2026 売上 | 750 | 万円 | 月次 | Finance |
| K-04 | FY2026 営業利益 | 417 | 万円 | 月次 | Finance |
| K-05 | 亀沢 RevPAR | TBD | 円 | 週次 | Hospitality |
| K-06 | 番町 NOI 率 | TBD | % | 四半期 | Finance |
| K-07 | 契約 executed 率 | 100 | % | 月次 | Contract |
| K-08 | ランウェイ | ≥6 | 月 | 週次 | Finance |
| K-09 | CTR 更新漏れ | 0 | 件 | 月次 | Contract |
| K-10 | 高リスク未対応 | 0 | 件 | 月次 | Executive |

### アラート閾値

| KPI | 警告 | 危険 |
|-----|------|------|
| 稼働率（亀沢） | <60% | <50% |
| 空室率（番町） | >0% | >1 ヶ月 |
| ランウェイ | <6 ヶ月 | <3 ヶ月 |
| executed 率 | <90% | draft が P0 残 |

## 関連フォルダ

- `cursor/data/plans/business-plan.yaml`
- `docs/plans/kpi-plan.md`
- `docs/reports/dashboard/`

## 担当エージェント

- **主:** Executive Steward
- **計測:** Finance · Hospitality · Property Rental · Contract

## 更新頻度

- 目標値: 年次（中期計画連動）
- 実績: 月次 · ダッシュボード日次

## リスク

- RevPAR・NOI 率が未算定（開業前）
- ランウェイは `cash-balance.yaml` TBD で未計測

## 正データ参照

```yaml
# cursor/data/plans/business-plan.yaml
kpi:
  - name: 亀沢旅館 稼働率
    target: "70"
  - name: 番町ハイム 空室率
    target: "0"
  - name: FY2026 売上（物件中心）
    target: "750"
  - name: FY2026 営業利益
    target: "417"
```

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-06-07 | 初版 — business-plan.yaml から起稿 |
