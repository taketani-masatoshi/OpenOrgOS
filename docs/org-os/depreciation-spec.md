# 減価償却仕様

**実装:** `src/lib/finance/depreciation.ts` · **料率:** `steward/jurisdiction-packs/JP/seed/depreciation-rates-2026.yaml`

- 定額法 / 定率法 / 非償却
- 手入力 `annual_depreciation` との差異は `orgos validate` で警告
- 仕訳: `orgos ledger post --source depreciation --month YYYY-MM`
