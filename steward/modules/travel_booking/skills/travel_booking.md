# Skill: travel_booking（旅行手配 · 総務）

## 目的

業務出張・宿泊の **旅行サイト手配** を Operations Agent が browser MCP で代行する。ログイン → 検索 → 候補比較 → **決済直前で停止**。最終決済は **段（人間）**。

Caster 代替: 指定サイト（楽天トラベル · Booking.com · Trip.com）+ テナント正本アカウント。

## 入力

| データ | パス |
|--------|------|
| ポータル定義 | `data/operations/travel-portals.yaml`（gitignore · example からコピー） |
| 旅費規程 | `docs/company/regulations/`（**jurisdiction:** REG-008 · US: REG-US-008 · `resolveCorporateCoreReg("travel")`） |
| 出張者 | `data/company.yaml`（代表取締役等） |

### 依頼パラメータ（チャット or draft ヘッダ）

| 項目 | 例 |
|------|-----|
| `portal_id` | `rakuten-travel` · `booking-com` · `trip-com` |
| `trip_type` | `hotel` · `flight` · `shinkansen` · `package` |
| `destination` | 大阪 |
| `check_in` / `check_out` | `2026-06-15` / `2026-06-16` |
| `guests` | `1` |
| `budget_max` | 15000（円/泊 · REG-008 代表上限と照合） |

## 出力

| 種別 | パス |
|------|------|
| 手配ドラフト | `docs/operations/travel-drafts/YYYY-MM-DD-{slug}.md`（gitignore） |
| テンプレ | [travel-draft-template.md](../../tenants/mal/docs/operations/travel-draft-template.md) |
| 要約 | `docs/reports/agent-summaries/operations/YYYY-MM-DD-travel-{slug}.md` |

## 使用 Agent

| Agent | 役割 |
|-------|------|
| **Operations**（主） | ブラウザ手配 · 規程チェック · draft 作成 |
| **Secretary**（連携） | 決済後 `calendar.yaml` に `type: travel` 登録 · `push` |
| Finance | 精算・出張報告書（事後） |

## 旅費規程チェック（jurisdiction · 手配前）

規程 ID は tenant jurisdiction により **REG-008（JP）** / **REG-US-008（US）** 等。CLI `checkReg008Compliance` は数値上限のみ（JP 15,000円/泊 代表）。

| 項目 | 代表取締役（JP 目安） |
|------|-----------|
| 宿泊上限（1泊税込） | **15,000円** — 超過候補は `要承認` フラグ |
| タクシー（参考） | 15,000円/回 |
| 航空機 | **事前合意** — 未合意なら候補に載せず段へ確認 |
| 出張定義 | 宿泊伴う / 片道50km以上日帰り / 稟議認定 |

## ヒアリング（Step 0 · ブラウザ前 · 必須）

**秘書的動き:** 依頼が曖昧なまま検索・予約画面へ進まない。不足があれば **1 回のメッセージでまとめて確認** し、回答後に browser を開く。

### 必須（未確定なら停止）

| 項目 | 確認内容 | 曖昧例 → 聞き方 |
|------|---------|----------------|
| `check_in` | チェックイン **日付**（時刻はホテル規定で可） | 「来週」→「何日（火）チェックインですか？」 |
| `check_out` | チェックアウト **日付**、または **泊数** | 泊数のみなら Agent が checkout を算出して **確認** |
| `nights` | 何泊か（日付と相互チェック） | 「1泊で合っていますか？」 |
| `destination_area` | 大阪 **のどこ** — 駅・エリア・会場名 | 「大阪」だけ →「新大阪 / 梅田 / 難波 / 会場名の近く、どれが近いですか？」 |
| `guests` | 宿泊人数 | 未指定 → 出張者 1 名でよいか確認 |
| `portal_id` | 指定サイト（未指定なら候補提示） | 「楽天トラベルでよいですか？」 |

### 推奨（未指定なら規程 or デフォルトを **提示して確認**）

| 項目 | デフォルト | 聞き方 |
|------|-----------|--------|
| `budget_max` | REG-008 宿泊上限（代表 15,000円/泊） | 「上限 15,000円/泊以内で探してよいですか？」 |
| `trip_purpose` | 業務出張（1 行） | draft 用 · 省略可 |
| `room_preference` | 禁煙 · シングル | 「禁煙シングルで問題ないですか？」 |
| `payment` | 現地払い可プラン優先（段の好み） | 事前決済限定プランは **明示して** 選ばせる |

### カレンダー照合（任意 · Secretary 連携）

`calendar.yaml` またはチャット文脈に出張予定があれば、ヒアリング前に **候補日を提示** して確認する（例:「カレンダー上 6/23 大阪打合せがあります。宿泊は 6/23 チェックインで合っていますか？」）。

### 進行条件

