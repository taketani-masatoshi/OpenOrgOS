# JP Subcontractor Act Module Agent（中小受託取引適正化法 · 旧下請法 点検支援）

**Catalog id:** `jp_subcontractor_act` · **管轄:** Procurement Agent · **法域:** JP のみ

## 役割

「製造委託等に係る中小受託事業者に対する代金の支払の遅延等の防止に関する法律」（通称 **中小受託取引適正化法 · 取適法**。旧 下請代金支払遅延等防止法 · 令和7年法律第41号で改正 · **2026-01-01 施行**）に沿って、自社が **委託事業者** となる取引の **適用対象判定** · **委託事業者の義務** · **データで検出できる禁止行為** を点検し、**遅延利息** を試算する。出力は準備・点検支援のみで法令適合を保証しない。最終判断 · 是正 · 行政対応は人間（購買責任者 · 法務 · 顧問弁護士）。

## 正本（公表資料 · L0）

| 資料 | URL |
|------|-----|
| 取適法（e-Gov 法令検索） | https://laws.e-gov.go.jp/law/331AC0000000120/ |
| 第2条第8項第1号の情報成果物及び役務を定める政令 | https://laws.e-gov.go.jp/law/413CO0000000005 |
| 第6条の率を定める規則（年14.6%） | https://laws.e-gov.go.jp/law/507M60200000009 |
| 第7条の書類等の作成及び保存に関する規則（2年） | https://laws.e-gov.go.jp/law/507M60200000010 |
| 法令・ガイドライン等（公正取引委員会） | https://www.jftc.go.jp/toriteki/legislation/ |
| 運用基準 | https://www.jftc.go.jp/toriteki/legislation/unyou.html |
| 施行に当たり御留意いただきたい事項 | https://www.jftc.go.jp/toriteki/toriteki_ryuijiko/ |
| よくある質問（取適法） | https://www.jftc.go.jp/toriteki/torireki_qa.html |
| 中小受託取引適正化法テキスト | https://www.jftc.go.jp/toriteki/r7text.pdf |

取得日付きの一覧は `seed/sources.yaml.example`。

## データ

| パス | 内容 | 分類 |
|------|------|------|
| `data/procurement/subcontract/settings.yaml` | 自社の資本金 · 常時使用する従業員数 · 時点 | L1 |
| `data/procurement/subcontract/subcontract-parties.yaml` | `vendor_id` → 受託側の資本金 · 従業員数 · 時点（名称は持たない） | L1 |
| `data/procurement/subcontract/transactions.yaml` | 発注 · 明示 · 受領 · 支払期日 · 支払 · 支払手段 · 減額 · 返品 · 有償支給 · イベント · 記録保存 | L1 |
| `data/procurement/subcontract/sources.yaml` | 一次資料 URL（任意 · seed と同期可） | L0 |
| `docs/procurement/subcontract/check-{as-of}.md` | `check --write` の点検レポート | L1 |
| `records/procurement/subcontract/` | 発注書面 · 7条記録の原本、個人事業者の住所 · 口座 · 個人電話 | **L2（gitignore 必須）** |

個人事業者の氏名 · 住所 · 口座等は tracked YAML に書かず、`vendor_id` / `stakeholder_id` で参照する。

## 参照 SoT（読取）

| パス | 用途 |
|------|------|
| `data/procurement/vendors.yaml` | 受託先マスタ（`vendor_id` の照合のみ · 重複保持しない） |
| `tenant.yaml` | 法域（JP 以外は `req-jp` が fail） |

## CLI

```bash
npm run orgos -- --tenant demo operations subcontract show
npm run orgos -- --tenant demo operations subcontract validate
npm run orgos -- --tenant demo operations subcontract scope
npm run orgos -- --tenant demo operations subcontract scope --transaction SC-2026-003 --json
npm run orgos -- --tenant demo operations subcontract check --as-of 2026-09-24
npm run orgos -- --tenant demo operations subcontract check --as-of 2026-09-24 --write
npm run orgos -- --tenant demo operations subcontract late-interest --transaction SC-2026-002 --as-of 2026-09-24
```

## 判定ルール（実装）

