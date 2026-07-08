# 統制フレームワーク — ISO × 社内規程 × Agent

**ゾーン:** フレームワーク定義 · **対象:** 全テナント共通の統制 ID・成熟度・Agent オーナーシップ。

ISO 条項を **統制テンプレート（CTL）** として機械可読化し、社内規程（REG）・証拠パス・担当 Agent を結ぶ。テナント固有の成熟度は `tenants/{id}/data/compliance/controls.yaml` に置く。

---

## 統制 ID

| 形式 | 例 | 用途 |
|------|-----|------|
| `CTL-{ISO}-{clause}` | `CTL-9001-4.3` | ISO 条項に紐づく統制 |
| `CTL-CORE-{name}` | `CTL-CORE-doc-control` | 複数 ISO 共通統制 |

---

## 正本の分離

| 層 | パス |
|----|------|
| 成熟度定義 | [maturity-model.yaml](maturity-model.yaml) |
| Agent オーナーシップ | [agent-roles.yaml](agent-roles.yaml) |
| ISO 条項マップ | `steward/standards/iso/ISO-XXXX/control-map.yaml` |
| 法域 REG バインディング | `steward/jurisdiction-packs/{code}/control-framework/reg-bindings.yaml` |
| テナント状態 | `tenants/{id}/data/compliance/controls.yaml` |

---

## 成熟度（L0–L4）

| Level | 意味 |
|-------|------|
| L0 | 未検討 |
| L1 | 方針ドラフト |
| L2 | 方針承認・記録運用開始 |
| L3 | 内部監査・MR 実施記録 |
| L4 | 認証機関審査・登録 |

---

## CLI

```bash
orgos controls list [--iso ISO-9001] [--agent compliance]
orgos controls status
orgos controls gap
orgos controls for-agent compliance
orgos controls set --id CTL-9001-4.3 --maturity L2
orgos controls init
orgos compliance gap   # REG ギャップ + 統制ギャップ
```

---

## 関連

- ISO テンプレ: [../iso/00-このフォルダについて.md](../iso/00-このフォルダについて.md)
- Compliance Agent: [../../core/agents/compliance_agent.md](../../core/agents/compliance_agent.md)
- Internal Audit Agent: [../../core/agents/internal_audit_agent.md](../../core/agents/internal_audit_agent.md)
