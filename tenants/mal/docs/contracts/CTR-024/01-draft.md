# 【法務デモ】施設賠償責任保険（草案）

> **契約 ID:** CTR-024 · **状態:** draft · **リスク:** high  
> **Owner:** Contract Agent（法務）  
> **物件:** PROP-001（番町ハイム312 · デモ紐付け）  
> **台帳:** [`data/contracts/CTR-024.yaml`](../../../data/contracts/CTR-024.yaml)  
> **加入キット:** [02-enrollment-packet.md](02-enrollment-packet.md)  
> **Canvas:** `mal-contract-portfolio` · [DEMO-canvas-pack.md](../DEMO-canvas-pack.md)

**注意:** デモ用。実保険証券ではない。実火災保険は CTR-013 / CTR-014 を参照。

---

## 保障概要（デモ値）

| 項目 | 内容 |
|------|------|
| 保険者 | デモ損害保険株式会社 |
| 被保険者 | 株式会社MAL |
| 目的 | 施設内第三者賠償（対人・対物） |
| 予定始期 | 2026-09-01 |
| 更新意思確認 | 2026-08-20 |

## 次の一手（法務）

1. 加入キットのチェック完了
2. 見積・証券受領後 status を transition
3. Canvas で high_risk / unsigned が消えることを確認
