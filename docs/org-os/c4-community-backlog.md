# C4 Community — バックログ（スコア据置）

**Status:** backlog · **Ecosystem スコア:** **45% 据置**（虚増しない）  
**Parent:** [orgos-completion-plan.md](orgos-completion-plan.md) ORG-C4 · [framework-assessment.md](../framework-assessment.md) §13

---

## 1. スコープ外の理由

OrgOS 完成度の **エコシステム（C4）軸 10%** は、**OS_Steward リポジトリ外** の [OS_Community](https://github.com/) アプリ · SLA · Playwright E2E が主対象である。  
本リポジトリでは **設計 · 語彙 · trusted_hub pin** までをカバーし、Community 本体実装は別 WO とする。

> **意図:** ecosystem **45%** は backlog 明文化のまま据置。Implementation 側のスコアを上げない。

---

## 2. ORG-C4 チケット状態

| ID | 内容 | リポジトリ | 状態 | 備考 |
|----|------|-----------|------|------|
| **C4-1** | 申請ライフサイクル UX | OS_Community | ○ 未着手 | マイページ PENDING 一覧 · API error code |
| **C4-2** | 委員会 CHAIR 承認 | OS_Community | ○ 未着手 | `/api/committees/.../role-requests` · Admin override |
| **C4-3** | 語彙対応表 | Steward + Community | △ 部分 | [language-policy.md](language-policy.md) · UI 対応表は Community 側 |
| **C4-4** | 本番 SLA | OS_Community | ○ 未着手 | migrate baseline · CI deploy · Playwright 1 本 |
| **C4-5** | `trusted_hub` テンプレ | RFC / jurisdiction committee | ○ 未着手 | Implementation は witness pool pin のみ |

**凡例:** ✓ 完了 · △ 部分 · ○ 未着手 / backlog

---

## 3. Steward 側で完了済み（C4 前提）

| 項目 | 根拠 |
|------|------|
| trusted_hub カタログ | `steward/platform/protocol/trusted-hubs.yaml` · `protocol trusted-hubs validate` |
| witness pool pin | `protocol witness pool init-trusted` · inter-org demo |
| peer discover | `protocol peer discover` · `--suggest` で register 例出力 |
| 語彙（OrgOS） | OpenOrgOS Core 用語 · org-approval-schema |

---

## 4. 次アクション（Community WO）

1. C4-1 — 申請 API とマイページの error code 統一
2. C4-2 — CHAIR 承認フロー（Admin は override のみ）
3. C4-4 — Playwright smoke + deploy SLA 文書化
4. C4-5 — jurisdiction committee 草案 → Steward は pin テンプレ反映

---

## 5. 評価への反映

- [framework-assessment.md](../framework-assessment.md) §13 **エコシステム 45%** — 本 doc リンク
- [orgos-completion-plan.md](orgos-completion-plan.md) § ORG-C4 — 実行正本
- `npm run steward -- status --orgos` — Eco 軸は **意図的に 45%**

*改定: 2026-06-27 · ORG-C4 backlog 明文化*
