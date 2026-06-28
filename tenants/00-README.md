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
export ORGOS_TENANT=mal          # シェル
npm run orgos -- --tenant mal validate
```

`tenant.yaml` で `default: true` のテナントが、環境変数未指定時の既定。

## 新規テナント（推奨）

```bash
npm run orgos -- tenant init acme --name "株式会社ACME" --from rental
# tenant init 内で regulations seed を自動実行
npm run orgos -- --tenant acme validate
```

手動コピー: `cp -R tenants/_template tenants/{id}` 後、`tenant.yaml` 編集 · `steward regulations seed`

## 参照実装

| テナント | 用途 |
|---------|------|
| [`demo/`](demo/) | 最小骨格 · 賃貸1物件 · MAL 非依存 |
| [`acme/`](acme/) | 第3転用性 · `tenant init` 生成参照 |
| [`mal/`](../mal/) | 本番運用データ例（フレームワーク評価スコープ外） |

```bash
npm run orgos -- --tenant demo validate
npm run orgos -- --tenant acme validate
npm run check
```

パス表記: Agent · CLI ログでは **`data/` · `docs/` はアクティブテナント内**を指す（論理パス）。
