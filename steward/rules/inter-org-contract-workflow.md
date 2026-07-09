# 組織間契約ワークフロー（ガイドレール）

**版:** 1.0 · **日付:** 2026-07-09  
**正本:** 本書 · **関連:** [folder_access_policy.md](folder_access_policy.md) §2.3 · [inter-org-operator-model.md](../../docs/org-os/inter-org-operator-model.md)

組織間（inter-org）契約において、**いきなり双方の `docs/contracts/` に同一ドラフトを置かない**ことを原則とする。  
実務の流れ（起票 → 送付 → すり合わせ → 各社稟議 → 締結）に沿ったフォルダ境界と Agent 責務を定める。

---

## 1. フェーズ一覧

| Phase | 名称 | 起票側テナント | 相手側テナント | `data/contracts/` |
|:-----:|------|----------------|----------------|-------------------|
| **P0** | 起票（drafting） | `docs/contracts/CTR-*/01-draft.md` を作成 | **置かない** | 起票側のみ `status: draft` |
| **P1** | 送付（sent） | `docs/io/outbox/sent/` に送付記録 | `docs/io/inbox/` に受領原本 | 起票側のみ |
| **P2** | すり合わせ（negotiating） | `01-draft.md` を改訂 · `00-workflow.md` に履歴 | inbox に改訂版を蓄積 | 起票側のみ |
| **P3** | 各社稟議（internal_approval） | REG-004 稟議 · REG-006 利益相反 | 同左（**自社分のみ**） | **双方**が自社 CTR 台帳を新規登録可 |
| **P4** | 署名待ち（pending_signature） | `02-executed.md` 下書き | 同左 | 双方 `status: pending_signature` |
| **P5** | 締結（executed） | `02-executed.md` 正本 · Wire notice 任意 | mirror または受領 executed | 双方 `status: executed` |

**禁止:** P0〜P2 の時点で相手テナントの `docs/contracts/CTR-*/01-draft.md` に同一本文をコピーすること。

---

## 2. 起票側の決め方

| 契約種別 | 起票側（既定） | 理由 |
|----------|----------------|------|
| 業務委託（委託者が発注） | **委託者** | 要件・SOW を委託者が定義 |
| 業務委託（受託者が提案） | 受託者 | 見積・提案書から入る場合 |
| 賃貸借（貸主起案） | 貸主 | |
| 賃貸借（借主起案） | 借主 | |

**CEO が方向性を確定するまで** Agent は起票側を仮置きし、`00-workflow.md` に `origin_tenant: TBD` と明記する。

---

## 3. フォルダ配置（テナント別）

### 3.1 起票側（P0〜P2）

```
docs/contracts/CTR-XXX/
  00-workflow.md      # フェーズ・送付履歴・すり合わせメモ（L1）
  01-draft.md         # 編集中ドラフト（正本）
docs/io/outbox/sent/CTR-XXX/   # メール送付 PDF/MD の控え（任意）
data/contracts/CTR-XXX.yaml    # status: draft · counterparty のみ（相手テナント ID は notes）
```

### 3.2 相手側（P0〜P2）

```
docs/io/inbox/CTR-XXX/         # 受領したドラフト・改訂版（Operations 归档）
# docs/contracts/CTR-XXX/      # ← この段階では作らない
# data/contracts/CTR-XXX.yaml  # ← この段階では作らない
```

### 3.3 双方（P3〜P5）

稟議開始時点で、**各社が自社視点の台帳**を登録する（ID は揃える · `CTR-XXX`）。

| 項目 | 起票側 | 相手側 |
|------|--------|--------|
| `counterparty` | 相手社名 | 相手社名 |
| `scope_summary` | 自社が委託者/受託者のどちらか | 逆の視点で記載 |
| `documents.draft` | 自社 `01-draft.md` | 稟議用コピーまたは inbox 参照 |
| `documents.executed` | P5 で正本 | P5 で受領版 |

**締結後（P5）** のみ、相手側 `docs/contracts/CTR-XXX/02-executed.md` に executed 版を置く（mirror）。ドラフトの mirror は不要。

---

## 4. Agent 責務

| フェーズ | 主担当 | 協調 |
|----------|--------|------|
| P0 起票 | **Legal Agent**（条項）→ **Contract Agent**（台帳） | Executive（方向性） |
| P1 送付 | **Secretary / Operations** | Contract（送付記録） |
| P2 すり合わせ | **Legal Agent** | Contract（版管理） |
| P3 稟議 | **Procurement Agent**（REG-004） | **Compliance**（REG-006 利益相反） |
| P4 署名 | Contract + Secretary | CEO 承認 |
| P5 締結 | Contract | Operations（inbox→executed 归档）· Wire `contract.execution.notice`（任意） |

**Operator 禁止:** P0〜P2 で相手テナントに `01-draft.md` を自動複製しない。

---

## 5. メール送付・すり合わせ（L1 運用）

1. 起票側 Contract が `01-draft.md` を PDF または MD で Secretary に渡す
2. Secretary が相手担当へ送付（社外メール · L1）
3. 相手側 Operations が受領を `docs/io/inbox/CTR-XXX/` に归档（日付・版番号）
4. 差戻し・条件変更は `00-workflow.md` に要約（全文は inbox / draft に版を残す）

---

## 6. 稟議（P3）

各社**独立に** REG-004 稟議を回す。

- 利益相反（同一代表者等）: REG-006 手続を先にまたは並行で実施
- 稟議承認後、当社 `data/contracts/CTR-XXX.yaml` の `status` を `pending_signature` へ
- **この時点で初めて**相手側も `data/contracts/CTR-XXX.yaml` を作成してよい

CLI（社内稟議）:

```bash
orgos org approval submit --subject "CTR-XXX 業務委託契約" ...
orgos org approval approve --id APR-...
```

---

## 7. 締結（P5）と Wire

1. 双方署名済 `02-executed.md` を Contract が登録
2. `status: executed` · `executed_date` 設定
3. 組織間通知が必要な場合:

```bash
orgos protocol notice draft --peer PEER-* --contract CTR-XXX
orgos protocol notice approve --id NOTICE-* --approver "..."
```

---

## 8. チェックリスト（Agent / Operator）

- [ ] 起票側のみに `01-draft.md` がある（P2 まで）
- [ ] 相手側は `docs/io/inbox/` のみ（または未受領）
- [ ] `00-workflow.md` に phase・origin_tenant・送付日がある
- [ ] 稟議前に相手テナントへ CTR YAML を作っていない
- [ ] 締結後に双方 `executed` と `02-executed.md` がある

---

## 9. 例: Southwood → AIAC 業務委託（CTR-015）

| 項目 | 値 |
|------|-----|
| 起票側 | **southwood**（委託者） |
| 相手 | aiac（受託者） |
| 正本ドラフト | `tenants/southwood/docs/contracts/CTR-015/01-draft.md` |
| AIAC（P2 まで） | `docs/io/inbox/CTR-015/` のみ — **contracts フォルダなし** |

---

## 10. 関連

- [contract_agent.md](../core/agents/contract_agent.md)
- [legal_agent.md](../core/agents/legal_agent.md)
- [procurement_agent.md](../core/agents/procurement_agent.md)
- [operator-policy.md](operator-policy.md) §4 承認ゲート
