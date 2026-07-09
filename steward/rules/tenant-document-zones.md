# テナント書類ゾーン — 共通と拡張の切り分け

**版:** 1.0 · **日付:** 2026-07-09  
**正本:** 本書 · **詳細マップ:** [company-document-layout.md](company-document-layout.md)

テナント `docs/` は **3 ゾーン** に分ける。フォルダは **会社統一（種別別）** で、Agent 別には分けない（[folder_access_policy.md](folder_access_policy.md) で権限分離）。

---

## ゾーン一覧

| ゾーン | いつ作る | 誰が触る | 例 |
|--------|----------|----------|-----|
| **A. Core（共通）** | テナント init / `tenant scaffold-docs` | 全 Agent（権限差あり） | 契約 · 経理 · 規程 · inbox |
| **B. Extension（モジュール）** | モジュール有効化 / `modules scaffold-docs` | 当該モジュール Agent | 物件運用 · VC · 医療機器 |
| **C. Output（生成物）** | CLI / Agent 実行 | 各 Agent の要約のみ | `reports/agent-summaries/` |

**原則:** Core だけ先に作る。Extension は `modules.yaml` で `enabled: true` にしたときだけ追加する。

---

## A. Core（全組織共通）

`tenants/{id}/` 配下 — **業種に依存しない** 会社書類。

```
docs/
├── 00-このフォルダについて.md
├── company/
│   ├── regulations/      … REG-* 施行文
│   ├── governance/       … 議事録
│   ├── hr/templates/     … 人事テンプレ
│   ├── licenses/         … 許認可・登記索引
│   ├── tax/              … 税務要約
│   ├── events/           … 会社イベント
│   └── artifacts/        … イベント添付索引
├── contracts/            … CTR-XXX
├── procurement/
│   ├── quotes/received/  … 受領見積
│   ├── quotes/sent/      … RFQ 送付
│   └── orders/           … 発注書
├── sales/quotes/         … 提出見積
├── finance/accounting/
│   ├── invoices/issued|received/
│   ├── quotes/           … 経理索引（任意）
│   ├── templates/        … 領収書索引 CSV 等
│   └── records/          … 証憑索引（MD のみ · スキャンは tenant records/）
├── io/inbox/ · io/outbox/sent/
├── legal/
├── compliance/           … ISO · 個情（モジュール無しでも可）
├── executive/
├── exports/
└── reports/
    ├── agent-summaries/  … Zone C（コア Agent 要約）
    └── routing-queue/

data/                     … 台帳 YAML（契約 · 財務 · イベント）
records/                  … L2 スキャン正本（Git 非推跡推奨）
```

### Core に含めないもの

| 種別 | 理由 | 置き場 |
|------|------|--------|
| 物件別運用台帳 | rental / hospitality | Extension |
| VC 投資記録 | venture_capital | Extension |
| 医療機器 QMS | jp_medical_device | Extension |
| Wire / protocol | wire_console テナント | Platform（下記） |
| 出張手配 | travel_booking 有効時 | Extension |

---

## B. Extension（モジュール・業種固有）

**正本バインド:** `tenants/{id}/modules.yaml` の `docs_root` · `data_root` · `summary_dir`

モジュール有効化時:

```bash
orgos modules activate <id>
# または
orgos modules scaffold-docs
```

### 標準サブツリー（物件系: rental · hospitality）

`docs_root` が `docs/properties/PROP-*/operations/` のとき、追加:

```
operations/
├── templates/rental/       … 賃料・点検様式（rental）
├── templates/compliance/   … 保険・宿泊台帳（hospitality 等）
├── templates/...           … モジュール seed 参照
├── compliance/             … 長期修繕計画 · 管理組合規約の要約 MD
└── records/                … 記入済・PDF（gitignore 推奨）
```

### モジュール別デフォルト `docs_root`（modules.yaml 未指定時）

| module id | docs_root | data_root |
|-----------|-----------|-----------|
| venture_capital | `docs/venture-capital/` | `data/venture-capital/` |
| jp_medical_device | `docs/medical-device/` | `data/medical-device/` |
| travel_booking | `docs/operations/` | `data/operations/` |
| professional_services | — | `data/services/` |
| software_outsourcing | — | `data/software-outsourcing/` |

（一覧の実装正本: `src/lib/tenant-document-zones.ts` の `MODULE_DEFAULT_DOCS_ROOT`）

### `summary_dir`

モジュール Agent の要約のみ: `docs/reports/{summary_dir}`（Zone C · モジュール名前空間）

---

## C. Output（Agent 生成物）

| パス | 内容 |
|------|------|
| `docs/reports/agent-summaries/{agent}/` | コア Agent 要約 |
| `docs/reports/agent-summaries/{module}/` | モジュール `summary_dir` |
| `docs/reports/routing-queue/` | Work Order · Handoff |
| `docs/reports/dashboard/` | 経営ダッシュボード |

**会社の正本書類ではない** — 再生成可能な要約・キュー。

---

## D. Platform（任意 · Wire 等）

`wire_console: true` テナントのみ:

```
docs/protocol/
data/protocol/
```

通常の SaaS 会社では不要。Inter-org デモ・Southwood / AIAC の protocol 検証用。

---

## 運用フロー

```
1. orgos tenant init <id>           → Core data スケルトン
2. orgos tenant scaffold-docs       → Core docs フォルダ
3. modules.yaml でモジュール定義
4. orgos modules activate rental    → Extension フォルダ + seed
5. orgos modules check            → docs_root 実在確認
```

---

## 新モジュール追加時（開発者）

1. `steward/modules/{id}/module.manifest.yaml`
2. `MODULE_DEFAULT_DOCS_ROOT` / 物件サブツリー定義を `tenant-document-zones.ts` に追加
3. `seed/` に `docs/` 雛形（任意）
4. `modules activate` が Extension を展開

詳細: [module_contract.md](../modules/module_contract.md) §6

---

## 関連

- [company-document-layout.md](company-document-layout.md) — 書類種別マトリクス
- [inter-org-contract-workflow.md](inter-org-contract-workflow.md) — 組織間契約
- [folder_access_policy.md](folder_access_policy.md) — Agent 別 R/W
