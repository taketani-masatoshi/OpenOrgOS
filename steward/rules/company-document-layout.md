# 会社書類フォルダ構成（ガイドレール）

**版:** 1.1 · **日付:** 2026-07-09  
**正本:** 本書 · **ゾーン切り分け:** [tenant-document-zones.md](tenant-document-zones.md)（**Core / Extension / Output**）

テナント `docs/` 以下に、契約・見積・規程・法人書類を**迷わず格納できる**標準レイアウト。

> **Zone A（Core）** のみ本書のツリー。**Zone B（Extension）** は `modules.yaml` 有効化時に `orgos modules scaffold-docs` で追加。

---

## 1. 原則

| 原則 | 説明 |
|------|------|
| **MD が索引・要約** | Git 追跡するのは L0〜L1 の MD / CSV。PDF スキャンは `records/`（非追跡） |
| **YAML が台帳** | 契約 ID・イベント・稟議は `data/` が正本 |
| **種別でフォルダ分け** | 見積・契約・規程を混在させない |
| **受領と起票を分離** | 外部受領 → `docs/io/inbox/`。自社起票 → 各ドメインフォルダ |
| **組織間契約** | P2 まで起票側のみ `docs/contracts/`（[inter-org-contract-workflow.md](inter-org-contract-workflow.md)） |

---

## 2. ツリー（標準）

```
tenants/{id}/
├── docs/
│   ├── 00-このフォルダについて.md     … テナント索引（必須）
│   │
│   ├── company/                       … 法人・コーポレート
│   │   ├── regulations/               … 社内規程（REG-* 施行文）
│   │   ├── governance/                … 株主総会・取締役会議事録
│   │   ├── hr/                        … 人事（雇用・就業規則テンプレ）
│   │   ├── licenses/                  … 許認可・登記・定款写し索引
│   │   ├── tax/                       … 税務申告・法人税要約
│   │   ├── events/                    … 会社イベント MD（orgos events）
│   │   └── artifacts/                 … イベント添付の索引
│   │
│   ├── contracts/                     … 契約書本文（CTR-XXX/01-draft.md 等）
│   │
│   ├── procurement/                   … 調達（発注側）
│   │   ├── quotes/
│   │   │   ├── received/              … 受領した見積書
│   │   │   └── sent/                  … 依頼・RFQ 送付記録
│   │   └── orders/                    … 発注書・PO
│   │
│   ├── sales/                         … 営業（受注側）
│   │   └── quotes/                    … 提出した見積書
│   │
│   ├── finance/
│   │   └── accounting/
│   │       ├── invoices/
│   │       │   ├── issued/            … 自社発行請求書
│   │       │   └── received/          … 受領請求書
│   │       ├── quotes/                … 経理保管用見積索引（任意）
│   │       ├── templates/             … 台帳 CSV テンプレ
│   │       └── records/               … スキャン原本（.gitignore 推奨）
│   │
│   ├── io/                            … 受発信トレイ（未分類の外部書類）
│   │   ├── inbox/                     … 受領（契約ドラフト・メール添付）
│   │   └── outbox/
│   │       └── sent/                  … 送付控え
│   │
│   ├── legal/                         … 法務メモ・リーガルチェック
│   ├── compliance/                    … ISO・プライバシー
│   ├── executive/                     … 秘書・役員スケジュール
│   ├── exports/                       … steward sync CSV
│   └── reports/                       … CLI / Agent 生成物
│
├── data/
│   ├── contracts/CTR-*.yaml           … 契約台帳
│   ├── company-events.yaml            … イベント台帳
│   └── document-io.yaml               … inbox/outbox 索引（任意）
│
└── records/                           … L2 スキャン正本（テナント .gitignore）
```

---

## 3. 書類種別 → 格納先

| 書類 | 格納先 | 命名例 | 担当 Agent |
|------|--------|--------|------------|
| **契約書（自社起票）** | `docs/contracts/CTR-XXX/` | `01-draft.md` · `02-executed.md` | Contract · Legal |
| **契約書（相手送付・受領）** | `docs/io/inbox/CTR-XXX/` | `v0.1-2026-07-09.pdf` | Operations → Contract |
| **見積書（ベンダーから受領）** | `docs/procurement/quotes/received/{vendor}/` | `QUO-20260709-vendor.md` | Procurement |
| **見積書（自社が提出）** | `docs/sales/quotes/{client}/` | `QUO-20260709-client.md` | Sales · Procurement |
| **発注書** | `docs/procurement/orders/` | `PO-20260709-001.md` | Procurement |
| **請求書（発行）** | `docs/finance/accounting/invoices/issued/` | `INV-202607-001.md` | Finance |
| **請求書（受領）** | `docs/finance/accounting/invoices/received/` | ベンダー名/月 | Finance |
| **社内規程** | `docs/company/regulations/` | `ringi-kessai-kisoku.md` | Compliance |
| **議事録** | `docs/company/governance/{YYYY}/` | `torishimari-2026-07.md` | Secretary · Compliance |
| **許認可・登記** | `docs/company/licenses/` | サブフォルダ別 | Compliance |
| **税務** | `docs/company/tax/fy{YYYY}/` | 申告要約 MD | Finance |
| **会社イベント** | `docs/company/events/{YYYY-MM}/` | `EVT-*.md` | orgos events |
| **PDF スキャン（領収書等）** | `records/receipts/{年}/` | 任意 | Operations · Finance |
| **領収書索引** | `docs/finance/accounting/templates/領収書索引.csv` | — | Finance |
| **長期修繕計画** | `docs/properties/PROP-*/operations/compliance/` | 要約 MD | Rental（**Zone B**） |

---

## 4. 見積書の使い分け

| 立場 | フォルダ | 備考 |
|------|----------|------|
| **発注したい（相手の見積をもらう）** | `procurement/quotes/received/` | 稟議・契約の根拠資料 |
| **受注したい（自社見積を出す）** | `sales/quotes/` | 提出版・改訂版を版管理 |
| **経理が保管** | `finance/accounting/quotes/` | 会計処理済み見積の索引（任意） |

---

## 5. 新規テナントの初期化

```bash
# Zone A — 全テナント共通
orgos tenant scaffold-docs --core-only

# Zone B — modules.yaml で enabled のモジュールのみ
orgos modules scaffold-docs

# 両方
orgos tenant scaffold-docs
```

---

## 6. 関連

- [tenant-document-zones.md](tenant-document-zones.md) — **Core / Extension 切り分け**
- [repository_layout.md](repository_layout.md)
- [folder_access_policy.md](folder_access_policy.md)
- [inter-org-contract-workflow.md](inter-org-contract-workflow.md)
