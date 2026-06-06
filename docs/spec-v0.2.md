# Steward OS - Property Business Edition v0.2

## 基本方針

Steward OSは不動産賃貸業および旅館業を営む法人向けの経営OSである。

Cursorを主要インターフェースとして利用し、会社情報、物件情報、契約情報、財務情報を継続的に蓄積する。

Stewardは蓄積された情報を利用して、

- 経営状況把握
- 計画策定
- リスク管理
- 契約管理
- レポート生成

を支援する。

最終判断は人間が行う。

## データ構造

**正データは `cursor/data/` 配下の YAML のみ。** 人向けの読み物は `docs/`（Markdown / CSV）。

- **Company**: `cursor/data/company.yaml`
- **Property**: `cursor/data/properties/{id}.yaml`
- **Contract**: `cursor/data/contracts/{id}.yaml`
- **Monthly Finance**: `cursor/data/finances/monthly/{YYYY-MM}.yaml`
- **Plans**: `cursor/data/plans/*.yaml`
- **決算書・PL**: `docs/plans/*.md`
- **計画 CSV**: `docs/data/*.csv`

## MVP 機能

1. 契約台帳 — `steward contracts list/show`
2. 物件台帳 — `steward properties list/show`
3. 月次収支管理 — `steward finances summary/add`
4. キャッシュフロー予測 — `steward forecast`
5. 物件別収益分析 — `steward analyze property`
6. シナリオ分析 — `steward scenario`
7. 契約期限アラート — `steward alerts`

## Cursor 運用

Cursor Chat で契約書・請求書・議事録等を投入し、YAML データとして `cursor/data/` に蓄積する。
レポート生成時は `steward report monthly` 等の CLI を優先利用する。