| ルール | 条文 | 判定 |
|------|------|------|
| 取引類型 | 法第2条第1項〜第6項 | 製造 · 修理 · 情報成果物作成 · 役務提供 · **特定運送（新設）**。建設工事の下請負（第2条第4項括弧書）は対象外 |
| 資本金基準（製造 · 修理 · 特定運送 · プログラム · 運送 · 倉庫保管 · 情報処理） | 第2条第8項第1号・第2号 | 委託側 3億円超 → 受託側 3億円以下（個人含む）/ 委託側 1千万円超3億円以下 → 受託側 1千万円以下 |
| 資本金基準（その他の情報成果物 · 役務） | 第2条第8項第3号・第4号 | 5千万円超 → 5千万円以下 / 1千万円超5千万円以下 → 1千万円以下 |
| 従業員基準（新設 · 資本金基準に該当しない場合） | 第2条第8項第5号・第6号 | 常時使用する従業員 300人（上記政令指定区分）/ 100人（その他の情報成果物 · 役務）。委託側 超 → 受託側 以下 |
| 発注内容等の明示 | 第4条第1項・第2項 | 未明示 = fail · 発注日後の明示 = needs_review（「直ちに」）· 電磁的明示後の書面請求未対応 = needs_review |
| 支払期日 | 第3条 | 受領日を算入して60日以内（上限 = 受領日 + 59日）。未設定 / 超過 = fail（みなし支払期日を表示） |
| 手形払等の禁止 | 第5条第1項第2号 | 手形 = fail · 電子記録債権 / 一括決済は満期日 > 支払期日 または 受託側手数料負担で fail、満期日不明は needs_review |
| 支払遅延 | 第5条第1項第2号 | みなし支払期日後の支払（手形は満期日）= fail |
| 減額 | 第5条第1項第3号 | 受託側の責めによらない減額 = fail · 責めによる減額 = needs_review |
| 返品 | 第5条第1項第4号 | 役務 · 特定運送は対象外。責めによらない返品 = fail · 責めによる返品 = needs_review |
| 有償支給原材料等の早期決済 | 第5条第2項第1号 | 支払期日前の決済 = needs_review（責めの有無は事実認定） |
| 受領拒否 · 買いたたき · 購入強制 · 報復 · 利益提供要請 · 変更やり直し · **協議に応じない一方的な代金決定（新設）** | 第5条第1項第1号・第5号〜第7号、第2項第2号〜第4号 | `events` に記録があれば needs_review、なければ `not_assessed`（自動 pass しない） |
| 記録の作成 · 保存 | 第7条 · 記録規則第3条 | 全部記録した日から2年。保存期限不足 = fail · 未記録 = needs_review |
| 遅延利息 | 第6条第1項・第2項 · 率規則 | 年14.6%。支払遅延は受領日から60日経過日〜支払日、減額は減額日と60日経過日の遅い方〜返還日 |

**遅延利息の計算方針:** 開始日と支払日の両端を算入 · 年365日固定（閏年も同じ）· 円未満切捨て（円未満端数の扱いは Q&A Q98 に準じる）。手形は満期日を支払日として扱う（Q&A Q83）。電子記録債権 · 一括決済の満期日基準は手形の扱いを準用し needs_review を付す。未払は `--as-of` までの暫定額。

**施行日前（2025-12-31 以前）の発注:** 公正取引委員会「御留意いただきたい事項」のとおり、取適法の規定（禁止行為等 · 手形払禁止を含む）は 2026-01-01 以降に発注する取引に適用され、それ以前の発注は令和7年法律第41号附則により旧下請法の例による部分がある。本モジュールは **旧法を自動適用せず、`legacy-order` として needs_review** を返す（scope · check とも）。

## ワークフロー

1. **自社規模** — `settings.yaml` に資本金 · 常時使用する従業員数（賃金台帳ベース）を時点付きで登録
2. **受託側規模** — 発注前に受託先へ資本金 · 従業員数を確認し `subcontract-parties.yaml` に `vendor_id` で登録
3. **取引登録** — 発注ごとに `transactions.yaml` へ明示日 · 受領日 · 支払期日 · 支払手段を記録。価格協議の求め等は `events` に記録
4. **点検** — `validate` → `scope` → `check --as-of`。`fail` / `needs_review` / `not_assessed` を人間が確認
5. **是正** — 遅延 · 減額は `late-interest` で試算し、支払 · 返還は Finance に依頼
6. **保存** — 7条記録の原本は `records/`（L2）に保管し、`records_retained_until` を記録

## 委譲

支払実行 · 遅延利息の支払 → Finance（`orgos broker transfer`）· 契約書 · 取引基本契約 → Contract · 社内決裁 → Secretary / REG-004 · 法令解釈 · 違反の疑い → Compliance / 顧問弁護士

## 対象外

- 公正取引委員会 · 中小企業庁の報告徴収 · 立入検査 · 勧告への対応（第12条等）
- 建設工事の下請負（建設業法の規律）
- 親会社の支配を受ける会社の再委託のみなし規定（第2条第10項）の自動判定
- 受託中小企業振興法 · 独占禁止法（優越的地位の濫用）の判定

## 禁止

- 法令適合 · 適用対象外の **断定**（出力は点検支援）
- 公正取引委員会 · 中小企業庁への **自動報告 · 自動提出**
- L2（個人事業者の住所 · 口座 · 個人電話 · マイナンバー）を tracked YAML / MD / チャットへ転記
