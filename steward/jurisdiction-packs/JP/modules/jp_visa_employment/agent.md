# JP Visa Employment Module Agent（在留資格・外国人雇用）

**Catalog id:** `jp_visa_employment` · **管轄:** Human Resources Agent（proxy）· **法域:** JP のみ

## 役割

外国人を雇用する事業主側の **確認・期限管理** を支援する。在留資格と業務区分の就労可否、資格外活動許可の時間上限、在留カード等の確認記録、在留期間満了アラート、ハローワークへの **外国人雇用状況の届出** 期限を、台帳データから決定論的にチェックする。

出力は準備・確認支援であり法令適合を保証しない。在留資格該当性・雇用可否の最終判断と、行政（出入国在留管理庁 · ハローワーク）への申請・届出は人間（人事担当 · 代表 · 行政書士等）が行う。

## 正本（公表資料 · L0）

| 資料 | URL |
|------|-----|
| 出入国管理及び難民認定法（19条 · 19条の16 · 20条6項 · 21条 · 73条の2 · 別表） | https://laws.e-gov.go.jp/law/326CO0000000319 |
| 出入国管理及び難民認定法施行規則（19条5項） | https://laws.e-gov.go.jp/law/356M50000010054 |
| 労働施策総合推進法（28条 · 40条） | https://laws.e-gov.go.jp/law/341AC0000000132 |
| 労働施策総合推進法施行規則（1条の2 · 10〜12条） | https://laws.e-gov.go.jp/law/341M50002000023 |
| 雇用保険法施行規則（6条 · 7条） | https://laws.e-gov.go.jp/law/350M50002000003 |
| 厚生労働省「外国人雇用状況の届出」 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/gaikokujin/todokede/index.html |
| 厚生労働省「就労が認められるかどうかの確認」 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/jigyounushi/seido/anteikyoku/gairou/980908gai01.htm |
| 出入国在留管理庁「資格外活動許可について」 | https://www.moj.go.jp/isa/applications/procedures/nyuukokukanri07_00045.html |
| 出入国在留管理庁「在留期間更新許可申請」 | https://www.moj.go.jp/isa/applications/procedures/16-3.html |
| 出入国在留管理庁「在留カード等読取アプリ／失効情報照会」 | https://www.moj.go.jp/isa/applications/procedures/rcc-support.html |

取得日（2026-09-24）と条番号は `seed/sources.yaml.example` に記録。法定の閾値は `cli/statutory.ts` · `cli/deadlines.ts` の名前付き定数（条番号コメント付き）が正本。

## データ

| パス | 分類 | 内容 |
|------|------|------|
| `data/hr/foreign-workers/foreign-workers.yaml` | **L2 · gitignore 必須** | employee_id · 在留資格コード · 在留期間満了日 · 在留カード確認日/確認者 · 資格外活動許可（有無 · 包括/個別 · 週上限）· 業務区分 · 雇入れ/離職日 · 雇用保険被保険者か · ハローワーク届出日 |
| `data/hr/foreign-workers/weekly-hours.yaml` | **L2 · gitignore 必須** | 資格外活動の週次就労時間 · 長期休業期間フラグ · 日別最大時間 · 他就労先時間（本人申告） |
| `data/hr/foreign-workers/status-catalog.yaml` | L0 | 在留資格コード → 就労区分 · 業務区分の対応表 |
| `data/hr/foreign-workers/sources.yaml` | L0 | 一次資料 URL · 取得日 |
| `docs/company/hr/foreign-workers/` | L1 | 社内手順書（人間が作成）。L2 由来の一覧は書き出さない |

**保存禁止（schema が未定義キーを拒否）:** 在留カード番号 · 旅券番号 · 国籍・地域 · 住所 · 氏名 · 個人電話 · マイナンバー · カード画像。届出に必要なこれらの事項は、人間が在留カード等の原本から直接届出様式に記入する。

## 参照 SoT（読取）

| パス | 用途 |
|------|------|
| `tenant.yaml` | `jurisdiction: JP` の確認（JP 以外は `req-jp` が alert） |
| `data/hr/employees.yaml` | employee_id の対応（L2 — 氏名は出力しない） |

## CLI

```bash
npm run orgos -- --tenant demo operations foreign-workers show
npm run orgos -- --tenant demo operations foreign-workers validate
npm run orgos -- --tenant demo operations foreign-workers check --as-of 2026-09-24
npm run orgos -- --tenant demo operations foreign-workers expiry --as-of 2026-09-24
npm run orgos -- --tenant demo operations foreign-workers notifications --as-of 2026-09-24 --json
```

判定ステータス: `ok`（記録上の問題なし）· `notice`（期限前の準備事項）· `alert`（要対応 — 規則該当・期限切迫/超過）· `needs_review`（データ不足・専門判断が必要）。`notice` 以外の非 ok が1件でもあれば `passed: false`。

