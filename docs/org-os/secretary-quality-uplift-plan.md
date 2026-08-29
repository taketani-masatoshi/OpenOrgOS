# 秘書品質引き上げ計画（日程調整まわりの硬化）

**日付:** 2026-07-12  
**対象:** mal 実環境 E2E（`SCH-2026-009` closed）後の品質硬化  
**非対象:** 外部店舗予約の実行本体（**Venue Booking Agent** · Secretary は依頼・結果連携のみ）  
**実装ステータス (2026-07-14):** P0–P7 · Phase A/C 完了 · 対面 rehearsal 緑 · **suggest プリフィル (B)** · quality note observation/correction  
**ライブ計測 `SCH-2026-021`:** **closed**（当時文面は現行 lint FAIL · 再送不可）  
**ライブ lint 証明 `SCH-2026-022`:** **closed** · clarify/proposal/confirm 実 SMTP · `style_lint_pass_count=3` · warnings=0 · VR 当時 `HP-PROOF-…`（**現行ゲートでは measurement · 再発不可**）  
**追記:** 会食・祝いは夕方スロット · `party-locations` + `venue suggest/apply-suggest` · L2 自宅は records · cost_estimate 必須 · LIVE-MEASURE/**HP-PROOF/REH-/PROOF-** 送信/VR 拒否 · `quality proof` で partner/accept/venue_ref を正本化  
**テスト:** `secretary-quality-uplift` · `scheduling-rehearsal-cli` · `venue-suggest-party-locations` · `venue-booking` · mail-path auto-process

---

## 0. ユーザー確定事項（2026-07-13）

| 論点 | 決定 |
|------|------|
| **Clarify タイミング** | **(a) 候補日提示の前** — 趣旨 + 会場3案のみ（日時なし） |
| **会場案粒度** | 店名 + 事実で十分。**アレルギーは相手 DB 正本**（clarify/提案/確定文に含めない） |
| **Venue Booking** | **(b) 予約番号まで SoT** · 確定メールに `external_ref` 反映（本番相当）· **Hotpepper 優先** |
| **Calendar OAuth** | **(a) 今は不要** — ローカル `calendar_sync: synced` のみ。GCP OAuth は当方が Cloud Console で設定 |
| **KPI 分離** | 「言い回し指摘」= **Secretary `quality_signals`**。VR 完了率 = **Venue Booking**（`venue-reservations.yaml`）|

---

## 1. ゴール

| ゴール | 達成イメージ |
|--------|----------------|
| 指摘なしでも社外文が 1 級相当 | 文頭・名乗り・貴社/弊社・禁句がテンプレ＋lint で担保 |
| 誤案件起票が減る | thread / Message-ID / 相手メールで本案件へ自動紐付け |
| 文化差に耐える | 受信者 locale で文体パックを切替（JP≠US≠DE） |
| 秘書は「判断・先読み・連携」 | 執筆はスタイル正本、予約は専門 Agent、送信は Mail Outbound |

---

## 2. スコープ切り分け（エージェント）

```
CEO
  └─ Secretary（指揮・先読み・CEO ゲート・専門 Agent への依頼）
        ├─ Mail Intake（受信・分類）
        ├─ Mail Outbound（承認ゲート送信）
        ├─ schedule_coordination（案件 SoT · CLI）
        ├─ Venue Booking Agent（将来 · 外部予約サイト/API）← 今回は stub のみ
        └─ Correspondence Style（正本ドキュメント · lint · テンプレ）
```

| Agent / 層 | やる | やらない |
|------------|------|----------|
| **Secretary** | 趣旨確認、3案提案、CEO 質問、専門 Agent へ handoff | 店舗サイトの自動予約操作 |
| **Venue Booking**（新設予定） | 空席確認・予約・確認番号の返却（人間承認付き） | 社外文案の最終品格責任 |
| **Mail Outbound** | 下書き保存・承認・SMTP | 案件判断・未確認事実の創作 |
| **Jurisdiction correspondence** | locale 別の文頭・禁句・テンプレ | テナント固有の口調上書き（tenant rules が優先可） |

---

## 3. 文書正本の配置（今回整備）

| パス | 役割 |
|------|------|
| [steward/core/correspondence/README.md](../../steward/core/correspondence/README.md) | 解決順・参照入口 |
| [steward/core/correspondence/style-contract.md](../../steward/core/correspondence/style-contract.md) | 全 locale が満たすべき契約 |
| [JP/correspondence/email-style-ja.md](../../steward/jurisdiction-packs/JP/correspondence/email-style-ja.md) | **秘書検定1級相当・日本語社外メール正本** |
| [JP/correspondence/style.yaml](../../steward/jurisdiction-packs/JP/correspondence/style.yaml) | 機械可読ルール（lint 用） |
| [JP/correspondence/templates/](../../steward/jurisdiction-packs/JP/correspondence/templates/) | 文頭・確定・趣旨説明の定型 |
| テナント `rules/secretary_behavior.md` | 会社固有上書き（MAL） |

**解決順（受信者優先）:**

1. `external-contacts` / peer の `correspondence_locale`（あれば）  
2. 相手国・言語ヒント  
3. 自テナント jurisdiction の default locale（mal → `ja-JP`）  
4. core fallback（中立・短文）

---

## 4. フェーズ計画

### P0 — 文案品格 ★完了

| ID | 作業 | DoD | 状態 |
|----|------|-----|------|
| P0-1 | JP `email-style-ja.md` + `style.yaml` + 定型テンプレ | Path 参照が Skill/Agent から辿れる | ✅ |
| P0-2 | `buildSchedulingDraftText` が style 合成（名乗り・宛名） | 禁句・代表連呼が出ない | ✅ |
| P0-3 | `correspondence style-lint` CLI + send/起案ゲート | 禁句・名乗り欠落を fail | ✅ |
| P0-4 | 確定メール必須項目テスト | `secretary-quality-uplift.test.ts` | ✅ |

### P1 — 受信紐付け硬化 ★完了

| ID | 作業 | DoD | 状態 |
|----|------|-----|------|
| P1-1 | In-Reply-To / References / Subject | 自宛・返信が safe intake 連発しない | ✅ |
| P1-2 | 既知 EXT + active SCH → link | 誤起票抑制 | ✅ |
| P1-3 | ops-poll 未処理 schedule 警告 | Today 1 行 | ✅ |

### P2 — 先読みゲートの機械化 ★完了

| ID | 作業 | DoD | 状態 |
|----|------|-----|------|
| P2-1 | `schedule_venue_pending`（CEO 3 案） | 「追って連絡」だけでは send 不可 | ✅ |
| P2-2 | 会食費用未記入 → **ERROR**（proposal/confirm）· clarify は WARN | send/起案ゲート | ✅ |
| P2-3 | Venue handoff カード | 実行は専門 Agent | ✅ |
| P2-4 | 送信パス必須 `style-lint`（抜け道なし） | 宛名・空行・署名2行·JA日時·アクセス | ✅ |

### P3 — 文化・locale モジュール ★完了（DE は将来）

| ID | 作業 | DoD | 状態 |
|----|------|-----|------|
| P3-1 | US（en-US）stub | `US/correspondence/` | ✅ |
| P3-2 | contact `correspondence_locale` | 受信者優先 | ✅ |
| P3-3 | クロスボーダー fixture | uplift テスト | ✅ |

### P4 — 運用摩擦（残）

| ID | 作業 | DoD | 状態 |
|----|------|-----|------|
| P4-1 | doctor: OP key mismatch のテスト汚染隔離 | lifecycle=test → tenants/.orgos · env より file 優先 | ✅ |
| P4-2 | Google Calendar / Meet OAuth | ローカル synced 維持 · 本番 OAuth は別トラック | 残（P8） |

### P5 — Clarify 配線（候補日前） ★完了

| ID | 作業 | DoD | 状態 |
|----|------|-----|------|
| P5-1 | `send_clarify` · `venue_options` schema | 対面 intake 後 CEO 3案 → clarify | ✅ |
| P5-2 | `buildSchedulingClarifyText` + **専用** pre-proposal テンプレ | 日時・アレルギー行なし（strip しない） | ✅ |
| P5-3 | `style-lint` `scheduling_clarify` | 会場案必須 · 日時混入 error | ✅ |
| P5-4 | clarify 送信後 → `propose_slots` / `send_proposal` | lifecycle 分岐 | ✅ |
| P5-5 | `advanceSchedulingWorkflow` が clarify 下書き自動起票 | ops-poll 経路 | ✅ |
| P5-6 | CEO mid-gate に `schedule_venue_clarify` | 会場3案質問 | ✅ |
| P5-7 | clarify 送信後 **自動 propose**（`proposeSlotsOntoSchedulingCase`） | B1 修正 | ✅ |
| P5-8 | Today: VR待ち · 未送信 draft も表示 | O1/O2 | ✅ |

### P6 — Secretary KPI（Venue と分離） ★完了

| ID | 作業 | DoD | 状態 |
|----|------|-----|------|
| P6-1 | `quality_signals` on scheduling-case | `ceo_draft_edits` · `ceo_tone_corrections` | ✅ |
| P6-2 | 承認前 body diff | `body_hash_at_draft` | ✅ |
| P6-3 | CLI `executive scheduling quality note` | チャット/メール指摘の手動記録 | ✅ |
| P6-4 | ops-poll Today 行 | `buildSecretaryQualityTodaySummary` | ✅ |

### P7 — Venue Booking 本番相当 ★完了

| ID | 作業 | DoD | 状態 |
|----|------|-----|------|
| P7-1 | Hotpepper handoff 文案 | `venue-handoff-{caseId}.md` | ✅ |
| P7-2 | 確定ゲート `schedule_venue_reservation_pending` | VR confirmed + `external_ref` 必須 | ✅ |
| P7-3 | 確定文に予約番号 | `draft-text` · VR SoT | ✅ |
| P7-4 | `confirmVenueReservation` 後に gate 解除 + confirm 下書き | next=`send_confirmation` | ✅ |
| P7-5 | en-US pre-proposal clarify テンプレ | US pack stub | ✅ |

### Phase C — 硬化 ★完了（2026-07-13）

| ID | 作業 | DoD | 状態 |
|----|------|-----|------|
| C-U1 | CEO フォームを clarify / pending でラベル分離 | 【候補日前】vs【提案/確定前】 | ✅ |
| C-U2 | `normalizeVenueName` · `venueNamesMatch` · 英語店名 | 表記ゆれ・Ginza area | ✅ |
| C-U3 | テンプレ抽出をフェンス非依存 | `extractCorrespondenceTemplateBody` | ✅ |
| C-F1 | Calendar→VR→確定メール順序を Runbook/Skill に明記 | メールのみ VR ゲート | ✅ |
| C-R1 | `rehearsal --full --in-person` | clarify → VR → 予約番号付き confirm（sticky exception 解消込み） | ✅ |

### Phase M — suggest 自動化 ★推奨 B 実装済（2026-07-14）

| ID | 作業 | 状態 |
|----|------|------|
| M-1 | CEO `--from-suggest` / `venue apply-suggest` | ✅ |
| M-4 | clarify 送信後は `--allow-after-clarify` 明示時のみ上書き | ✅ |

### Phase N — KPI

| ID | 作業 | 状態 |
|----|------|------|
| N-1 | `quality note --kind observation\|correction`（既定 observation） | ✅ |

### ライブ `SCH-2026-021`（2026-07-14）— 計測チェックリスト

**案件:** 契約締結祝い · 相手 竹谷昌敏 / `m.taketani@southwood.co.jp` · 会場 **なだ万 パレスホテル東京** · **`status=closed`**

| 工程 | 状態 | 正本メモ |
|------|------|----------|
| 起票 · 会場3案 · clarify 実 SMTP | ✅ | `DRAFT-20260714-003-message` |
| 夕方候補差し替え · proposal 実 SMTP | ✅ | SLOT-001〜003 · `DRAFT-20260714-006-message` · 第一候補なだ万 |
| 自宅 L2 + 最寄駅 L1 · `venue suggest` | ✅ | `party-locations` / records · clarify 後は社内第一候補更新 |
| 返信取込 · accept · CEO 確定 · calendar synced | ✅ | `MSG-20260714-afc40578` · `EVT-007` · ローカル sync |
| VR + 予約番号 SoT | ✅ | `VR-2026-002` · 当時社外文に計測仮番号（**現行 lint では ERROR** · 再送信不可） |
| 確定メール実 SMTP · closed · KPI | ✅ | `edits=0` だが **当時文面は現行 lint FAIL**（空行·署名·JA日時·アクセス·費用） |

**残課題（本案件スコープ外 / フォロー）:**

| 項目 | 状態 |
|------|------|
| Hotpepper **実**予約番号への差替 | 任意 · 社外再送時は必須 |
| P8 Google Calendar OAuth / Meet | 待ち（ローカル synced で十分） |
| 文案 style-lint 強化 | ✅（送信必須 · LIVE-MEASURE=error · KPIpass 記録 · clarify エリア健全化） |
| 会食 `cost_estimate` 起案必須 | ✅（`set-cost` / `--cost-estimate` · proposal/confirm 起案前ゲート） |
| VR 計測番号の本番拒否 | ✅（`--allow-measurement-ref` 明示時のみ） |
| 対面 rehearsal で style-lint PASS 断言 | ✅（sent drafts + `style_lint_pass_count`） |
| 次ライブ1件で lint PASS（実 SMTP） | ✅ **`SCH-2026-022` closed** · `style_lint_pass_count=3` · warnings=0 · 宛先 `ai@malkk.com` |
| VR 証明番号を measurement 扱いに統一 | ✅ `HP-PROOF` / `REH-` / `PROOF-` → VR confirm + style-lint **error**（`--allow-measurement-ref` のみ） |
| 連続 lint-clean KPI | ✅ `countConsecutiveLintCleanClosedCases` · Today 表示（目標3 · 現状は SCH-022 起点） |
| live_proof 正本 | ✅ `executive scheduling quality proof --partner/--accept-path/--venue-ref-kind` |
| EML → auto-process 受理経路テスト | ✅ inject 直呼び以外（`stage` + `runScheduleCoordinationAutoProcess`） |
| IMAP 往復チェックスクリプト | ✅ `scripts/mal-schedule-imap-accept-check.sh` |
| **外部相手 · 実IMAP · 実 Hotpepper 番号の次ライブ** | 未実施（コードゲートは揃い · 人オペ待ち） |

### ライブ `SCH-2026-022`（2026-07-14）— lint 証明

**案件:** 会食（lintライブ証明）· `ai@malkk.com` 自己往復 · なだ万第一候補 · **`status=closed`**

| 工程 | 状態 | 正本メモ |
|------|------|----------|
| clarify / proposal / confirm 実 SMTP | ✅ | `…-008-lint` · `…-010-lint` · `…-011-re-lint` |
| style-lint | ✅ | pass×3 · warnings=0 · `style_lint_pass_count=3` |
| VR | ✅ 当時 | `VR-2026-003` · `HP-PROOF-20260714-022`（**現行は measurement · 送信/confirm 再発不可**） |

### 次のスコア上げ（コード済 · ライブ待ち）

| 項目 | コマンド / 正本 |
|------|----------------|
| live_proof 記録 | `executive scheduling quality proof --case SCH-… --partner external --accept-path imap --venue-ref-kind provider` |
| IMAP accept 確認 | `scripts/mal-schedule-imap-accept-check.sh SCH-…` |
| 本番 VR 番号 | `operations venue confirm --external-ref <数字入り本番番号>`（証明用プレフィックス不可） |

| ID | 作業 | DoD | 状態 |
|----|------|-----|------|
| P8-1 | GCP プロジェクト · 同意画面 | **当方が Cloud Console で設定** | 待ち |
| P8-2 | `calendar_sync: synced` ローカル運用 | mal デモ継続 | ✅ |

---

## 5. 文化モジュール構成案

### 5.1 なぜ Jurisdiction と一体か / 分けるか

| 案 | 長所 | 短所 |
|----|------|------|
| **A. Jurisdiction Pack 内 `correspondence/`**（推奨） | locale が既に pack にある（JP=`ja-JP`）。法域と礼儀が同じ配布単位 | 同一法域で多言語（SG 英中）はサブ locale が必要 |
| B. 独立 `locale-packs/` | 言語だけ差し替えやすい | 二重管理・pack pin が増える |
| C. テナント rules のみ | 速い | 再利用不可・1級正本が散る |

**推奨: A + テナント上書き。**  
法域パックに「通信文化」を同梱し、テナント `secretary_behavior.md` で会社口調だけ上書き。

### 5.2 ディレクトリ案

```
steward/jurisdiction-packs/{JP|US|…}/
  correspondence/
    style.yaml           # formality, honorifics, forbidden, required_blocks
    email-style-{lang}.md
    templates/
      openers.md
      scheduling-confirm.md
      scheduling-clarify.md
```

### 5.3 locale ごとの差（設計上の前提）

| locale | 文頭 | 名指し | 長さ | 典型禁則 |
|--------|------|--------|------|----------|
| **ja-JP** | お世話になっております + 名乗り | 姓+様 · 貴社/弊社 | 定型あり・簡潔だが省略しすぎない | 推測の関係性、卑近な売り文句、送信元説明 |
| **en-US** | 短い挨拶 + 目的先 | Mr/Ms または合意後 first name | 短い・直接的 | 過度な季節の挨拶の強制 |
| **de-DE**（将来） | Sehr geehrte(r) … | Herr/Frau + 姓 | 事実・簡潔 | カジュアルな Hi |

参照（文化差の根拠・教育用）: 日米メール作法の対比、独・日の形式重視など（実装は正本 MD/YAML に内製し、外部ブログは根拠メモに留める）。

### 5.4 Venue Booking との境界

```
Secretary: 「会場Aで仮押さえ依頼」Work Order / handoff
    → Venue Booking Agent:（将来）予約サイト or 電話手順 · 確認番号を SoT に返す
    → Secretary: 確認番号を入れた確定文（JP style テンプレ）を起案
    → Mail Outbound: 承認・送信
```

デモ現状: Venue は人間または省略（ADR [0009-venue-web-booking-channel.md](../adr/0009-venue-web-booking-channel.md)）。Secretary は「実予約なし」を **内部 notes のみ**（社外文に「デモ」と書かない）。

---

## 6. 成功指標

| 指標 | 主体 | 正本 | 目標 |
|------|------|------|------|
| 文案指摘（編集 + 言い回し） | **Secretary** | `scheduling-cases.yaml` · `quality_signals` | 連続3案件で 0〜1 |
| VR 完了 · 予約番号 SoT | **Venue Booking** | `venue-reservations.yaml` | 対面確定前 100% |
| lint 不合格 | Secretary | style-lint | send 前 0（計測プレースホルダ含む） |
| 誤起票 | Mail Intake | thread 紐付け | 週次 0 |
| 社外下書き lint 不合格率 | Secretary | style-lint | send 前 100% ゲート |
| style-lint 通過記録 | Secretary | `quality_signals.style_lint_pass_count` | 送信ごとに +1 |
| 外部返信の誤起票率（既知コンタクト） | Mail Intake | thread 紐付け | 実運用 1 週間で 0 |
| 自己評価（文案品質） | Secretary | quality_signals + lint | 45 → **75+**（`edits=0` 単独では不足） |

---

## 7. 実装順序（推奨）

1. **正本ドキュメント**（本計画と同時に配置）← 今回  
2. P0-2/P0-3 テンプレ合成 + lint  
3. P1 thread 紐付け  
4. P2 venue_pending + Venue handoff stub  
5. P3 en-US stub  

---

## 8. 関連

- Runbook: [scheduling-coordination-runbook.md](scheduling-coordination-runbook.md)  
- Skill: [schedule_coordination.md](../../steward/core/skills/schedule_coordination.md) · [external_correspondence.md](../../steward/core/skills/external_correspondence.md)  
- MAL 上書き: `tenants/mal/rules/secretary_behavior.md`
