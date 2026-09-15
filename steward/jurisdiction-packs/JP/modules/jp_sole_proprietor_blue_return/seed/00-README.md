# jp_sole_proprietor_blue_return seeds

| Seed | Tenant 先 |
|------|-----------|
| `chart-of-accounts.yaml.example` | `data/finance/chart-of-accounts.yaml`（個人事業主科目） |
| `blue-return-expense-map.yaml.example` | `data/finance/blue-return-expense-map.yaml`（正） |
| `expense-line-map.yaml.example` | **別名（deprecated）** — 上記と同じ内容 |
| `blue-return-filing.yaml.example` | `data/finance/blue-return-filing.yaml`（65万円証跡） |
| `blue-return-allocation.yaml.example` | `data/finance/blue-return-allocation.yaml` |
| `blue-return-setup.yaml.example` | `data/finance/blue-return-setup.yaml`（初期確認回答） |
| `blue-return-expense-intake.yaml.example` | 単票の雛形（`expense-intakes.yaml` の1要素） |
| `blue-return-income-deductions.yaml.example` | `data/finance/blue-return-income-deductions.yaml`（所得控除手入力） |

`tenant init --entity-form sole_proprietorship` は CoA · 暦年 tax-profile を自動 seed する。  
初期・支出の確認は `sole-prop-blue setup|expense-intake clarify` で埋める。
前払（timing=prepaid）は取得時に 1180 を資産計上し、費用化は `sole-prop-blue prepaid transfer-year`（二重費用化しない）。

**e-Tax / 行政提出は対象外（ADR 0052）。** OrgOS は金額ドラフトと証跡 YAML まで。送信は事業主・税理士。
