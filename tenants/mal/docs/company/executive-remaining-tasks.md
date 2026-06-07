# 経営者 残タスク一覧

**株式会社MAL · 段燕燕（代表取締役）向け**  
**基準日:** 2026年6月7日（commit `ae0b0a4` 時点）  
**完成度:** リポジトリ準備 **約96%** — 残りは **実手続・実データ入力** で 100% へ

> 本ファイルは [steward-assessment.md](../compliance/iso/steward-assessment.md) の「100% ユーザー・外部アクション」、 [pre-opening-checklist.md](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md)、 [fy2026-tax-readiness-assessment.md](tax/fy2026-tax-readiness-assessment.md)、 [fy2026-tax-advisor-checklist.md](fy2026-tax-advisor-checklist.md)、 [executive-dashboard-guide.md](../plans/executive-dashboard-guide.md) を **経営者視点で1枚に集約** したものです。

---

## 凡例

| 優先度 | 意味 |
|:------:|------|
| **P0** | 今週中。稼働リスク・決算ブロッカー |
| **P1** | 1〜4週間。開業・決算準備の要 |
| **P2** | 計画的に。定期運用・改善 |

**工数目安:** 15分 / 30分 / 1時間 / 半日 / 1日+（外部待ち除く）

---

## 今すぐ（P0）

- [ ] **[P0] CTR-014 亀沢旅館 火災保険に加入する**
  - **やること:** 加入パケットに沿い保険会社へ申込 → 証券 PDF 取得 → `docs/io/inbox/` 保管 → CTR-014 を executed 化
  - **なぜ:** 亀沢は **稼働中**。民泊対応火災保険・施設賠償1億円以上が未加入のままは最大リスク
  - **関連:** [CTR-014 加入パケット](../contracts/CTR-014/02-enrollment-packet.md) · [pre-opening B4–B8](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md)
  - **工数:** 半日（保険会社審査は別途）

- [ ] **[P0] CTR-013 番町 火災保険に加入する**
  - **やること:** CTR-014 と同様に申込・証券取得・inbox 登録・executed 化
  - **なぜ:** draft のまま。番町物件の火災リスクが未カバー
  - **関連:** [CTR-013 加入パケット](../contracts/CTR-013/02-enrollment-packet.md)
  - **工数:** 半日

- [ ] **[P0] 現預金残高を `cash-balance.yaml` に入力する**
  - **やること:** 全口座の 2027/1/31 残高を入力 → `status: confirmed` → `npm run validate`
  - **なぜ:** B/S 確定・ランウェイ算出・経営ダッシュボードの前提データ。未入力だと **ランウェイ TBD**
  - **関連:** [`data/finance/cash-balance.yaml`](../../data/finance/cash-balance.yaml) · [executive-dashboard-guide](../plans/executive-dashboard-guide.md)
  - **工数:** 30分

