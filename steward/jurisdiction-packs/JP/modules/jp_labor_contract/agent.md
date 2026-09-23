# JP Labor Contract Module Agent（雇用契約 · 労働条件通知書）

**Catalog id:** `jp_labor_contract` · **管轄:** Human Resources Agent（proxy）· **法域:** JP のみ

## 役割

労働契約の締結・更新時に必要な **労働条件の明示事項（2024-04-01 改正対応）** · **有期契約期間の上限** · **地域別最低賃金** · **無期転換（労契法18条）の通算期間** · **雇止め予告期限** を確認し、**労働条件通知書ドラフト** を生成する。出力は準備・点検の支援のみ。法令適合の最終判断 · 労働者への交付 · 雇止めや解雇の判断は人間（代表 · 人事担当 · 社労士）。

## 正本（公表資料 · L0）

| 資料 | URL |
|------|-----|
| 労働基準法（14条 · 15条 · 21条） | https://laws.e-gov.go.jp/law/322AC0000000049 |
| 労働基準法施行規則（5条 · 2024-04-01 改正） | https://laws.e-gov.go.jp/law/322M40000100023 |
| 労働契約法（18条 · 19条） | https://laws.e-gov.go.jp/law/419AC0000000128 |
| 通算契約期間に関する基準を定める省令（クーリング） | https://laws.e-gov.go.jp/law/424M60000100148 |
| 有期労働契約の締結、更新、雇止め等に関する基準（告示） | https://www.mhlw.go.jp/web/t_doc?dataId=73aa5469&dataType=0&pageNo=1 |
| 高度専門職の基準（平成15年厚労告356号） | https://www.mhlw.go.jp/web/t_doc?dataId=73aa5468&dataType=0&pageNo=1 |
| パートタイム・有期雇用労働法（6条） | https://laws.e-gov.go.jp/law/405AC0000000076 |
| 同施行規則（2条 · 2026-10-01 改正） | https://laws.e-gov.go.jp/law/405M50002000034 |
| 最低賃金法 · 同施行規則（1条 · 2条） | https://laws.e-gov.go.jp/law/334AC0000000137 · https://laws.e-gov.go.jp/law/334M50002000016 |
| 地域別最低賃金の全国一覧（令和7年度） | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/ |
| 令和8年度最低賃金額答申 | https://www.mhlw.go.jp/stf/newpage_75950.html |
| モデル労働条件通知書 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudoukijunkankei.html |

取得日つきの一覧は `seed/sources.yaml.example`。通知書ひな形は `seed/templates/`。

## データ

| パス | 分類 | 内容 |
|------|------|------|
| `data/hr/labor-contracts/labor-contracts.yaml` | **L2 · gitignore** | 労働契約台帳（明示事項 · 期間 · 就業場所の都道府県 · 賃金額 · 所定労働時間） |
| `data/hr/labor-contracts/fixed-term-history.yaml` | L1 | 満了済み有期契約の期間（通算用） |
| `data/hr/labor-contracts/minimum-wages.yaml` | L0 | 地域別最低賃金（都道府県 · 時間額 · 発効日 · `verified_through`） |
| `data/hr/labor-contracts/sources.yaml` | L0 | 公表 URL · 書式カタログ（任意 · seed と同期可） |
| `data/hr/labor-contracts/templates/` | L0 | 通知書ひな形（任意 · 無ければ seed） |
| `docs/company/hr/labor-contracts/{contract-id}/` | L1 | 生成した労働条件通知書ドラフト（賃金額 · 氏名は記入欄のみ） |
| `records/hr/labor-contracts/` | L2 · gitignore | 署名済み交付版 |

従業員は `employee_id` のみで参照する。氏名 · 住所 · マイナンバー · 在留カード番号 · 口座 · 個人電話は台帳に書かない。締結時年齢は5年上限特例（満60歳以上）の判定用に `age_at_conclusion` のみ持つ。

## 参照 SoT（読取）

| パス | 用途 |
|------|------|
| `data/company.yaml` | 使用者名称 |
| `tenant.yaml` | 法域（JP 以外はチェック不合格） |

## CLI

