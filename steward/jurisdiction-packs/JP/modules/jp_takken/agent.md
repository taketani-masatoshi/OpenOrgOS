# JP Takken Module Agent（宅地建物取引業 · 免許・業務規制の点検支援）

**Catalog id:** `jp_takken` · **管轄:** Compliance Agent（proxy）· **法域:** JP のみ

## 役割

宅地建物取引業者としての **免許の更新期間** · **変更の届出期限** · **営業保証金 / 保証協会** · **事務所ごとの専任の宅地建物取引士（5人に1人）** · **宅建士証の有効期限** · **重要事項説明（35条）と37条書面の実施記録** · **報酬額の上限（報酬告示）** · **帳簿・従業者名簿・標識・報酬額の掲示** を、テナントの記録から決定論的に点検する。

出力は準備・点検支援であり **適法性を保証しない**。データにない事実や未実装の特例に依存する項目は `needs_review` を返す。最終判断 · 免許権者への申請・届出 · 依頼者への説明は人間（代表 · 専任の宅地建物取引士 · 顧問弁護士等）が行う。

## 正本（公表資料 · L0）

| 資料 | URL |
|------|-----|
| 宅地建物取引業法（昭和27年法律第176号） | https://laws.e-gov.go.jp/law/327AC1000000176 |
| 宅地建物取引業法施行令（昭和39年政令第383号） | https://laws.e-gov.go.jp/law/339CO0000000383 |
| 宅地建物取引業法施行規則（昭和32年建設省令第12号） | https://laws.e-gov.go.jp/law/332M50004000012 |
| 報酬告示（昭和45年建設省告示第1552号 · 最終改正 令和6年国土交通省告示第949号 · 令和6年7月1日施行） | https://www.mlit.go.jp/tochi_fudousan_kensetsugyo/const/content/001750143.pdf |
| 宅地建物取引業法の解釈・運用の考え方（国土交通省） | https://www.mlit.go.jp/totikensangyo/const/1_6_bt_000268.html |
| 同 令和6年7月改正の概要（空家等の報酬特例） | https://www.mlit.go.jp/tochi_fudousan_kensetsugyo/const/content/001750144.pdf |
| 仲介手数料の上限額（消費者向け · 国土交通省） | https://www.mlit.go.jp/totikensangyo/const/1_6_bf_000013.html |

一覧と確認日は `seed/sources.yaml.example`（2026-09-24 確認）。

## 実装ルール（条文対応）

| 点検 | ルール | 根拠 |
|------|--------|------|
| 免許権者 | 2以上の都道府県に事務所 → 国土交通大臣 · 1都道府県 → 当該知事（不一致は免許換え） | 法第3条第1項 · 第7条 |
| 有効期間 | 5年（起算日の応当日の前日に満了）| 法第3条第2項 · 民法第143条 |
| 更新申請 | 満了日の90日前から30日前まで（満了日から暦日で減算）· 申請後は処分まで従前の免許が有効 | 施行規則第3条 · 法第3条第4項 |
| 変更の届出 | 商号 · 役員等 · 事務所 · 専任宅建士の氏名の変更から30日以内（初日不算入） | 法第9条（第4条第1項第1号〜第5号） |
| 営業保証金 | 主たる事務所1,000万円 · その他の事務所ごと500万円 · 届出後に事業開始 | 法第25条 · 第26条 · 施行令第2条の4 |
| 保証協会 | 弁済業務保証金分担金 60万円 · 30万円/事務所 · 社員は営業保証金の供託不要 | 法第64条の9 · 第64条の13 · 施行令第7条 |
| 専任の宅建士 | 事務所の業務従事者の 1/5 以上（切上げ）· 抵触から2週間以内に補充 | 法第31条の3 · 施行規則第15条の5の3 |
| 宅建士証 | 有効期間5年 · 失効者は宅建士に当たらず専任に算入しない · 更新は申請前6月以内の法定講習 | 法第2条第4号 · 第22条の2 · 第22条の3 |
| 重要事項説明 | 契約成立までに宅建士が書面（記名）を交付して説明 · 宅建士証を提示 · 相手方が宅建業者なら書面交付のみ | 法第35条第1項・第4項〜第7項 |
| 37条書面 | 契約成立後 遅滞なく交付 · 宅建士が記名 | 法第37条 |
| 報酬 | 下表（整数円 · 税抜×100 で厳密計算し上限は1円未満切捨て） | 法第46条 · 報酬告示 |
| 報酬額の掲示 · 標識 | 事務所ごとに掲示 | 法第46条第4項 · 第50条第1項 |
| 従業者 | 従業者証明書の携帯 · 事務所ごとの従業者名簿（最終記載日から10年保存） | 法第48条 · 施行規則第17条の2 |
| 帳簿 | 事務所ごとに備付け · 事業年度末に閉鎖し5年（自ら売主の新築住宅は10年）保存 | 法第49条 · 施行規則第18条 |

### 報酬上限（報酬告示）

| 区分 | 上限（課税事業者 · 税込） | 告示 |
|------|---------------------------|------|
| 売買・交換の媒介（依頼者の一方ごと） | 税抜代金を 200万円以下 5% · 200万超400万以下 4% · 400万超 3% に区分して合計 × 1.1 | 第二 |
| 売買・交換の代理 | 媒介計算額の2倍（相手方からの報酬と合計） | 第三 |
| 低廉な空家等（税抜 800万円以下）の媒介 | 媒介に要する費用を勘案し 30万円 × 1.1 まで · **媒介契約時にあらかじめ説明・合意** | 第七 · 解釈・運用の考え方 |
| 低廉な空家等の代理 | 第七の額の2倍 | 第八 |
| 貸借の媒介 | 依頼者双方の合計で借賃1か月分 × 1.1 · 居住用は承諾なき限り一方から 0.5か月分 × 1.1 | 第四 |
| 貸借の代理 | 相手方との合計で借賃1か月分 × 1.1 | 第五 |
| 免税事業者 | 上記 × 100/110（税抜金額）+ 仕入れに係る消費税等相当額（税抜金額の0.04倍が限度）= 税抜 × 1.04 | 第十一② · 解釈・運用の考え方 第46条第1項関係 |

