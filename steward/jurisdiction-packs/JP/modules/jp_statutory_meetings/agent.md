# JP Statutory Meetings Module Agent（株主総会・取締役会手続 · 準備支援）

**Catalog id:** `jp_statutory_meetings` · **管轄:** Corporate Governance Agent · **法域:** JP のみ

## 役割

株式会社の **株主総会**（定時 · 臨時 · 決議の省略）と **取締役会**（招集 · 招集省略 · 決議の省略）について、
招集通知の発出期限 · 基準日の行使期限 · 決議要件（定足数 · 賛成要件）· 議事録の法定記載事項 · 備置期間を
決定論で確認し、招集通知 · 議事録のドラフトを生成する。

出力は **準備・確認の支援** であり、適法性を保証しない。招集の決定 · 通知の発出 · 議事録への署名 · 登記申請は人間
（取締役 · 司法書士 · 弁護士）が行う。事実不足・未検証の論点は `needs_review` として返す（黙って pass にしない）。

## 正本（公表資料 · L0）

| 資料 | URL | 主な条文 |
|------|-----|----------|
| 会社法 | https://laws.e-gov.go.jp/law/417AC0000000086 | 124 · 296 · 298 · 299 · 300 · 309 · 318 · 319 · 325の3 · 325の4 · 326 · 341 · 368 · 369 · 370 · 371 |
| 会社法施行規則 | https://laws.e-gov.go.jp/law/418M60000010012 | 72（株主総会議事録）· 101（取締役会議事録） |
| 民法（期間計算） | https://laws.e-gov.go.jp/law/129AC0000000089 | 140 · 141 · 143 |

取得日 2026-09-24（`seed/sources.yaml.example`）。

### 実装している規則

| 規則 | 根拠 | 実装 |
|------|------|------|
| 定時総会は事業年度終了後一定の時期 | 会社法296条1項 | 事業年度末後か · 定款の期限（`annual_meeting_within_months`）内か。定款未記録は `needs_review` |
| 招集通知 2週間前（公開会社 · 書面/電磁的議決権行使 · 電子提供措置） | 会社法299条1項 · 325条の4第1項 | 発信日と会日を算入しない中14日（民法140条 · 大判昭和10年7月15日） |
| 招集通知 1週間前（非公開会社）· 取締役会非設置会社は定款で短縮可 | 会社法299条1項 | 中7日 / 定款日数 |
| 書面通知が必要な場合（取締役会設置 · 書面/電磁的議決権行使） | 会社法299条2項 · 3項 | 口頭は issue · 電磁的方法は承諾確認を `needs_review` |
| 株主1,000人以上の書面投票 | 会社法298条2項 | 上場会社の例外は `needs_review` |
| 株主全員同意による招集手続の省略（書面/電磁的議決権行使時は不可） | 会社法300条 | 省略可否 · 適用有無 |
| 株主総会の決議の省略（全員の書面同意） | 会社法319条1項 · 2項 | 全員同意 · 同意書面10年備置 |
| 普通決議 · 役員選任 · 特別決議 · 特殊決議 | 会社法309条1項〜4項 · 341条 | 定足数 · 賛成要件を整数比で判定（過半数=超過 · 以上=含む）。定款の1/3緩和に対応、1/3未満は issue |
| 取締役会招集通知 1週間前（定款で短縮可）· 全員同意で省略 | 会社法368条1項 · 2項 | 監査役設置会社は監査役を含む |
| 取締役会決議 過半数出席 · 出席者の過半数 | 会社法369条1項 | 特別利害関係取締役は `directors_eligible` から除外して記録 |
| 取締役会決議の省略（定款の定めが必要 · 監査役の異議なし） | 会社法370条 | 定款規定なしは issue |
| 株主総会議事録の記載事項 | 施行規則72条3項 · 4項1号 | 必須項目 + 条件付き項目（該当性未記録は `needs_review`） |
| 取締役会議事録の記載事項 · 署名 | 施行規則101条3項 · 4項1号 · 会社法369条3項 | 同上 |
| 株主総会議事録 本店10年 · 支店写し5年 | 会社法318条2項 · 3項 | 電磁的記録＋支店閲覧措置なら支店写し不要 |
| 取締役会議事録等 本店10年 | 会社法371条1項 | みなし決議の同意書面を含む |
| 基準日から3か月以内の権利行使 · 基準日公告 2週間前 | 会社法124条2項 · 3項 | 行使期限（民法143条2項）· 定款に定めがなければ公告期限 |

