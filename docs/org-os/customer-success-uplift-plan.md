# カスタマーサクセス品質引き上げ計画

**日付:** 2026-08-24  
**対象:** `customer_success` コア Agent + 業務モジュール  
**ADR:** [0050-customer-success-deterministic-stack.md](../adr/0050-customer-success-deterministic-stack.md)  
**仕様:** [customer-success-spec.md](customer-success-spec.md)

---

## 1. ゴール

| ゴール | 達成イメージ |
|--------|----------------|
| 決定論 KPI | `orgos sales customers` · Today · Chat fact provider |
| ヘルススコア | rubric から 0–100 算出 · drift 検出 |
| モジュール契約充足 | manifest · agent.md · seed · cli · skills |
| Skill CLI 化 | `cs_health_check` · `cs_renewal_risk` が `runtime: cli` |
| mal 実運用 | roster · modules.yaml · demo データ 3–4 件 |

---

## 2. フェーズ

### P0 — 境界確定 ★

| ID | 作業 | DoD |
|----|------|-----|
| P0-1 | ADR 0050 · spec · uplift-plan | Path 参照可能 |
| P0-2 | routing `docs/customers/` 正規化 | drift 解消 |

### P1 — スキーマ · モジュール骨格

| ID | 作業 | DoD |
|----|------|-----|
| P1-1 | `schemas/customer-success/` 6 スキーマ | validate 統合 |
| P1-2 | `steward/modules/customer_success/` | modules check 通過 |
| P1-3 | registry wiring | core-ids · readiness · module-cli |

### P2 — ヘルススコア

| ID | 作業 | DoD |
|----|------|-----|
| P2-1 | `computeAccountHealth` 純関数 | unit test |
| P2-2 | view 拡張 · integrity checks | drift WARNING |

### P3 — Skill · CLI

| ID | 作業 | DoD |
|----|------|-----|
| P3-1 | cs_* Skill → cli | skills run 動作 |
| P3-2 | operations customer-success | show/validate/health |

### P4 — Chat · Today · Canvas

| ID | 作業 | DoD |
|----|------|-----|
| P4-1 | operator_customer_success | fact provider 登録 |
| P4-2 | Today 顧客 KPI | formatCustomerSuccessTodayLines 接続 |
| P4-3 | Canvas builder | suite sales / view_id customers |

### P5 — テナント

| ID | 作業 | DoD |
|----|------|-----|
| P5-1 | mal roster + modules.yaml | customer_success 有効 |
| P5-2 | _template + demo データ | 3–4 accounts |

### P6 — DoD

| ID | 作業 | DoD |
|----|------|-----|
| P6-1 | 4 test files | npm test 緑 |
| P6-2 | agent export · sync · CHANGELOG | npm run check 緑 |

---

## 3. 成功指標

| 指標 | 目標 |
|------|------|
| `orgos validate` | エラー 0 |
| `orgos agent readiness --agent customer_success` | ≥ 90% |
| drift 未解消 | Today で可視 · validate WARNING |
| Skill CLI | cs_health_check / cs_renewal_risk が agent 不要 |

---

## 4. 関連

- [customer_success_agent.md](../../steward/core/agents/customer_success_agent.md)
- [steward/modules/customer_success/](../../steward/modules/customer_success/module.manifest.yaml)
- ADR 0047 Sales Line Deterministic Stack