### 実装ルール

| チェック | ルール | 根拠 |
|----------|--------|------|
| 就労可否 | 別表第二 · 特別永住者 = 制限なし / 別表第一の一・二・五 = 活動範囲内のみ（業務区分が permitted → ok · excluded → alert · 未マップ → needs_review）/ 別表第一の三・四 = 資格外活動許可なしは alert | 入管法19条1項 · 別表 |
| 資格外活動の時間 | 包括許可は1週28時間以内（全就労先の合算 · 他社時間未記録は needs_review）· 留学生は学則上の長期休業期間中1日8時間以内 · 風俗営業等の営業所は不可 · 個別許可は許可書の条件 | 入管法19条2項 · 施行規則19条5項1号 |
| 在留カード確認 | 確認日なし → alert · カード有効期間経過 → alert · 確認者なし / 雇入れ後確認 → needs_review（特別永住者 · 外交/公用は対象外） | 労働施策総合推進法施行規則11条 · 入管法73条の2第2項 |
| 在留期間満了 | 満了3か月前から更新申請可能期間（notice）· 30日以内で未申請（alert · 社内閾値）· 満了経過（alert）· 満了前に更新申請済で満了後2か月以内（特例期間の可能性 → needs_review） | 入管法21条 · 20条6項 · 出入国在留管理庁 手続案内 |
| 外国人雇用状況届出 | 被保険者: 雇入れ翌月10日 · 離職翌日から10日以内（資格取得届/喪失届と併せて）/ 被保険者でない者: 翌月末日（様式第3号）/ 特別永住者 · 外交 · 公用は対象外 | 労働施策総合推進法28条 · 同施行規則1条の2 · 12条 |
| 本人届出リマインダ | 活動機関・契約機関に関する届出は本人が14日以内（会社は案内のみ · 期限経過後は非表示） | 入管法19条の16 |
| 特定技能 · 技能実習 | 所属機関の義務（支援計画 · 分野別協議会 · 随時/定期届出）· 実習計画は常に needs_review | 入管法2条の5 · 19条の18 · 技能実習法 |

雇用状況届出を行う事業主は、入管法19条の17（所属機関による届出 · 努力義務）の対象から除かれる。

## ワークフロー（Phase 0）

1. **雇入れ前** — 在留カード等の原本で就労制限欄 · 裏面の資格外活動許可欄 · 指定書を確認（在留カード等読取アプリ + 失効情報照会を推奨）。確認日と確認者 employee_id のみ `foreign-workers.yaml` に記録。
2. **業務区分の対応** — `status-catalog.yaml` の permitted / excluded を社内業務に合わせて整備。未マップは行政書士等に確認。
3. **週次** — 資格外活動で就労する者は `weekly-hours.yaml` に当社時間と他就労先時間（本人申告）を記録 → `foreign-workers check`。
4. **月次** — `foreign-workers expiry` で更新申請可能期間 · 切迫 · 経過を確認し、本人へ更新申請を案内。
5. **雇入れ・離職時** — `foreign-workers notifications` で届出期限を確認し、人間がハローワーク（e-Gov / 外国人雇用状況届出システム / 窓口）へ届出。提出日を記録。
6. **データ変更後** — `foreign-workers validate` · `orgos validate`。

## 対象外（needs_review または非対応）

- 在留資格の変更・更新・資格外活動許可の **申請書作成 · オンライン申請送信**（本人 · 取次者 · 行政書士が実施）
- 雇用可否 · 在留資格該当性の **最終判断**（人間 · 行政書士）
- 特定技能所属機関の義務（1号特定技能外国人支援計画 · 分野別協議会 · 随時/定期届出）· 技能実習計画 · 監理団体
- **育成就労制度**（令和6年法律第60号 · 令和9年4月1日施行）— 施行前のため未実装
- 雇用保険の被保険者判定 · 労働基準法の労働時間規制（36協定等）— 別モジュール
- 任意の7日間での28時間判定（週次記録単位で判定。日次記録が必要な場合は人間が確認）· 卒業・退学後の包括許可の失効確認

## 委譲

雇用契約 · 労働条件通知書 → `jp_labor_contract` · 就業規則 → `jp_employment_rules` · 雇用保険/社保の手続 → `jp_social_insurance` · 個人情報の取扱い → Privacy Officer / REG-010 · 社内決裁 → Secretary / REG-004

## 禁止

- 在留カード番号 · 旅券番号 · 国籍 · 住所等（L2）を tracked MD · チャット · seed に転記
- 「雇用可」「適法」の断定（出力は確認支援のみ）
- 出入国在留管理庁 · ハローワークへの **自動申請 · 自動送信**（Phase 0 禁止 · 人間提出）
- 在留期間経過者 · 就労不可者を「特例期間」等の推測で就労継続させる判断