```bash
npm run orgos -- --tenant demo operations labor-contract show
npm run orgos -- --tenant demo operations labor-contract validate
npm run orgos -- --tenant demo operations labor-contract check --contract LC-2026-002
npm run orgos -- --tenant demo operations labor-contract check --contract LC-2026-001 --as-of 2026-09-24 --json
npm run orgos -- --tenant demo operations labor-contract conversion-check --as-of 2026-09-24
npm run orgos -- --tenant demo operations labor-contract draft --contract LC-2026-005
npm run orgos -- --tenant demo operations labor-contract draft --contract LC-2026-005 --write
```

## 判定ルール（`check` · `conversion-check`）

| ルール | 根拠 | 判定 |
|------|------|------|
| 書面明示事項（期間 · 就業場所/業務 · 労働時間等 · 賃金 · 退職） | 労基法15条1項 · 労基則5条1項1〜4号・3項 | 未記載は `ng` |
| 就業場所・業務の **変更の範囲**（2024-04-01 以降の締結） | 労基則5条1項1号の3 | 未記載は `ng` |
| 更新基準 · **更新上限の有無と内容**（更新があり得る有期） | 労基則5条1項1号の2 | 未記載は `ng` |
| 無期転換申込機会 · 転換後の労働条件（通算5年超となる契約） | 労基則5条5項・6項 | 未記載は `ng` · 通算不明は `needs_review` |
| 昇給 · 退職手当 · 賞与の有無 · 相談窓口（パート・有期） | パート有期法6条1項 · 施行規則2条 | 未記載は `ng` |
| 待遇差の説明を求めることができる旨（2026-10-01 以降） | 施行規則2条1項4号 | 未記載は `ng` |
| 有期契約の上限 3年（高度専門職 · 満60歳以上は5年） | 労基法14条1項 | 超過は `ng` · 高度専門・事業完了型・年齢不明は `needs_review` |
| 試用期間（法定上限なし · 6か月超は要確認） | 労基法21条4号 · 判例 | 6か月超 · 契約期間以上は `needs_review` |
| 更新上限の新設・短縮の事前説明 | 雇止め告示1条 | 説明日なし · 締結後は `ng` |
| 地域別最低賃金（月給・日給・週給は時間額換算） | 最低賃金法4条 · 施行規則1条・2条 | 未満は `ng` · 表にない/確認期限後/出来高払は `needs_review` |
| 通算契約期間 · クーリング（空白6か月 · 通算1年未満は1/2） | 労契法18条 · 通算基準省令1条・2条 | 5年超で申込権 · 次回更新での発生を警告 |
| 雇止め予告（3回以上更新 · 1年超継続 · 30日前） | 雇止め告示2条 | 期限を表示 · 経過は警告 · 雇止めの有効性は `needs_review` |

## ワークフロー（Phase 0）

1. **最低賃金表** — 厚労省一覧を確認し `minimum-wages.yaml` の rates · `verified_through` を更新（改定の発効前後は特に確認）。
2. **台帳** — `labor-contracts.yaml`（L2）に契約を登録。満了済み有期契約は `fixed-term-history.yaml` へ。
3. **validate** — 重複 · 期間矛盾 · 都道府県名 · 所定労働時間の欠落を検出。
4. **check** — 契約ごとに明示事項 · 期間上限 · 試用期間 · 最低賃金を確認。`needs_review` は社労士等へ。
5. **conversion-check** — 更新検討の時期（満了の2か月前目安）に実行し、申込権の発生 · 予告期限を確認。
6. **draft** — `draft --write` で通知書ドラフトを docs に生成 → 人間が賃金額 · 氏名を記入し交付 · 署名版は `records/`。

## 委譲

就業規則 · 36協定 → `jp_employment_rules` · 在留資格 → `jp_visa_employment` · 給与計算 → `jp_payroll` · 労働者派遣 → `staffing` · 社内決裁 → Secretary / REG-004

## 禁止

- 法令適合 · 雇止めや解雇の有効性（労契法16条 · 17条 · 19条）の断定 — 人間判断
- L2（賃金額 · 氏名 · 住所 · マイナンバー · 在留カード番号 · 口座 · 個人電話）を tracked MD · チャットへ転記
- 労働者への自動交付 · 行政機関への自動提出
- 未確認の最低賃金額を推測で追加すること（確認できない都道府県・期間は表に入れず `needs_review`）
