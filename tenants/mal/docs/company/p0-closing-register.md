# P0 決算前クロージングレジスタ — 株式会社MAL

**更新:** 2026-06-09（OS-99+ Cycle 0）  
**正本:** 本ファイル · 進捗確認: `npm run steward -- ops p0` · 採点: `steward status --os-99`

| ID | 項目 | 状態 | 次のアクション | 担当 |
|----|------|------|---------------|------|
| P0-01 | CTR-013 火災保険（番町） | **open** | [02-enrollment-packet](../../contracts/CTR-013/02-enrollment-packet.md) 完了 → 証券 inbox → executed | 段燕燕 |
| P0-02 | CTR-014 火災保険（亀沢） | **open** | 同上 · `licenses/insurance/` 保管 | 段燕燕 |
| P0-03 | CTR-012 清掃契約 | **open** | [02-vendor-selection](../../contracts/CTR-012/02-vendor-selection.md) から1社選定 → executed | 段燕燕 |
| P0-04 | kamezawa-secrets.yaml | **open** | `cp data/operations/kamezawa-secrets.yaml.example data/operations/kamezawa-secrets.yaml` · 実値入力 | 運用 |
| P0-05 | cash-balance.yaml | **open** | 2口座残高入力 → `status: confirmed` → validate | 経理 |
| P0-06 | operations/records | **開始** | [2026/08/](../../properties/PROP-002-kamezawa/operations/records/2026/08/) 最小ログ継続 | 運用 |
| P0-07 | 第1回内部監査 | **完了** | [audit-01-report.md](../../compliance/iso/audit-records/fy2026/audit-01-report.md) | 宮城万貴子 |

---

## チェックリスト（手順）

### 火災保険（CTR-013/014）

1. 加入パケット記入 · 保険会社提出
2. 証券 PDF → `docs/io/inbox/` → `licenses/insurance/`
3. `data/contracts/CTR-0XX.yaml` を `status: executed` · 保険料記入
4. `npm run steward -- sync contracts` · `npm run validate`

### secrets

```bash
cp tenants/mal/data/operations/kamezawa-secrets.yaml.example \
   tenants/mal/data/operations/kamezawa-secrets.yaml
# Wi-Fi · 鍵 · 緊急連絡を入力（Git 非追跡）
npm run validate
```

### cash-balance

```bash
# data/finance/cash-balance.yaml
# as_of · accounts[].amount を入力
# status: confirmed
npm run validate
npm run steward -- dashboard  # ランウェイ反映
```

---

## 関連

- [executive-remaining-tasks.md](executive-remaining-tasks.md)
- [steward-assessment.md](../compliance/iso/steward-assessment.md)