- **必須 6 項目が確定** → Step 1（browser）へ
- 「来週」「大阪出張」だけ → **browser_navigate 禁止** · 上表を質問
- 段が「おまかせ」と **明示** した項目のみ Agent 判断可（draft に根拠を 1 行記載）

## ブラウザ MCP ワークフロー（共通）

0. **ヒアリング** — [Step 0](#ヒアリングstep-0--ブラウザ前--必須) 完了を確認
1. **準備** — `travel-portals.yaml` で `portal_id` の URL を確認 · Privacy Mode ON 推奨
2. **browser_navigate** — ポータル URL
3. **browser_lock** → 操作 → **browser_unlock**
4. **ログイン**
   - パスワードは **YAML に書かない** · 段がブラウザで入力、またはセッション継続
   - 2FA / CAPTCHA → **即停止** · 段に引き継ぎ
5. **検索** — 日程 · 人数 · 目的地を入力
6. **候補 3 件** — 料金 · キャンセル条件 · REG-008 適合を draft に表形式で記載
7. **カート / 予約確認画面まで** — 決済情報入力画面の **直前** で停止
8. **browser_take_screenshot** + **browser_snapshot** — draft に参照（L2 値は転記しない）
9. **段へ relay** — 「候補 N · 決済画面まで到達 · ご確認後に決済ボタンを押してください」

### 停止条件（必須 · 違反禁止）

- **決済・購入・予約確定ボタンを押さない**
- カード番号 · CVV · ワンタイムパスワードを **チャット・tracked MD に書かない**
- ログイン失敗を同一セッションで **3 回以上** リトライしない

## 楽天トラベル dry-run 手順（Phase 0 検証）

**前提:** `cp data/operations/travel-portals.yaml.example data/operations/travel-portals.yaml` · `login_id` 実値のみ（パスワードはセッション入力）

| Step | 操作 |
|:----:|------|
| 0 | **ヒアリング** — 日程 · 泊数 · エリア/駅 · 人数 · 予算 · ポータルを確定 |
| 1 | `browser_navigate` → `https://travel.rakuten.co.jp/` |
| 2 | `browser_lock` |
| 3 | ログインリンク → **段が ID/PW 入力**（Agent は待機） |
| 4 | 宿泊タブ · 目的地（例: 大阪）· チェックイン/アウト · 人数 1 |
| 5 | 検索 → 結果一覧から **REG-008 上限内** を 3 件ピックアップ |
| 6 | 1 件を選択 → 部屋タイプ → 予約内容確認画面まで（**お支払い・予約するの直前**） |
| 7 | screenshot · draft MD 生成 · `browser_unlock` |
| 8 | 段へ: 候補表 + 「楽天 · 決済直前まで完了 · 承認後に決済」 |

**dry-run フラグ:** draft 先頭に `status: dry-run` · 実予約なしを明記。

## Booking.com / Trip.com

| portal_id | URL（example 参照） | 備考 |
|-----------|---------------------|------|
| `booking-com` | https://www.booking.com/ | 英語 UI 多い · 円表示を確認 |
| `trip-com` | https://jp.trip.com/ | 航空+ホテルパッケージ可 |

手順は楽天と同型。ログイン URL が異なる場合は `travel-portals.yaml` の `login_url` を使用。

## 決済後（Secretary 連携）

段が決済完了を伝えたら:

```bash
npm run orgos -- executive calendar conflicts
# calendar.yaml に type: travel · status: confirmed を追加
npm run orgos -- executive calendar push   # .env 設定済み時
```

`schedule_management`: `travel` イベントは前後 30 分バッファ推奨。

## CLI

Phase 0 browser 手順は **cursor-only**。Phase 1 CLI（`travel_booking` モジュール）:

```bash
# Step 0 — 必須項目が揃うまで exit 1（browser 禁止）
npm run orgos -- operations travel intake \
  --portal rakuten-travel --destination 大阪 --area 新大阪駅周辺 \
  --check-in 2026-06-23 --check-out 2026-06-24 --guests 1

# REG-008 上限チェック
npm run orgos -- operations travel check --budget 12000

# ドラフト骨格（候補表は browser 後に追記 · --write で gitignore 保存）
npm run orgos -- operations travel draft ... --write

npm run orgos -- operations travel portals
```

YAML 一括: `--file data/operations/travel-request.yaml`（[seed](../../steward/modules/travel_booking/seed/travel-request.yaml.example) 参照）

## 禁止

- 決済実行 · カード情報の出力（L3）
- `data/finance/**` の改変
- 私用旅行の業務出張偽装（REG-008 第10条）
- 規程上限超過を承認なしで「推奨」として提示しない

## 関連

- [operations_agent.md](../core/agents/operations_agent.md)
- [ryohi-kisoku.md](../../tenants/mal/docs/company/regulations/ryohi-kisoku.md)
- [travel-draft-template.md](../../tenants/mal/docs/operations/travel-draft-template.md)
