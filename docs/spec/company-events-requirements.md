# 会社イベント記録 — 要件定義書

**版:** 1.3 · **日付:** 2026-06-27  
**ステータス:** 実装済み（v1 · 作成・一覧・月次フォルダ · close/archive/validate · FR-11/14）  
**設計正本:** [steward/rules/company-events-layout.md](../../steward/rules/company-events-layout.md)  
**スキーマ:** [schemas/company-events.ts](../../schemas/company-events.ts)  
**実装:** [src/lib/company-events.ts](../../src/lib/company-events.ts) · [src/commands/company-events.ts](../../src/commands/company-events.ts)

---

## 1. 背景・目的

会社における重要イベント（登記・決議・契約・許認可等）について、**経緯（narrative）** と **出力書類（artifacts）** を分離保管し、AI · 人間 · CLI が同一命名規則で参照できるようにする。

| 課題 | 本機能での解決 |
|------|----------------|
| 書類 MD と経緯が混在 | `docs/company/events/` と `docs/company/artifacts/` の二層分離 |
| 時系列検索が困難 | `YYYY-MM` 月次フォルダ + `data/company-events.yaml` 台帳 |
| AI が参照先を誤る | `.cursor/rules/company-events.mdc` + EVT 命名規則 |

---

## 2. スコープ

### 2.1 In scope（v1 実装済み）

| ID | 機能 |
|----|------|
| FR-01 | 月次フォルダ自動生成（events · artifacts） |
| FR-02 | イベント新規作成（台帳 + MD + artifact 索引 + records/） |
| FR-03 | イベント一覧・台帳サマリ |
| FR-04 | 命名規則（EVT ID · kind · slug） |
| FR-05 | 当月 `_INDEX.md` 自動更新（close/archive · `--refresh-index`） |
| FR-06 | テナント雛形 · Cursor ルール · repository_layout 連携 |
| FR-10 | イベント close / archive（`events close` · `events archive`） |
| FR-11 | 書類索引へのファイル登録（`events register-artifact`） |
| FR-12 | `events validate` — 台帳 vs 実ファイル整合 |
| FR-13 | `jp_corporate_registration prepare` → artifacts（`--event-id` + `--write`） |
| FR-14 | document-io outbox リンク（`events link-outbox`） |

### 2.2 Out of scope（将来）

| ID | 機能 | 備考 |
|----|------|------|
| FR-15 | outbox 自動イベント作成 | 手動 `events new` + link-outbox |

---

## 3. 利用者・利用シーン

| 利用者 | 利用シーン |
|--------|-----------|
| 秘書 / オペレータ | CLI でイベント作成 · 月フォルダ準備 |
| 担当 Agent | `@docs/company/events/` で経緯参照 · artifacts で書類参照 |
| 監査 · コンプライアンス | 台帳 YAML + Git 追跡 MD で時系列確認 |

---

## 4. 機能要件

### FR-01 月次フォルダ生成

**コマンド:** `steward events ensure-month [--month YYYY-MM]`

| 項目 | 要件 |
|------|------|
| 入力 | `--month` 省略時は当日の `YYYY-MM` |
| 出力 | `docs/company/events/{YYYY-MM}/` · `docs/company/artifacts/{YYYY-MM}/` |
| 副作用 | `events/{YYYY-MM}/_INDEX.md` が無ければ空テンプレ作成 |
| 台帳 | `data/company-events.yaml` が無ければ `{ schema_version: 1, events: [] }` 初期化 |

**受入基準**

- [x] 両ディレクトリが存在する
- [x] `_INDEX.md` が作成される
- [ ] 既存 `_INDEX.md` がある場合の再生成（現状: 上書きしない）

---

### FR-02 イベント新規作成

**コマンド:** `steward events new --kind <kind> --title "<title>" [--date YYYY-MM-DD] [--slug slug] [--related k:v,...] [--notes]`

| 項目 | 要件 |
|------|------|
| ID | `EVT-{YYYYMMDD}-{kind}-{slug}` |
| kind | `governance` · `registration` · `contract` · `finance` · `compliance` · `meeting` · `personnel` · `misc` |
| slug | `a-z0-9-` · 3〜32 文字 · 省略時は title から生成（日本語のみ時は kind フォールバック） |
| 作成物 | ① `event_path` MD ② `artifact_dir/00-artifact-index.md` ③ `artifact_dir/records/` ④ 台帳エントリ ⑤ `_INDEX.md` 更新 |

**イベント MD 必須構造**

- 先頭 YAML: `event_id` · `occurred_at` · `kind` · `status` · `artifact_dir`
- 本文: 概要 · 経緯 · 関連 ID · 出力書類（リンクのみ · 書類全文禁止）

**受入基準**

- [x] events MD と artifacts が別パス
- [x] 台帳にパスが記録される
- [x] 同一 ID 再作成は拒否

---

### FR-03 一覧・サマリ

| コマンド | 要件 |
|---------|------|
| `events list [--month] [--status] [--json]` | 台帳からフィルタ · 日付降順 |
| `events status` | 総件数 · open 件数 |

---

### FR-04 データ正本

| 正本 | パス | 内容 |
|------|------|------|
| 台帳 | `data/company-events.yaml` | 全イベントメタデータ |
| 経緯 | `docs/company/events/{YYYY-MM}/EVT-*.md` | narrative |
| 書類 | `docs/company/artifacts/{YYYY-MM}/{event-id}/` | MD + `records/` |