交換は価額に差があるとき多い方を基準とする。長期の空家等（第九・第十）· 非居住用の権利金（第六）の特例は **未実装** — 通常上限を超える場合は `needs_review`。

## データ

| パス | 内容 | 分類 |
|------|------|------|
| `data/takken/license.yaml` | 免許権者 · 免許証番号（公表）· 有効期間 · 更新申請日 · 変更届出 · 営業保証金 / 保証協会 | L1 |
| `data/takken/offices.yaml` | 事務所 · 業務従事者数 · 宅建士（`employee_id` · 専任 · 宅建士証の有効期限）· 掲示・帳簿の実施フラグ | L1 |
| `data/takken/transactions.yaml` | 取引（`deal_id` · 種別 · 媒介/代理 · 税抜価格・借賃 · 35条/37条の日付と担当 `employee_id` · 報酬受領額） | L1 |
| `data/takken/settings.yaml` | 消費税の課税区分 · 保存年数 | L1 |
| `data/takken/sources.yaml` | 公表 URL（任意 · seed と同期可） | L0 |
| `docs/takken/compliance-check-{as-of}.md` | `check --write` の点検レポート | L1 |
| `records/takken/` | 宅建士の氏名・登録番号・宅建士証写し · 従業者名簿本体 · 帳簿本体 · 当事者の氏名・住所 · 重要事項説明書・37条書面の本体 | **L2（gitignore）** |

L2 値（個人の住所 · 電話 · 口座 · 宅建士登録番号 等）は data / tracked MD に書かず、`employee_id` / `stakeholder_id` で参照する。

## 参照 SoT（読取）

| パス | 用途 |
|------|------|
| `data/real-estate-brokerage/deals.yaml`（`real_estate_brokerage`） | `deal_id` の存在照合のみ（読取専用）。deals は価格を持たないため、報酬上限は `transactions.yaml` の `price_yen` / `monthly_rent_yen` を正とする |
| `tenant.yaml`（jurisdiction） | JP 以外は `req-jp` が fail |

## CLI

```bash
npm run orgos -- --tenant demo operations takken show
npm run orgos -- --tenant demo operations takken validate
npm run orgos -- --tenant demo operations takken license --as-of 2026-09-24
npm run orgos -- --tenant demo operations takken staffing --as-of 2026-09-24
npm run orgos -- --tenant demo operations takken fee --kind sale --price 30000000
npm run orgos -- --tenant demo operations takken fee --kind sale --price 5000000 --low-cost-vacant
npm run orgos -- --tenant demo operations takken fee --kind lease --price 100000 --residential
npm run orgos -- --tenant demo operations takken fee --kind sale --price 10000000 --role agency --tax-status exempt
npm run orgos -- --tenant demo operations takken check --as-of 2026-09-24
npm run orgos -- --tenant demo operations takken check --as-of 2026-09-24 --write
```

`license` · `staffing` · `check` · `fee` は `--json` 対応。`check --write` のみ `docs/takken/` に書き込む（既定は標準出力）。

## ワークフロー

1. **免許** — `license.yaml` に免許証の記載（免許権者 · 番号 · 有効期間）を転記。`license` で更新申請期間と変更届出の期限を確認。
2. **事務所・宅建士** — `offices.yaml` に業務従事者数と宅建士（`employee_id`）を登録。`staffing` で 5人に1人と宅建士証の期限を確認。不足時は `takkenshi_shortage_since` を記録し2週間以内に補充。
3. **取引** — `transactions.yaml` に取引を登録。重要事項説明は契約日より前の日付で記録（同日は `needs_review`）。
4. **報酬** — `fee` で上限を確認してから請求。特例は媒介契約時の合意日（`special_fee_agreed_on`）を記録。
5. **点検** — `check` で取引 · 事務所の掲示・帳簿を点検。`fail` / `needs_review` は人間が是正・判断し、必要に応じ `check --write` で記録。
6. **提出** — 更新申請・変更届出は免許権者（都道府県 · 地方整備局）へ人間が提出。

## 委譲

免許申請書類の作成 · 行政への提出 → 人間（代表 · 行政書士）· 契約書・重要事項説明書の本文 → Contract（`real_estate_brokerage` の媒介台帳と連携）· 報酬の請求・計上 → Finance · 社内決裁 → Secretary / REG-004 · 賃貸住宅管理業法 → 対象外（関連法 · 別途）

## 対象外

- 免許申請書（新規 · 更新 · 免許換え）の作成・提出
- 重要事項説明書 · 37条書面の本文自動生成（`seed/templates/document-checklist.md.example` の記載事項チェックリストのみ）
- 長期の空家等（報酬告示 第九・第十）· 権利金（第六）の報酬特例 · 広告料の実費（第十一①ただし書）
- 専任宅建士の「成年者」要件 · 常勤性の判断（人間確認）
- 不動産特定共同事業法 · 賃貸住宅の管理業務等の適正化に関する法律（関連法）

## 禁止

- 点検結果をもって **適法** · **報酬請求可** と断定すること
- L2（宅建士・当事者の個人情報 · 口座）を tracked MD / チャットへ転記
- 免許権者への申請・届出の **自動送信**（人間提出のみ）
- 実在の法人名・免許証番号を seed / agent.md に記載（例示は「サンプル不動産株式会社」等の架空値）
