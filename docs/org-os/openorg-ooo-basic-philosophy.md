# OpenOrg / OOO 基本思想（2026-07-06 整理版）

**Status:** 設計参照資料（日本語）  
**Scope:** OpenOrg 標準 · OOO 実行モデル · 組織イベントの意味論  
**関連:** [openorgos-core-philosophy.md](openorgos-core-philosophy.md)（Core 四要素 · 英語正本）· [orgos-vocabulary.md](orgos-vocabulary.md)（用語）· [layer-mapping-steward-os.md](layer-mapping-steward-os.md)（本リポジトリ対応）

---

## 骨格

確定的なプログラムを、自然言語で動く AI エージェントが人とのインターフェースとして担うことで、組織を動かす OS — 組織のイベントを記録する — という内容である。

---

## 1. 問題意識

現在の ERP や業務システムは、それぞれ独自のデータ構造・業務フロー・API を持っている。

- SAP
- Salesforce
- Oracle
- Google Workspace
- 独自システム

これらは個別には優れているが、組織間・システム間で共通言語が存在しない。

そのため、

- AI は会社ごとに学習が必要
- システム間連携が高コスト
- ERP が変わると連携も作り直し
- 会社全体を俯瞰して状態を理解できる人がいない

という問題が発生する。

---

## 2. OpenOrg の目的

OpenOrg は ERP を作ることが目的ではない。

OpenOrg は **「組織イベントの共通言語（Common Language of Organizational Events）」** を提供することを目的とする。

ERP を置き換えるのではなく、ERP · AI · 行政システム · 他社システムを横断して接続できる基盤を目指す。

---

## 3. 基本思想

組織は **状態（State）** を持つ。

**イベント（Event）** が発生すると状態（State）が変化する。

つまり、

```
State(t+1) = F(State(t), Event, Organizational Context)
```

である。

ここで、

| 要素 | 例 |
|------|-----|
| **State** | 売上 · 利益 · 契約 · 権利 · 義務 · 在庫 · 権限 · 従業員 · 資産 · 負債 · その他組織状態 |
| **Event** | 採用 · 契約締結 · 発注 · 支払 · 入金 · 退職 · etc. |
| **Organizational Context** | 組織 · 部門 · 役職 · 権限 · 社内ルール · 法律 · 契約 · その他組織固有情報 |

---

## 4. OpenOrg が標準化するもの

OpenOrg は以下のみを標準化する。

### ① Event Taxonomy

イベントの分類。

例: HR · Finance · Legal · Sales · Manufacturing

### ② Event Ontology

イベントの意味。

例: `Contract.Signed`

意味:

- 契約が成立した
- 権利が発生した
- 義務が発生した

ここでは **「意味」** を定義する。

### ③ Event Representation

イベントの表現方法。

例:

- `Employee.Hired`
- `Purchase.Created`
- `Contract.Signed`
- `Invoice.Issued`
- `Payment.Completed`

世界中の OOO はこの表現を理解できる。

---

## 5. OpenOrg が標準化しないもの

OpenOrg は以下を標準化しない。

- Workflow
- 社内プロセス
- 承認フロー
- ERP
- 勘定科目
- 社内ルール
- AI の実装方法

これらは各社が自由に設計する。

---

## 6. 会社固有ルール

例えば、イベント `Purchase.Created` であっても、

| 業種 | 状態への影響（例） |
|------|-------------------|
| イベント会社 | イベント運営費 |
| 酒造会社 | 原材料 |
| 病院 | 医療材料 |
| 飲食店 | 在庫 |

つまり、**同じイベントでも Organizational Context によって状態遷移は変わる。**

OpenOrg はその変化を決めない。

---

## 7. OOO の役割

OOO（OpenOrg OS）は次を実行する OS である。

```
Event
  ↓
Company Rule
  ↓
State Transition
```

つまり、

| 主体 | 役割 |
|------|------|
| **OpenOrg** | イベントを定義する |
| **会社** | ルールを定義する |
| **OOO** | そのルールに従い状態を更新する |

---

## 8. OOO 同士の通信

OOO 同士は API ではなく、**イベント（Event）** を交換する。

例:

```
Company A: Contract.Signed
        ↓
Company B: Contract.Signed  （受信）
```

Company B の OOO はこのイベントを理解する。

その後、**Company B 独自ルール** に従い、**状態（State）** を更新する。

つまり、

- **イベントは共通**
- **状態遷移は各社固有**

である。

---

## 9. OpenOrg の価値

OpenOrg は、組織を標準化するものではない。Workflow を標準化するものでもない。

OpenOrg は、**「組織イベントの意味を世界共通で表現する仕様」** を提供する。

その結果、

- AI
- ERP
- 行政
- 他社システム

が共通言語で通信できる。

---

## 10. 最終ビジョン

世界中の組織が OpenOrg Event を理解する。

各組織は自由にルールを持つ。

OOO はそのルールを実行する。

その結果、組織間は **「イベント」** という共通言語で通信できる。

OpenOrg は、組織のルールや ERP を統一するのではなく、**「組織イベントの意味」** を標準化することで、AI 時代の組織間相互運用（Semantic Interoperability）の基盤となることを目指す。

---

## 本リポジトリ（OrgOS 参照実装）との対応

| 本書の概念 | OrgOS / 本リポジトリ |
|------------|----------------------|
| OpenOrg（イベントの意味 · 表現） | OpenOrgOS Core — Org Event Model · [openorgos-core-philosophy.md](openorgos-core-philosophy.md) |
| OOO（ルール実行 · 状態更新） | **OrgOS** 製品全体 — テナント `data/` · Agent · Skill · CLI |
| Company Rule | テナント規程 · `regulations.yaml` · jurisdiction pack · module 定義 |
| Organizational Context | `tenants/{id}/` · jurisdiction bind · `company_context.md` |
| AI エージェント（人との IF） | Steward Agent · 部門 Agent · Operator 層 — [agent_skill_architecture.md](../../steward/rules/agent_skill_architecture.md) |
| 組織間イベント交換 | Wire · `protocol notice` · [inter-org-operator-model.md](inter-org-operator-model.md) |
| 会社イベント無効化 | `events void` · [company-events-requirements.md](../spec/company-events-requirements.md) |

**用語:** 本書の **OOO** は会話上の **OrgOS**（組織 OS 製品）に相当する。プロトコル核のみを指す場合は **OpenOrgOS Core** と区別する — [orgos-vocabulary.md](orgos-vocabulary.md)。