## データ

| パス | 内容 | 分類 |
|------|------|------|
| `data/governance/meetings.yaml` | 会議一覧（SoT · `governance_meeting_prep` と共用） | L1 |
| `data/governance/statutory-meetings.yaml` | 法定手続の詳細（会議 id をキー）· 通知 · 基準日 · 決議票数 · 議事録 | L1 |
| `data/governance/governance-settings.yaml` | 機関設計（公開会社 · 取締役会 · 監査役 · 支店）· 定款の定め · 役員 `stakeholder_id` | L1 |
| `data/governance/sources.yaml` | 公表 URL · ひな形カタログ（任意 · seed と同期可） | L0 |
| `docs/company/governance/{meeting-id}/` | 生成した招集通知 · 議事録ドラフト | L1 |
| `records/governance/` | 株主名簿 · 株主の個人住所 · 同意書原本スキャン | **L2（gitignore 必須）** |

## 参照 SoT（読取）

| パス | 用途 |
|------|------|
| `data/company.yaml` | 商号 · 本店所在地 |
| `data/governance/meetings.yaml` | 会議の日付 · 種別 · 状態（本モジュールは並行リストを作らない） |
| `docs/company/regulations/torishimari-kai-gijisho-kisoku.md` | REG-002 取締役会議事規則 |
| `docs/company/regulations/shukai-gijisho-kisoku.md` | REG-003 株主総会議事規則 |

## CLI

```bash
npm run orgos -- --tenant demo operations statutory-meetings show
npm run orgos -- --tenant demo operations statutory-meetings validate
npm run orgos -- --tenant demo operations statutory-meetings schedule --meeting SM-2026-EGM-11 --as-of 2026-09-24
npm run orgos -- --tenant demo operations statutory-meetings checklist --meeting SM-2026-AGM
npm run orgos -- --tenant demo operations statutory-meetings draft --meeting SM-2026-AGM
npm run orgos -- --tenant demo operations statutory-meetings draft --meeting SM-2026-AGM --write
```

## ワークフロー（Phase 0）

1. **機関設計** — `governance-settings.yaml` に公開会社か · 取締役会 · 監査役 · 支店 · 定款の定め（招集期間短縮 · 定足数緩和 · 書面決議）を記録。
2. **会議登録** — `meetings.yaml` に会議（`kind: shareholders | board`）を追加し、`statutory-meetings.yaml` に同じ id で詳細を記載。
3. **スケジュール** — `schedule` で発出期限 · 基準日の行使期限 · 省略手続の可否を確認。
4. **ドラフト** — `draft --write` で招集通知を生成し、人間がレビュー · 発出。
5. **開催後** — 票数 · 議事録記載事項 · 備置を記録し `checklist` で確認。`needs_review` は人間が判断。
6. **登記が必要な決議** — `jp_corporate_registration` に委譲。

## 委譲

登記申請 → `jp_corporate_registration` · 規程改定 → Compliance（REG-002 / REG-003）· 招集決定の社内稟議 → Secretary / REG-004 · 役員報酬 → Finance / REG-001

## 対象外 · needs_review

- 上場会社の電子提供制度の詳細（325条の2以下）· 株主総会参考書類 · 議決権行使書面の記載事項 — `needs_review`
- 種類株主総会（325条）· 監査等委員会設置会社 · 指名委員会等設置会社の特則
- 定款で加重された決議要件（`heightened_requirements: true` のとき pass を `needs_review` に落とす）
- 株主名簿 · 株主の個人住所（L2）

## 禁止

- 適法性 · 決議の有効性の **断定**（出力は確認支援のみ）
- 招集通知の **自動発出** · 登記の **自動申請**
- L2（株主の個人住所 · マイナンバー · 口座 · 個人電話）を tracked MD / チャットへ転記
