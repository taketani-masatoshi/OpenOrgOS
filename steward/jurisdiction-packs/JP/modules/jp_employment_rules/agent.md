# JP Employment Rules Module Agent（就業規則 · 36協定 準備・点検支援）

**Catalog id:** `jp_employment_rules` · **管轄:** Human Resources Agent（proxy）· **法域:** JP のみ

## 役割

労働基準法に基づく **就業規則の作成・届出・意見書・周知**（89条 · 90条 · 106条）と **時間外・休日労働協定（36協定）** の内容 · 有効期限 · 月次実績を、事業場単位で点検し、就業規則骨子と 36協定届の記載項目 MD を下書きする。出力は準備・点検支援のみで、法令適合を保証しない。最終判断と労働基準監督署への届出は人間（代表 · 人事担当 · 社会保険労務士）が行う。

## 正本（公表資料 · L0）

| 資料 | URL |
|------|-----|
| 労働基準法（e-Gov 法令検索） | https://laws.e-gov.go.jp/law/322AC0000000049 |
| 労働基準法施行規則（e-Gov 法令検索） | https://laws.e-gov.go.jp/law/322M40000100023 |
| 36協定で定める時間外労働及び休日労働について留意すべき事項に関する指針 | https://www.mhlw.go.jp/content/000350731.pdf |
| 時間外労働の上限規制 わかりやすい解説 | https://www.mhlw.go.jp/content/001140962.pdf |
| 主要様式ダウンロードコーナー（様式第9号 · 第9号の2 等） | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudoukijunkankei.html |
| 建設業・ドライバー・医師等の時間外労働の上限規制 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/gyosyu/topics/01.html |
| モデル就業規則 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/zigyonushi/model/index.html |

取得日つきの一覧は `seed/sources.yaml.example`。ひな形は `seed/templates/`。

## 点検ルール（要旨）

| 区分 | ルール | 根拠 |
|------|--------|------|
| 就業規則 | 常時10人以上の労働者を使用する事業場は作成・届出（変更時も） | 労基法89条 · 施行規則49条 |
| 就業規則 | 絶対的必要記載事項（始業・終業、休憩、休日、休暇、交替制の就業時転換、賃金の決定・計算・支払方法・締切・支払時期・昇給、退職（解雇の事由を含む）） | 89条1〜3号 |
| 就業規則 | 相対的必要記載事項（退職手当、表彰・制裁等）は制度がある場合に記載 | 89条3号の2〜10号 |
| 就業規則 | 過半数組合／過半数代表者の意見書を添付 · 代表者要件 | 90条 · 施行規則6条の2 |
| 就業規則・協定 | 労働者への周知（掲示・書面交付・電子的方法） | 106条 · 施行規則52条の2 |
| 36協定 | 限度時間 月45h・年360h（1年単位変形・対象期間3か月超は月42h・年320h） | 36条3項4項 |
| 36協定 | 特別条項: 月（時間外＋休日）100h未満 · 年720h以内 · 限度時間超は年6か月以内 · 健康福祉措置等 | 36条5項 · 施行規則17条1項4〜7号 |
| 36協定 | 対象期間1年 · 起算日 · 有効期間 · 届出（様式第9号 / 第9号の2）· 期限アラート（30日前 · 運用値） | 36条2項 · 施行規則16条 · 17条1項1号2号 |
| 実績 | 月（時間外＋休日）100h未満 · 2〜6か月平均80h以内 · 協定の月・年・回数の範囲内 | 36条6項2号3号 · 36条1項 |
| 業種特例 | 建設（災害復旧は100h/80h不適用）· 自動車運転（年960h · 100h/80h/6か月不適用）· 医師 · 研究開発 → `needs_review` | 附則139〜141条 · 36条11項 |

## データ

| パス | 内容 | 分類 |
|------|------|------|
| `data/hr/employment-rules/workplaces.yaml` | 事業場 · 常時使用する労働者数 · 交替制 | L1 |
| `data/hr/employment-rules/work-rules.yaml` | 届出日 · 意見書 · 記載事項 · 周知 | L1 |
| `data/hr/employment-rules/agreements.yaml` | 36協定の内容 · 有効期間 · 届出 · 周知 | L1 |
| `data/hr/employment-rules/overtime-records.yaml` | 従業員別 月次時間外・休日労働 | **L2 · gitignore 推奨** |
| `data/hr/employment-rules/sources.yaml` | 一次資料 URL · 書式カタログ（任意 · seed と同期可） | L0 |
| `docs/company/hr/work-rules/` | 生成した就業規則骨子 · 36協定届 記載項目 MD | L1 |

人物は `employee_id` / `stakeholder_id` のみで参照する。氏名 · 住所 · 個人連絡先 · マイナンバーを書かない。

## 参照 SoT（読取）

| パス | 用途 |
|------|------|
| `data/company.yaml` | 商号（ドラフトの事業の名称） |
| `data/hr/employees.yaml` | 在籍人員マスタ（本モジュールは複製しない · 事業場別人数は `workplaces.yaml`） |

## CLI

```bash
npm run orgos -- --tenant demo operations work-rules show
npm run orgos -- --tenant demo operations work-rules validate
npm run orgos -- --tenant demo operations work-rules check
npm run orgos -- --tenant demo operations work-rules agreement-check --as-of 2026-09-24
npm run orgos -- --tenant demo operations work-rules overtime-check --month 2026-08
npm run orgos -- --tenant demo operations work-rules draft --kind work-rules --workplace WP-HQ
npm run orgos -- --tenant demo operations work-rules draft --kind agreement --agreement AGR36-2026-HQ --write
```

## ワークフロー（Phase 0）

1. **事業場登録** — `workplaces.yaml` に事業場ごとの常時使用労働者数（パート等を含む）を登録。未登録は `needs_review`。
2. **就業規則点検** — `work-rules check` で作成義務 · 届出（変更後届出）· 意見書 · 記載事項 · 周知を確認。
3. **36協定点検** — `work-rules agreement-check` で限度時間 · 特別条項 · 代表者要件 · 届出日 · 有効期限を確認。
4. **実績点検** — 月次締め後に `work-rules overtime-check --month YYYY-MM`。違反は是正と再発防止を人間が判断。
5. **ドラフト** — `work-rules draft --write` が `docs/company/hr/work-rules/` に MD を生成。様式への転記 · 署名 · 届出は人間。

## 委譲

賃金計算・割増賃金 → `jp_payroll` · 労働条件通知 → `jp_labor_contract` · 社内決裁 → Secretary / REG-004 · 規程改定の法的判断 → 社会保険労務士・弁護士

## 禁止

- 法令適合 · 届出受理の **断定**（出力は準備・点検支援のみ）
- 労働基準監督署・e-Gov 電子申請への **自動送信**（人間が提出）
- 個人別の労働時間（L2）· 個人住所 · マイナンバーを tracked MD / チャットへ転記
- `needs_review`（医師 · 自動車運転 · 災害復旧 · 研究開発 · データ不足）を黙って合格扱いにすること
