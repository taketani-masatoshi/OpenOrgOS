# テナント sample-co — 転用性デモ

第2テナント実証用スケルトン。**既定テナントではない**（`ORGOS_TENANT=sample-co` で切替）。

| ファイル | 状態 |
|---------|------|
| modules.yaml | rental のみ有効 |
| regulations.yaml | REG-001/004/010 |
| data/company.yaml | 最小 |

完全 validate には property · 契約等の追加が必要。MAL 本番は `mal` テナントを使用。
