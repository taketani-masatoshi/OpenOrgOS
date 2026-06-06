# Steward OS - Property Business Edition

不動産賃貸業・旅館業向けの経営OS。構造化データ（YAML）を正とし、CLI で計算・検証・アラートを実行、Cursor で分析・レポート生成を行う。

## フォルダ構成

```
Steward/
├── docs/              # 人が読む・書く（仕様書・PL・運用メモ）
├── cursor/            # Cursor / CLI が使うデータ（一箇所に集約）
│   ├── data/          #   YAML 正データ
│   ├── schemas/       #   Zod スキーマ
│   └── reports/       #   CLI 生成レポート（gitignore）
├── src/               # CLI プログラム
└── tests/             # テスト
```

人向けドキュメントの目次は [docs/README.md](docs/README.md) を参照。

## セットアップ

```bash
npm install
npm run validate
```

## データ構造（`cursor/data/`）

```
cursor/data/
├── company.yaml              # 会社基本情報
├── properties/               # 物件台帳（1物件1ファイル）
├── contracts/                # 契約台帳（1契約1ファイル）
├── finances/
│   ├── fixed-costs.yaml      # 固定費
│   ├── payroll.yaml          # 役員報酬
│   ├── loans.yaml            # 融資一覧
│   └── monthly/              # 月次収支実績
└── plans/
    ├── business-plan.yaml    # 会社事業計画
    └── property-revenue.yaml # 物件別収益計画
```

## CLI コマンド

```bash
# データ検証
npm run steward -- validate

# 契約台帳
npm run steward -- contracts list
npm run steward -- contracts list --type management --property PROP-001
npm run steward -- contracts show CTR-001

# 物件台帳
npm run steward -- properties list
npm run steward -- properties list --type hotel
npm run steward -- properties show PROP-001

# 月次収支
npm run steward -- finances list
npm run steward -- finances summary --from 2026-01 --to 2026-03
npm run steward -- finances show 2026-01
npm run steward -- finances add --month 2026-04 --file entry.yaml

# キャッシュフロー予測
npm run steward -- forecast --months 12
npm run steward -- forecast --months 12 --format json

# 物件別収益分析
npm run steward -- analyze property
npm run steward -- analyze property --id PROP-001 --period 2026-Q1

# シナリオ分析
npm run steward -- scenario --name "空室率15%" --vacancy-rate 0.15
npm run steward -- scenario --name "ADR-10%" --adr -10%

# 契約期限アラート
npm run steward -- alerts --days 90
npm run steward -- alerts --days 90 --markdown --risk-level high

# 月次レポート
npm run steward -- report monthly --month 2026-03

# 決算報告書・事業報告書（PDF）
npm run steward -- report annual --fy FY2026
npm run steward -- report kessan --fy FY2026
npm run steward -- report jigyo --fy FY2026
```

## Cursor 活用例

1. **契約書取込**: 契約書 PDF を Chat に貼り付け、「CTR-004 として cursor/data/contracts/ に YAML 作成」と依頼
2. **請求書から収支入力**: 請求書内容から `cursor/data/finances/monthly/` に YAML を生成
3. **レポート分析**: `npm run steward -- report monthly` で生成したレポートを Chat で深掘り分析
4. **アラート確認**: `npm run steward -- alerts --markdown` の出力を確認し、対応策を検討

## テスト

```bash
npm test
```

## レポート出力

CLI が生成するレポートは `cursor/reports/` に保存される（gitignore 対象）。

```
cursor/reports/
├── monthly/     # 月次レポート
├── kessan/      # 決算報告書 PDF
├── jigyo/       # 事業報告書 PDF
├── forecast/    # CF予測
├── analyze/     # 物件分析
├── scenario/    # シナリオ分析
└── alerts/      # 契約アラート
```

## 仕様書

詳細仕様は [docs/spec-v0.2.md](docs/spec-v0.2.md) を参照。
