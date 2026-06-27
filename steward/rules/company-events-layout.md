# 会社イベント記録 — フォルダ構成・命名規則（正本）

**版:** 2026-06-26 · **適用:** 全テナント · Cursor · Agent · CLI

---

## 1. 二層分離（必須）

| 層 | パス | 内容 | Git |
|----|------|------|:---:|
| **イベント記録** | `docs/company/events/{YYYY-MM}/` | 経緯 · 決議 · タイムライン · 関連 ID（**事実の narrative**） | ○ |
| **出力書類** | `docs/company/artifacts/{YYYY-MM}/{event-id}/` | 登記ドラフト · 議事録 MD · 提出用ひな形 | ○（MD） |
| **提出 PDF 等** | `…/artifacts/…/records/` | 印鑑証明 · スキャン · 登録ねっと出力 PDF | × gitignore |

**禁止:** イベント MD に書類全文を転記しない。書類は `artifacts/` のみ。イベント MD は `artifact_dir` リンクで参照。

**既存 I/O との関係**

| 既存 | 用途 | 本構成との違い |
|------|------|----------------|
| `docs/io/inbox/` | 未処理スキャン受信 | 処理前の物理受信 |
| `docs/io/outbox/` | 印刷・提出 PDF キュー | 単発出力の物理トレイ |
| `docs/company/events/` | 会社イベントの **記録** | 時系列 narrative + 台帳リンク |
| `docs/company/artifacts/` | イベントに紐づく **書類パック** | 生成 MD · 索引 |

---

## 2. 月次フォルダ（自動生成）

```
docs/company/
├── events/
│   ├── 00-このフォルダについて.md
│   └── {YYYY-MM}/                    # 例: 2026-06
│       ├── _INDEX.md                 # 当月イベント一覧（CLI 自動更新）
│       ├── EVT-20260626-registration-mal-shogo.md
│       └── EVT-20260701-governance-shukai.md
└── artifacts/
    ├── 00-このフォルダについて.md
    └── {YYYY-MM}/
        └── EVT-20260626-registration-mal-shogo/
            ├── 00-artifact-index.md  # 書類一覧（CLI/モジュール生成）
            ├── teikan-kk.md
            └── records/              # PDF · L2（gitignore）
```

**正本台帳:** `data/company-events.yaml` — event id · paths · related IDs

```bash
npm run steward -- events ensure-month              # 今月
npm run steward -- events ensure-month --month 2026-07
npm run steward -- events new --kind registration --title "商号変更登記準備"
npm run steward -- events list --month 2026-06
```

---

## 3. イベント ID 命名規則

```
EVT-{YYYYMMDD}-{kind}-{slug}
```

| 部分 | 規則 | 例 |
|------|------|-----|
| プレフィックス | 固定 `EVT-` | `EVT-` |
| 日付 | イベント発生日 `YYYYMMDD` | `20260626` |
| kind | 下表の英語小文字 | `registration` |
| slug | `a-z0-9` と `-` のみ · 3〜32 文字 · 先頭/末尾 `-` 禁止 | `mal-shogo-change` |

### kind 一覧

| kind | 用途 |
|------|------|
| `governance` | 株主総会 · 取締役会 · 決議 |
| `registration` | 法務局登記 · 定款 · 登記申請 |
| `contract` | 契約締結 · 改定 · 解約 |
| `finance` | 決算 · 税務 · 資金 |
| `compliance` | 許認可 · ISO · 届出 |
| `meeting` | 社内打合せ · 社外折衝（議事録レベル） |
| `personnel` | 人事 · 就業 |
| `misc` | 上記以外 |

**slug 自動生成:** `--title` のみ指定時、ローマ字/英数字化して kebab-case（日本語タイトルは `--slug` 明示推奨）。

---

## 4. ファイル命名（artifacts 内）

| 種別 | 規則 | 例 |
|------|------|-----|
| 索引 | 固定 `00-artifact-index.md` | — |
| 生成 MD | `{書類種別}-kebab.md` | `teikan-kk.md` · `touki-shinseisho.md` |
| 複数同一種 | `{種別}-{連番または氏名}.md` | `shussho-dojisho-yamada.md` |
| PDF/scan | `records/{YYYYMMDD}-{label}.pdf` | `records/20260626-inkan-shomei.pdf` |

---

## 5. イベント MD テンプレ（先頭 YAML）

```yaml
---
event_id: EVT-20260626-registration-mal-shogo
occurred_at: 2026-06-26
kind: registration
status: open
artifact_dir: docs/company/artifacts/2026-06/EVT-20260626-registration-mal-shogo/
related:
  registration_case_id: CHG-2026-001
---
```

必須セクション: **概要** · **経緯** · **関連 ID** · **出力書類**（artifact_dir へのリンクのみ）

---

## 6. AI 参照ルール

1. 会社イベントの narrative → `@docs/company/events/{YYYY-MM}/EVT-*.md`
2. 登記・議事録の **書類本文** → `@docs/company/artifacts/{YYYY-MM}/{event-id}/`
3. 台帳・検索 → `data/company-events.yaml`
4. L2 PDF → `@…/records/` は Privacy Mode · チャット出力禁止
5. 新規イベント作成前 → `events ensure-month` · `events new`
6. モジュール生成物（例: `operations corporate prepare`）は **artifacts** に出力し、events にリンクを追記

---

## 7. 関連

- [folder_access_policy.md](folder_access_policy.md)
- [repository_layout.md](repository_layout.md)
- REG-007 文書管理規程 — テナント `docs/company/regulations/bunsho-kanri-kisoku.md`
