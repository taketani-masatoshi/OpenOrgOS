# tenants/ — 会社別インスタンス

Steward OS **フレームワーク**（`steward/` · `src/` · `schemas/`）と分離した、**テナント（会社）ごとの正データ・人向け書類・会社ルール**。

- 業務モジュール定義: `steward/modules/{id}/` · 雛形: `{id}/seed/`
- ISO 標準テンプレート: `steward/standards/iso/`
- テナントは `modules.yaml` でパスを **バインド** するのみ

## 構成

```
tenants/
└── {tenant-id}/
    ├── tenant.yaml       テナントメタ（id · 法人名 · default フラグ）
    ├── modules.yaml      業務モジュール ON/OFF · 物件バインド
    ├── data/             正データ YAML
    ├── docs/             人向け MD · CSV · PDF 索引
    └── rules/            会社固有コンテキスト（Agent が参照）
```

## テナント切替

```bash
export STEWARD_TENANT=mal          # シェル
npm run steward -- --tenant mal validate
```

`tenant.yaml` で `default: true` のテナントが、環境変数未指定時の既定。

## 新規テナント

1. `cp -R tenants/_template tenants/{id}` — 雛形をコピー
2. `tenant.yaml` · `modules.yaml` · `rules/company_context.md` · `data/company.yaml` を編集
3. `steward/modules/{id}/seed/` から雛形をコピーし、必要な `data/` · `docs/` を追加（[mal/](../mal/) を参照実例）
4. `npm run steward -- --tenant {id} validate`
5. `npm run steward -- modules list` — カタログと有効モジュール確認

パス表記: Agent · CLI ログでは **`data/` · `docs/` はアクティブテナント内**を指す（論理パス）。