---

### FR-05 非機能要件

| ID | 要件 | 実装 |
|----|------|------|
| NFR-01 | L2 PDF は `records/` · gitignore | 既存 `.gitignore` `**/records/**` |
| NFR-02 | イベント MD は L1 以下（口座等禁止） | テンプレ + data-classification ルール |
| NFR-03 | テナント分離 `--tenant` | Steward 標準 tenant コンテキスト |
| NFR-04 | スキーマバージョン `schema_version: 1` | Zod strict |

---

## 5. インターフェース

### 5.1 CLI

```bash
npm run steward -- events ensure-month [--month 2026-06]
npm run steward -- events new --kind registration --title "商号変更登記準備"
npm run steward -- events list [--month 2026-06] [--status open] [--json]
npm run steward -- events status
```

### 5.2 ライブラリ API（主要）

| 関数 | 用途 |
|------|------|
| `ensureCompanyEventMonth(month?)` | 月次フォルダ |
| `createCompanyEvent(opts)` | イベント作成 |
| `listCompanyEvents(filter?)` | 一覧 |
| `loadCompanyEvents()` / `saveCompanyEvents()` | 台帳 CRUD |
| `buildEventId()` / `parseMonth()` | 命名・検証 |

---

## 6. 正常系・異常系 — 実装・テスト状況

**テスト正本:** [tests/company-events.test.ts](../../tests/company-events.test.ts) · [tests/company-events-abnormal.test.ts](../../tests/company-events-abnormal.test.ts)

### 6.1 正常系

| # | シナリオ | 実装 | 自動テスト |
|---|---------|:----:|:----------:|
| N-01 | 空台帳の読込・スキーマ検証 | ✓ | ✓ `validates empty registry` |
| N-02 | `ensure-month` で events/artifacts + `_INDEX` 作成 | ✓ | ✓ `ensure-month creates...` |
| N-03 | `events new` 相当 — イベント MD · artifact 索引 · records/ · 台帳 | ✓ | ✓ `creates event record separated...` |
| N-04 | events と artifacts の内容分離（書類全文なし） | ✓ | ✓ 同上（定款文字列不在） |
| N-05 | `--related` 相当の related ID 記録 | ✓ | ✓ `registration_case_id` |
| N-06 | 当月 `_INDEX.md` 更新 | ✓ | △ 間接（create 経由のみ） |
| N-07 | 日本語 title の slug フォールバック | ✓ | ✓ `auto slug falls back to kind` |
| N-08 | `events list` 月次フィルタ | ✓ | ✓ 同上 |
| N-09 | CLI `events status` 出力 | ✓ | — CLI 未テスト |
| N-10 | テンプレ tenant 雛形 | ✓ | — 手動 |

### 6.2 異常系

| # | シナリオ | 実装 | 自動テスト |
|---|---------|:----:|:----------:|
| E-01 | 不正 `YYYY-MM` | ✓ `parseMonth` throw | ✓ `company-events-abnormal` |
| E-02 | 不正 `--kind` | ✓ CLI throw | ✓ `company-events-abnormal` |
| E-03 | 不正 slug（短い · 非法文字） | ✓ `buildEventId` throw | ✓ `company-events-abnormal` |
| E-04 | 重複イベント ID | ✓ throw | ✓ `company-events-abnormal` |
| E-05 | 台帳 YAML 破損 | ✓ Zod parse error | ✓ `company-events-abnormal` |
| E-06 | 存在しない月への list | ✓ 空配列 | ✓ `company-events-abnormal` |
| E-07 | `closed` / `archived` への遷移 | ✓ | ✓ `company-events-lifecycle` · `abnormal` |
| E-08 | event MD 欠落と台帳不整合 | ✓ `validateCompanyEvents` | ✓ `company-events-lifecycle` · `abnormal` |

### 6.3 テストカバレッジ評価

| 区分 | 件数 | 評価 |
|------|:----:|------|
| 正常系（lib） | 4 tests | **コア路径はカバー** |
| 異常系 | 8 tests | **E-01〜E-08 カバー** |
| lifecycle | 3 tests | close · archive · validate |
| CLI 結合 | 4 tests | `company-events-cli` — close · validate · register-artifact · _INDEX |
| E2E（登記 module 連携） | 1 | FR-13 `--event-id` テスト済 |

---

## 7. 依存関係

| 依存 | 関係 |
|------|------|
| REG-007 文書管理 | events/artifacts は docs ゾーン |
| document-io | 独立（inbox/outbox は物理トレイ） |
| OpenOrgOS protocol | 独立（組織間 wire とは別） |
| jp_corporate_registration | 将来 artifacts 出力先として統合予定 |

---

## 8. 改定履歴

| 版 | 日付 | 内容 |
|----|------|------|
| 1.0 | 2026-06-27 | 初版 — v1 実装ベース · テスト状況付記 |
| 1.1 | 2026-06-27 | 異常系 E-01〜E-06 テスト · `parseMonth` 月範囲検証 |
| 1.2 | 2026-06-27 | FR-10/12/13 — close · archive · validate · jp prepare `--event-id` |
| 1.3 | 2026-06-27 | FR-11/14 — register-artifact · link-outbox · ensure-month --refresh-index · CLI smoke |
