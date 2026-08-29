# OrgOS 組織ガバナンス原則（ISO 37000 対応）

**版:** 1.1 · **日付:** 2026-08-29  
**正本:** 本書 · **ADR:** [0024](../../docs/adr/0024-core-governance-principles-iso-37000.md)  
**叙述:** [docs/org-os/governance-principles.md](../../docs/org-os/governance-principles.md)  
**自己宣言:** `orgos governance principles init|status|declare`

ISO 37000:2021（Governance of organizations — Guidance）の **11原則** を OrgOS の決定論面へ対応づける。  
認証スキームではない。自己宣言は人間署名後のみ `self_declared`。

数値閾値（例: 予算調整帯）はテナント設計パラメータであり、本原則の外側で決める。

---

## 原則と OrgOS 実装面

| ID | ISO 37000 原則 | OrgOS 実装面（決定論） |
| --- | --- | --- |
| **P-01** | Purpose（目的） | `business-plan` の mission / vision / values · `mission-vision.md` |
| **P-02** | Value generation（価値創出） | 事業計画 KPI · 収益計画 · IR |
| **P-03** | Strategy（戦略） | 中期目標 · モジュール有効化 · 計画未承認時の執行枠増額ロック（ADR 0027） |
| **P-04** | Oversight（監督） | 会社イベント · 取締役会/総会 REG-002/003 · Operator Console |
| **P-05** | Accountability（説明責任） | `operators.yaml` · RBAC · 自己承認禁止 · auditor または補償統制 |
| **P-06** | Stakeholder engagement | `company.yaml` 顧問 · ガバナンス台帳 · IR / Wire（準備後） |
| **P-07** | Leadership（リーダーシップ） | ログインドメイン · PassKey · 人間最終承認（ADR 0038） |
| **P-08** | Data and decisions | YAML SSOT · analytics · dashboard · 変更ゲート A/B/C |
| **P-09** | Risk governance | `data/risk/register.yaml` · ISO 27001 リスク台帳（有効時） |
| **P-10** | Social responsibility | REG-014 / ESG 記録 · 領域 MS（例: ISO 21401）は別 |
| **P-11** | Viability and performance over time | 複数年計画 · 負債計画 · tenant lifecycle |

---

## オペレーター必須行動

1. 目的（mission / vision）は統治機関が確定する。スケルトン文言のまま自己宣言しない。
2. 枠超過・調整幅超過は上位承認へ申請する。`beyond_policy` は取締役会イベント必須。
3. L2/L3 をチャットや tracked MD に書かない（[data-classification.md](data-classification.md)）。
4. 危険操作は RBAC + 承認ゲートを迂回しない。
5. ISO 37000 自己宣言は `orgos governance principles status` が充足した後、**人間が** `declare` する。第三者認証ではない。
6. `orgos tenant init` は目的ドラフトと自己宣言 YAML を作る。文言の確定は人間。

---

## ISO との関係

| 規格 | OrgOS での扱い |
| --- | --- |
| **ISO 37000** | Guidance · **自己宣言可** · 本原則 + `steward/standards/iso/ISO-37000/` |
| **ISO 37001** | 贈収賄防止 ABMS · 本パックと別（スタブ可） |
| **ISO 37301** | コンプライアンス MS · 認証前提 · モジュール `iso_cms`（未実装時は ID 予約のみ） |
| **9001 / 27001 / 21401** | 領域マネジメントシステム · 37000 の代替ではない |

---

## 関連

- [operator-policy.md](operator-policy.md)
- ADR [0024](../../docs/adr/0024-core-governance-principles-iso-37000.md) · [0027](../../docs/adr/0027-budget-envelope-governance.md) · [0038](../../docs/adr/0038-human-approval-context.md)
