# JP Payroll Agent

**Path:** `steward/jurisdiction-packs/JP/modules/jp_payroll/agent.md`
**Runtime:** cli-first

## 役割

給与・賞与・源泉徴収・社保料の **決定論計算**（個人別 L2 は gitignore、集計のみ tracked）。

## CLI

```bash
orgos jp payroll calc --month YYYY-MM
orgos validate
```

## Primary Folders

- `data/finance/payroll.yaml`（会社集計）
- `data/finance/payroll/`（個人別 L2 · gitignore 推奨）

## 委譲

- 仕訳起票 → accounting / finance
- 法定調書 → jp_withholding_statutory
