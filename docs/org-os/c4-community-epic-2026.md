# C4 Community Epic — Wire Ecosystem 98+ (2026-07-10)

**Status:** Epic 起票 · OS_Community 別 repo  
**Parent:** [c4-community-backlog.md](c4-community-backlog.md) · [wire-score-98-tickets.md](wire-score-98-tickets.md) O4-3  
**Steward 側:** Eco 厳格 cap **80**（`STEWARD_ECOSYSTEM_STRICT_CAP`）· 98+ は本 Epic 完了後

---

## Epic 概要

| 項目 | 内容 |
|------|------|
| **Epic ID** | C4-WIRE-2026 |
| **Goal** | OS_Community で Wire / Trust / Governance UX を本番 SLA まで完成し、OrgOS Eco 厳格 **98+** を解除 |
| **Owner** | OS_Community maintainers |
| **Steward 依存** | `protocol community *` CLI · trusted-operators · witness revocation · readiness score |

---

## スコープ（Issue 分割）

| Issue | タイトル | DoD | 優先 |
|-------|---------|-----|:----:|
| **C4-W1** | 申請ライフサイクル UX | 申請 → 審査 → 承認 → 公開の UI フロー · Playwright smoke | P0 |
| **C4-W2** | 委員会 CHAIR 承認 UI | `protocol community governance decide` と連動 · audit trail | P0 |
| **C4-W3** | UI 語彙対応表 | Steward ↔ Community 用語マップ · i18n 8 locale | P1 |
| **C4-W4** | 本番 SLA · Playwright | `check-sla` 相当の UI 表示 · 日次 CI | P0 |
| **C4-W5** | Wire Trust Registry ブラウザ | `publish/protocol/` mirror · operator 鍵 pin 表示 | P1 |
| **C4-W6** | committee 法域レジストリ UI | JP/EU/US 法域フィルタ · discover 連動 | P2 |

---

## Steward 側完了済み（本 Epic の前提）

- `steward/platform/protocol/trusted-operators.yaml`
- `npm run orgos -- protocol community operators-validate`
- `npm run orgos -- protocol community check-sla`
- `npm run orgos -- protocol community readiness`
- `computeCommunityReadiness()` · validate.yml community checks
- mal Wire pilot · relay/Gateway systemd · peer deliver E2E（OS_Steward）

---

## Epic Done 条件

1. OS_Community `/content/implementation-status` Wire/Eco セクション **98+** 表示
2. Playwright: 申請 → CHAIR 承認 → registry 反映 E2E green
3. Steward `npm run orgos -- status --orgos` Eco 厳格 **≥ 98**（`STEWARD_ECOSYSTEM_STRICT_CAP` 引き上げ PR）
4. 本番 `community.oorgos.org` SLA dashboard 稼働 7 日

---

## 起票テンプレ（OS_Community GitHub）

```markdown
## [Epic] C4-WIRE-2026 — Wire Ecosystem Production UX

### Summary
Complete Community-side Wire/Trust/Governance UX for OrgOS Eco strict 98+.

### Acceptance
- [ ] C4-W1 application lifecycle UI
- [ ] C4-W2 CHAIR approval UI
- [ ] C4-W4 production SLA + Playwright CI
- [ ] Steward status --orgos Eco strict ≥ 98

### Links
- Steward: OS_Steward/docs/org-os/c4-community-epic-2026.md
- Backlog: c4-community-backlog.md
```

---

## CLI 検証（Steward · Epic 進行中も実行可）

```bash
npm run orgos -- protocol community readiness
npm run orgos -- protocol community check-sla
npm run orgos -- status --orgos
```

*改定: 2026-07-10 · Top5 #5 Epic 起票*
