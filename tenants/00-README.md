# tenants/ — 会社別インスタンス

Steward OS **フレームワーク**（`steward/` · `src/` · `schemas/`）と分離した、**テナント（会社）ごとの正データ・人向け書類・会社ルール**。

- 業務モジュール定義: `steward/modules/{id}/` · 雛形: `{id}/seed/`
- ISO 標準テンプレート: `steward/standards/iso/`
- 社内規程テンプレ: `steward/standards/regulations/` → `steward regulations seed`
- テナントは `modules.yaml` でパスを **バインド** するのみ

## 構成

```
tenants/
└── {tenant-id}/
    ├── tenant.yaml       テナントメタ（id · 法人名 · lifecycle）
    ├── modules.yaml      業務モジュール ON/OFF · 物件バインド
    ├── standards.yaml    ISO 有効化
    ├── regulations.yaml  社内規程有効化（modules/ISO と bind 整合必須）
    ├── data/             正データ YAML（ops-config · 計画 · 分類等）
    ├── docs/             人向け MD · 規程施行文
    └── rules/            会社固有コンテキスト（Agent が参照）
```

## テナント切替

```bash
export STEWARD_TENANT=mal          # シェル
npm run steward -- --tenant mal validate
```

`tenant.yaml` で `default: true` のテナントが、環境変数未指定時の既定。

## 新規テナント（推奨）

```bash
npm run steward -- tenant init acme --name "株式会社ACME" --from rental
# tenant init 内で regulations seed を自動実行
npm run steward -- --tenant acme validate
```

手動コピー: `cp -R tenants/_template tenants/{id}` 後、`tenant.yaml` 編集 · `steward regulations seed`

## 参照実装: `demo/`

**理想形の骨格テナント** — データ投入なしで validate 通過:

- 賃貸1物件（`rental` のみ有効 · hospitality OFF）
- ガバナンス REG のみ（REG-001–008 · REG-010）
- 契約0 · cash-balance 未確定 · secrets 未作成
- `lifecycle: skeleton` · `ops-config.skeleton: true`

```bash
npm run steward -- --tenant demo validate   # CI / テスト必須
```

本番運用データの参照例: [mal/](../mal/)

パス表記: Agent · CLI ログでは **`data/` · `docs/` はアクティブテナント内**を指す（論理パス）。
