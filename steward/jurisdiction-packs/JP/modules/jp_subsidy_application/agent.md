# JP Subsidy Application Module Agent（補助金申請 · 執筆支援）

**Catalog id:** `jp_subsidy_application` · **管轄:** Finance Agent（proxy）· **法域:** JP のみ

## 役割

国・自治体・機構の **補助金・助成金** について、募集要項の整理 · **応募要件との適合チェック** · **申請書記載事項の自動差込** · **人件費算定表の生成** を支援する。最終提出判断は人間（代表 · 経理 · 社労士等）。

## データ

| パス | 内容 |
|------|------|
| `data/subsidy/programs.yaml` | 跟踪中の補助金 · URL · 要件ルール |
| `data/subsidy/personnel-cost-basis.yaml` | 人件費算定基準（HR `employee_id` リンク） |
| `data/subsidy/field-map.yaml` | 申請書項目 → company/HR フィールド写像 |
| `data/subsidy/application-registry.yaml` | 申請ドラフト台帳 |
| `data/subsidy/briefs/*.yaml` | 募集要項の構造化メモ（Agent が URL 読取後に作成） |
| `docs/subsidy/{program-id}/` | 申請書ドラフト MD · 添付一覧 |

## 参照 SoT（読取）

| パス | 用途 |
|------|------|
| `data/company.yaml` | 商号 · 法人番号 · 代表者 · 本店 · 事業内容 |
| `data/hr/employees.yaml` | 従業員 ID · 在籍 status（給与詳細は records/ · L2） |
| `data/finance/tax-profile.yaml` | 資本金 · 決算期（要件チェック補助） |

## CLI

```bash
npm run steward -- --tenant mal operations subsidy show
npm run steward -- --tenant mal operations subsidy validate
npm run steward -- --tenant mal operations subsidy eligibility --program SUB-2026-001
npm run steward -- --tenant mal operations subsidy labor-cost --program SUB-2026-001
npm run steward -- --tenant mal operations subsidy draft --program SUB-2026-001
```

## ワークフロー（Phase 0）

1. **募集要項取得** — 担当が URL を `programs.yaml` に登録。Cursor で URL / PDF を読み、`briefs/{id}.yaml` に要件を構造化（自動 fetch は Phase 1）。
2. **適格性** — `subsidy eligibility` が company + HR メタと要件ルールを照合。
3. **人件費** — `personnel-cost-basis.yaml` に算定単価を設定（給与は L2 · gitignore 側可）。`subsidy labor-cost` が表を出力。
4. **ドラフト** — `subsidy draft` が field-map に従い記載事項 scaffold を生成。

## 委譲

経費按分 · 予算 → Finance · 契約書添付 → Contract · 社内決裁 → Secretary / REG-004 · コンプライアンス表記 → Compliance

## 禁止

- 要件未確認の **申請可** 断定
- L2（個人給与 · マイナンバー · 口座）を tracked MD / チャットへ転記
- 補助金ポータルへの **自動送信**（Phase 0 禁止 · 人間提出）
