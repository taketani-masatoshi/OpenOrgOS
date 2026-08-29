# Org chart fixtures

正本の運用ファイルは `tenants/{id}/data/org/org-chart.yaml`。

Vitest は `tenants/demo/data` をスナップショット復元するため、未コミットの組織図が消える。
`setup-restore-protocol.ts` がこのディレクトリを overlay する。

| パス | 用途 |
|------|------|
| `{tenant}/org-chart.yaml` | 現行 |
| `{tenant}/org-chart-history/` | 過去記録（任意） |
| `{tenant}/org-authority.yaml` | 部門長・部門計画枠（任意） |
| `{tenant}/budget-delegations.yaml` | 予算配賦・個人枠（任意） |
| `{tenant}/operators.yaml` | オペレータ名簿・社員席（任意） |

未コミットの `data/org` ファイルをここに置くと、復元後に overlay される。
正本を変えたら、このコピーも同じ内容に更新する。