- [ ] **[P0] B/S 3項目の原資料を入手する（資本金・繰越剰余金・銀行残高）**
  - **やること:** 登記簿謄本・第8期決算書・全銀行残高証明を取得し税理士へ共有
  - **なぜ:** 計算書類・e-Tax 第5表の **最大ブロッカー**（3項目すべて TBD）
  - **関連:** [fy2026-tax-advisor-checklist #1–3](fy2026-tax-advisor-checklist.md) · [fy2026-keisansyorui.md](fy2026-keisansyorui.md)
  - **工数:** 1時間（取得）＋税理士待ち

- [ ] **[P1] 株主名簿の TBD を登記簿で確定する**
  - **やること:** 登記簿謄本・定款から **資本金・発行済株式総数・1株の金額・段燕燕の住所・取得日** を転記 → [shareholder-register.md](shareholder-register.md) 更新
  - **なぜ:** 会社法第121条の法定記載事項が未充足（持株数・住所 TBD）。teikan-summary・議事録の株主構成（50/50 vs 100%）も登記と同期が必要
  - **関連:** [shareholder-register.md](shareholder-register.md) · [teikan-summary.md](teikan-summary.md) · [licenses/corporate-registry/](licenses/corporate-registry/)
  - **工数:** 30分（謄本入手後）

- [ ] **[P0] `kamezawa-secrets.yaml` を実値で作成する**
  - **やること:** `cp kamezawa-secrets.yaml.example kamezawa-secrets.yaml` → スマートロック・Wi-Fi・緊急連絡先・設備位置を記入（gitignore 済み）
  - **なぜ:** 日常運用・緊急時対応が example のままでは現場で使えない
  - **関連:** [`data/operations/kamezawa-secrets.yaml.example`](../../data/operations/kamezawa-secrets.yaml.example) · [pre-opening C3–C6](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md)
  - **工数:** 1時間

- [ ] **[P0] CTR-012 清掃業者を1社選定し契約締結する**
  - **やること:** 候補3社テンプレから選定 → 契約締結 → CTR-012 を executed 化
  - **なぜ:** 清掃未契約のままでは turnover 運用が属人化・コンプライアンスリスク
  - **関連:** [CTR-012](../contracts/CTR-012/01-draft.md) · [pre-opening E3](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md)
  - **工数:** 半日

---

## 決算前（P0 / P1）

- [ ] **[P0] 税理士へ `fy2026-tax-advisor-checklist.md` を送付する**
  - **やること:** チェックリスト10項目＋原資料（上記 B/S 3項目）を税理士へ共有し確認依頼
  - **なぜ:** 法人税・消費税区分・減価償却・役員貸付等の **税務判断が未了**
  - **関連:** [fy2026-tax-advisor-checklist.md](fy2026-tax-advisor-checklist.md) · [tax readiness 推奨 #2](tax/fy2026-tax-readiness-assessment.md)
  - **工数:** 30分（送付）＋税理士待ち

- [ ] **[P1] 消費税 課税事業者区分を税理士と確定する**
  - **やること:** インボイス T4010001189530 登録済みだが免税/本則/簡易の判定を決定
  - **なぜ:** 申告要否・インボイス運用・3/31 期限に直結
  - **関連:** [tax-advisor-checklist #10](fy2026-tax-advisor-checklist.md) · [tax readiness ブロッカー #3](tax/fy2026-tax-readiness-assessment.md)
  - **工数:** 税理士打合 1時間

- [ ] **[P1] 亀沢 減価償却開始時期・耐用年数を税理士と確定する**
  - **やること:** 建築完成日・取得原価9,600万の土地建物区分を整理し別表16前提を確定
  - **なぜ:** 第9期 P/L に亀沢減価償却 **未計上（0円）** — 申告書別表16の要
  - **関連:** [tax-advisor-checklist #9](fy2026-tax-advisor-checklist.md) · [CTR-008/009 役員貸付](../contracts/CTR-008/02-executed.md)
  - **工数:** 半日

- [ ] **[P1] CTR-003 本社兼用（番町312）の按分を税理士と確定する**
  - **やること:** 地代家賃・固定資産税の事業按分率を実態ベースで合意
  - **なぜ:** 経費計上・固定資産税申告の整合に必要
  - **関連:** [tax-advisor-checklist #7](fy2026-tax-advisor-checklist.md) · [CTR-003](../contracts/CTR-003/02-executed.md)
  - **工数:** 1時間

- [ ] **[P1] 2027/2/10 取締役会・2027/3/15 株主総会の準備を完了する**
  - **やること:** 計算書類確定 → 議事録ドラフト確認 → 招集通知・公告手続
  - **なぜ:** 法定スケジュール（取締役会 2/10 · 総会 3/15 · 申告 3/31）
  - **関連:** [fy2026-meeting-schedule.md](fy2026-meeting-schedule.md) · [fy2026-torishimari-gijiroku.md](fy2026-torishimari-gijiroku.md) · [fy2026-shukai-gijiroku.md](fy2026-shukai-gijiroku.md)
  - **工数:** 半日（数値確定後）

- [ ] **[P1] 償却資産税申告（2027/1/31期限）の対応を税理士と確認する**
  - **やること:** 千代田区・墨田区それぞれの評価額・申告書提出要否を確認（期限経過の場合は遅延手続）
  - **なぜ:** 物件所在地2区に跨る。未申告は加算税リスク
  - **関連:** [tax/fy2026/05-kotei-shisanzei.md](tax/fy2026/05-kotei-shisanzei.md)
  - **工数:** 税理士連携

- [ ] **[P2] 会計ソフト仕訳・試算表を整備する（税理士と分担）**
  - **やること:** 予想ベース YAML から総勘定元帳・仕訳帳へ移行
  - **なぜ:** e-Tax 添付・税務調査対応に不足（readiness ブロッカー #2）
  - **関連:** [tax/fy2026/07-accounting-minimum-ledger.md](tax/fy2026/07-accounting-minimum-ledger.md)
  - **工数:** 1日+（税理士作業含む）

---

## 開業・運用

- [ ] **[P0] 営業許可証を施設内に掲示する**
  - **やること:** 旅館業許可証を見やすい場所に掲示
  - **なぜ:** 旅館業法上の義務。未掲示は行政指導対象
  - **関連:** [pre-opening A2](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md)
  - **工数:** 15分

- [ ] **[P1] 許可証・申請控えをスキャン保管する**
  - **やること:** スキャン → `docs/company/licenses/ryokan/records/` → `steward io inbox add` で台帳登録
  - **なぜ:** 監査・変更届・引継ぎの証跡
  - **関連:** [pre-opening A3](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md) · [licenses/](../licenses/)
  - **工数:** 30分

- [ ] **[P1] ゲスト向け掲示 PDF を本番版で outbox 出力する**
  - **やること:** House Rules・宿泊約款等を PDF 再生成 → `docs/io/outbox/` 登録
  - **なぜ:** test PDF は登録済みだが **本番掲示版** が未出力
  - **関連:** [pre-opening D9](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md) · [guest-facing テンプレ](../properties/PROP-002-kamezawa/operations/templates/guest-facing/)
  - **工数:** 30分

- [ ] **[P1] 宿泊者名簿 3年保存運用を開始する**
  - **やること:** 様式に沿い最初の宿泊から記録開始（電磁保存可）
  - **なぜ:** 旅館業法・個人情報規程 REG-012 準拠
  - **関連:** [pre-opening A5](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md) · [daily-operations-guide.md](../properties/PROP-002-kamezawa/operations/daily-operations-guide.md)
  - **工数:** 15分/回（初回設定 30分）

- [ ] **[P2] 鍵・スマートロック運用ルールを CTR-012 別紙で確定する**
  - **やること:** 清掃業者への鍵渡し・コード更新ルールを文書化
  - **なぜ:** CTR-012 締結後の運用ギャップ解消
  - **関連:** [pre-opening E4](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md)
  - **工数:** 30分

- [ ] **[P2] 借家人賠償（番町・該当時）の要否を確認する**
  - **やること:** CTR-003 賃貸条件と保険証券を照合
  - **なぜ:** 賃貸借契約上の賠償義務と保険カバレッジの整合
  - **関連:** [pre-opening B9](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md) · [CTR-003](../contracts/CTR-003/02-executed.md)
  - **工数:** 30分

---

## 税務

- [ ] **[P0] 税理士確認後、`fy2026-keisansyorui.md` の TBD を確定反映する**
  - **やること:** 資本金・現金・繰越剰余・累計減価・法人税等を更新 → `npm run validate` → PDF 再生成
  - **なぜ:** 株主総会・申告・公告の正式数値源
  - **関連:** [fy2026-keisansyorui.md](fy2026-keisansyorui.md) · [tax-advisor-checklist 完了後手順](fy2026-tax-advisor-checklist.md)
  - **工数:** 30分

- [ ] **[P1] 役員報酬 0円で確定できるか税理士に確認する**
  - **やること:** 役員報酬方針の税務上問題ないか書面確認
  - **なぜ:** 申告書・社会保険・役員貸付との整合
  - **関連:** [tax-advisor-checklist #6](fy2026-tax-advisor-checklist.md)
  - **工数:** 15分

- [ ] **[P1] 役員貸付（CTR-008/009）返済計画の税務コメントを得る**
  - **やること:** 0%金利・みなし利息・貸付金科目の処理方針を税理士と合意
  - **なぜ:** 別表17等・税務調査リスク
  - **関連:** [tax-advisor-checklist #8](fy2026-tax-advisor-checklist.md)
  - **工数:** 税理士打合

- [ ] **[P1] 法人税等 確定税額・納付スケジュールを確定する**
  - **やること:** 暫定775,000円を税理士申告書で確定 → e-Tax XML 作成・電子署名（税理士）
  - **なぜ:** **2027/3/31** 申告・納付期限
  - **関連:** [tax/fy2026/](tax/fy2026/) · [fy2026-meeting-schedule.md](fy2026-meeting-schedule.md)
  - **工数:** 税理士作業（経営者は資料提供・承認）

- [ ] **[P2] 法定調書「該当なし」の最終確認（委託180,000円含む）**
  - **やること:** 給与・報酬・家賃等の支払調書要否を税理士と確認
  - **なぜ:** 2027/1/31 期限（従業員0・役員報酬0だが委託先あり）
  - **関連:** [tax readiness「今すぐできること #4」](tax/fy2026-tax-readiness-assessment.md)
  - **工数:** 15分

---

## 定期運用

- [ ] **[P1] 毎日 `npm run daily` を実行する**
  - **やること:** validate · dashboard · io status · deps 鮮度チェックを1日1回
  - **なぜ:** データ整合・契約アラート・成熟度 **96%→維持** の要
  - **関連:** [steward-assessment 自動化](../compliance/iso/steward-assessment.md) · [executive-dashboard-guide](../plans/executive-dashboard-guide.md)
  - **工数:** 5分/日

- [ ] **[P1] 週次: `steward alerts` で契約期限・高リスクを確認する**
  - **やること:** draft 契約（CTR-011〜014）・期限30日以内を確認
  - **なぜ:** ダッシュボードと同一ロジックの早期警告
  - **関連:** [executive-dashboard-guide タスク優先度](../plans/executive-dashboard-guide.md)
  - **工数:** 10分/週

- [ ] **[P1] 月次: 予実 YAML 更新とダッシュボード月次レビュー**
  - **やること:** `data/finance/monthly/` または予実 YAML 更新 → dashboard 確認 → ナラティブ1行記録
  - **なぜ:** キャッシュフロー・損益分岐・計画比の経営判断材料
  - **関連:** [cashflow-detail.md](../plans/cashflow-detail.md) · [yojitsu-fy2026.yaml](../../data/plans/yojitsu-fy2026.yaml)
  - **工数:** 30分/月

- [ ] **[P1] 2026/8/18 内部監査第1回を実施する**
  - **やること:** ISO 監査計画に沿い L2 記録・不適合の有無を確認
  - **なぜ:** REG-009〜016 制定後の初回監査（プレースホルダー日付確定済み）
  - **関連:** [internal-audit-plan-fy2026.md](../compliance/iso/internal-audit-plan-fy2026.md) · [pre-opening E7](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md)
  - **工数:** 半日

- [ ] **[P2] Inbox 未処理を週次でゼロにする**
  - **やること:** `steward io status` → スキャン・申請書を処理 or 台帳登録
  - **なぜ:** 現状 inbox 空を維持。受信滞留は高緊急度アラート対象
  - **関連:** [docs/io/inbox/](../inbox/00-このフォルダについて.md)
  - **工数:** 15分/週

- [ ] **[P2] 四半期: steward-assessment と本ファイルを見直す**
  - **やること:** 完了項目にチェック → 新規ブロッカーを追記
  - **なぜ:** 96%→100% 進捗の可視化・次期準備
  - **関連:** [steward-assessment.md](../compliance/iso/steward-assessment.md)
  - **工数:** 30分/四半期

---

## 進捗サマリー（手動更新）

| 区分 | 全項目 | 完了 | 備考 |
|------|:------:|:----:|------|
| 今すぐ P0 | 6 | 0 | 保険・secrets・清掃・B/S |
| 決算前 | 7 | 0 | 税理士連携中心 |
| 開業・運用 | 6 | 0 | 掲示・PDF・名簿 |
| 税務 | 5 | 0 | 申告確定待ち |
| 定期運用 | 6 | 0 | daily/alerts/監査 |
| **合計** | **30** | **0** | 2026-06-07 作成時 |

---

## 関連ドキュメント

| ファイル | 内容 |
|---------|------|
| [steward-assessment.md](../compliance/iso/steward-assessment.md) | 全体完成度 96% · Top 3 推奨 |
| [pre-opening-checklist.md](../properties/PROP-002-kamezawa/operations/pre-opening-checklist.md) | 亀沢 42項目詳細 |
| [fy2026-tax-readiness-assessment.md](tax/fy2026-tax-readiness-assessment.md) | 申告可否・e-Tax ブロッカー |
| [fy2026-tax-advisor-checklist.md](fy2026-tax-advisor-checklist.md) | 税理士依頼10項目 |
| [executive-dashboard-guide.md](../plans/executive-dashboard-guide.md) | KPI 定義・daily 運用 |

*チェックを入れたら `npm run validate` でデータ整合を確認し、必要に応じて契約 YAML・計算書類を更新してください。*
