# JP 許認可カタログ（CSV）

**正本（SSOT）:** 本ディレクトリの CSV  
**対象:** 許認可種別 · 前提関係 · 取得条件 · 政府公式ソース

| ファイル | 内容 |
|---------|------|
| `permit-types.csv` | 許認可種別マスタ |
| `permit-prerequisites.csv` | 種別間の前提（複合キー） |
| `permit-conditions.csv` | 取得・変更・更新フェーズの条件チェックリスト種 |
| `permit-sources.csv` | 法令・省庁ポータル等の公式 URL |
| `permit-type-sources.csv` | 種別 ↔ ソースの紐づけ |

## 方針

1. **CSV が法域共通カタログの正本**（行単位の差分・表計算更新を想定）
2. 法令本文は転載しない — 法令名+条 · 要約 · 公式 URL のみ
3. `seed/*.yaml.example` は **後方互換ロード用**に残す場合がある（生成元・移行期間）
4. 変更時は該当行を更新し、`catalog_version`（types）または `reviewed_on`（sources）を更新
5. CLI `operations permit catalog validate`（実装時）で URL · 孤立 ID · 前提閉包を検査

## 生成元

初期データは次の YAML seed から機械移植した:

- `../seed/permit-types-catalog.yaml.example`
- `../seed/sources.yaml.example`

conditions の初期行は要件サンプル（住宿）および義務カタログ由来のスケルトン。

## レビュー状態

- `review_status=verified`: `accommodation` · `fire_building`
- その他カテゴリは `unverified`（人手レビュー後に昇格）
- **カバレッジ方針:** [docs/org-os/jp-permit-catalog-coverage.md](../../../../../docs/org-os/jp-permit-catalog-coverage.md)
- 現行規模目安: **138 種別** · conditions は種別ごとに obtain ステップあり（金商法1種・化粧品製販等は詳細化済）

## YAML 同期

```bash
node --import tsx scripts/expand-jp-permit-catalog.ts --sync-yaml-only
```

## フォームパック生成

欠落している許認可種別向けに MD/TeX ひな形と `seed/forms-catalog.yaml.example` エントリを追記する:

```bash
node --import tsx scripts/generate-permit-form-packs.ts
node --import tsx scripts/generate-permit-form-packs.ts --copy-tenant mal
```

- 正本: `permit-types.csv` · 既存 form / template はスキップ（idempotent）
- テンプレ出力先: `../seed/templates/{slug}-application.{md,tex}.example`
- `form-alcohol-sales` は `template_tex` 未設定時のみ TeX を補完する
