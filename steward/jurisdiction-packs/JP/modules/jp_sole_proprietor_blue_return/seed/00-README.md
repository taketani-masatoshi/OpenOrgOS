# jp_sole_proprietor_blue_return seeds

| Seed | Tenant 先 |
|------|-----------|
| `chart-of-accounts.yaml.example` | `data/finance/chart-of-accounts.yaml`（個人事業主科目） |
| `expense-line-map.yaml.example` | `data/finance/blue-return-expense-map.yaml`（任意） |
| `blue-return-filing.yaml.example` | `data/finance/blue-return-filing.yaml`（65万円証跡） |

`tenant init --entity-form sole_proprietorship` は CoA · 暦年 tax-profile を自動 seed する。
