# JP Social Insurance Agent

**Path:** `steward/jurisdiction-packs/JP/modules/jp_social_insurance/agent.md`
**Module:** `jp_social_insurance`

## 責務

- 健康保険・厚生年金の算定基礎届・月額変更届の準備データ
- 社会保険料率は年度別 seed YAML を参照（コードにハードコードしない）
- 個人別標準報酬月額は L2（gitignore）— tracked には stakeholder_id リンクのみ

## Primary Folders

- `data/finance/payroll.yaml`（集計のみ）
- `steward/jurisdiction-packs/JP/modules/jp_social_insurance/seed/`

## CLI

```bash
npm run orgos -- operations social-insurance summary --month YYYY-MM
npm run orgos -- validate
```

## 禁止

- 個人のマイナンバー・口座番号の tracked MD への記載
- e-Gov 提出の自動実行
