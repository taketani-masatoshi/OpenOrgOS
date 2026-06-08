# Steward OS - Property Business Edition v0.2

> **後継:** [spec-v0.3.md](spec-v0.3.md) が正本。本書は v0.2 時点の履歴。

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

## フォルダ構成

| ゾーン | パス | 内容 |
|--------|------|------|
| 人 | `docs/` | MD・CSV・PDF（印刷・提出） |
| Cursor | `data/` YAML、`scratch/` 試行 |
| プログラム | `src/` `schemas/` `assets/` | CLI・フォント |

**フォルダ説明ファイル:** `docs/` 配下は `00-このフォルダについて.md`、`data/`・`scratch/`・`assets/` は `00-README.md`（エクスプローラで先頭に並ぶ）。リポジトリルートのみ `README.md`。

## データ構造

**正データはテナント配下 `data/`（物理: `tenants/{id}/data/`）の YAML のみ。** 人向けの読み物はテナント内 `docs/`。

- **Company**: `data/company.yaml`
- **Property**: `data/properties/{id}.yaml`
- **Contract**: `data/contracts/{id}.yaml`
- **Monthly Finance**: `data/finance/monthly/{YYYY-MM}.yaml`
- **Plans**: `data/plans/*.yaml`（予実 yojitsu は [spec/yojitsu-v2.md](spec/yojitsu-v2.md) 参照）
- **決算書・PL**: `docs/plans/*.md`
- **計画 CSV**: `docs/exports/*.csv`

## MVP 機能

1. 契約台帳 — `steward contracts list/show`
2. 物件台帳 — `steward properties list/show`
3. 月次収支管理 — `steward finances summary/add`
4. キャッシュフロー予測 — `steward forecast`
5. 物件別収益分析 — `steward analyze property`
6. シナリオ分析 — `steward scenario`
7. 契約期限アラート — `steward alerts`
8. **データ成熟度** — `steward status`
9. **CSV 同期** — `steward sync all`
10. **書類 I/O** — `steward io`（inbox 受信 / outbox 印刷）
11. **経営ダッシュボード** — `steward dashboard` / `steward report dashboard`（日次 MD → `docs/reports/dashboard/`）
12. **依存影響チェック** — `steward deps check` / `steward impact`（`data/dependency-graph.yaml`）
13. **賃料請求書** — `steward invoice generate`（[spec/invoice.md](spec/invoice.md) · `modules.yaml` billing · `steward/modules/rental/seed/`）

## パラメータ依存関係

正データ間・docs への連動は `data/dependency-graph.yaml` で定義。

```bash
npm run steward -- deps check --file data/contracts/CTR-008.yaml
npm run steward -- impact data/properties/PROP-002.yaml
npm run steward -- deps graph
npm run validate -- --deps   # 下流ファイルの鮮度警告
```

手順: [docs/plans/dependency-update-guide.md](plans/dependency-update-guide.md)

## 書類の受け渡し（Input / Output）

| ゾーン | パス | 用途 |
|--------|------|------|
| **Input** | `docs/io/inbox/` | スキャン・契約原本・申請書（未処理） |
| **Output** | `docs/io/outbox/` | 印刷・提出・掲示用 PDF |
| **台帳** | `data/document-io.yaml` | 受信/出力キュー |

```bash
npm run steward -- io inbox add --from ./scan.pdf --category licenses --title "許可証"
npm run steward -- io inbox done INB-001 --archive docs/company/licenses/ryokan/records/x.pdf
npm run steward -- io outbox list
```

## データ検証

- スキーマ: Zod（`schemas/`）
- 参照整合性: loan↔contract↔property、operations、HR
- 依存グラフ: `data/dependency-graph.yaml`（`steward deps` / `validate --deps`）
- `npm run validate -- --warnings` で非致命警告も表示

## Cursor 運用

Cursor Chat で契約書・請求書・議事録等を投入し、YAML データとして `data/` に蓄積する。
レポート生成時は `steward report monthly` 等の CLI を優先利用する。
