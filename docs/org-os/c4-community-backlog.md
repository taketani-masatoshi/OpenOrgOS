# C4 Community — Steward 側完了 + Community WO 残

**Status:** Steward-side **完了** · OS_Community **backlog**  
**Ecosystem スコア:** **80%**（Steward 実装）· 85+ は OS_Community  
**Parent:** [orgos-completion-plan.md](orgos-completion-plan.md) ORG-C4 · [framework-assessment.md](../framework-assessment.md) §13

---

## 1. Steward 側完了（2026-06-27）

| 項目 | 根拠 |
|------|------|
| trusted operator registry | `steward/platform/protocol/trusted-operators.yaml` · `protocol community operators` |
| revocation SLA | `revocation_sla.max_hours` · `protocol community check-sla` |
| governance workflow | `protocol community governance submit|decide` |
| witness trust revocation | `protocol witness trust revoke` · bundle `revocations[]` |
| readiness score | `protocol community readiness` · `computeCommunityReadiness()` → Eco 80% |

---

## 2. OS_Community 残（別 WO）

| ID | 内容 | 状態 |
|----|------|------|
| **C4-1** | 申請ライフサイクル UX | ○ backlog |
| **C4-2** | 委員会 CHAIR 承認 UI | ○ backlog |
| **C4-3** | UI 語彙対応表 | △ 部分 |
| **C4-4** | 本番 SLA · Playwright | ○ backlog |

---

## 3. CLI 早見

```bash
npm run orgos -- protocol community operators-validate
npm run orgos -- protocol community check-sla
npm run orgos -- protocol community readiness
npm run orgos -- status --orgos
```

*改定: 2026-06-27 · Steward-side C4 完了*
