# data/sales/（MAL）

| ファイル | 用途 | Owner |
|----------|------|-------|
| `pipeline.yaml` | 商談パイプライン正本（CRM 相当） | Sales Lead |

Canvas 投影: `orgos canvas present --suite sales` → `mal-sales-pipeline.canvas.tsx`

- `party.*` に先方担当・役職・連絡先・資本金・与信・所在地・株主・備考を保持
- `owner_name` は社内担当の氏名（MAL: 段燕燕 / 宮城万貴子）
- 個人携帯・口座番号は書かない（会社代表電話 · 業務メールを想定）
- `demo: true` はシード行
