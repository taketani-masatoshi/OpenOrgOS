# 依存関係更新ガイド

正データ（`cursor/data/*.yaml`）や関連 docs を編集したあと、**下流の確認漏れを防ぐ**ための手順。

依存関係の定義は **`cursor/data/dependency-graph.yaml`**（Source of Truth）。

---

## いつ使うか

| 編集したもの | 例 |
|-------------|-----|
| 契約 | CTR-008/009 の金額・ステータス |
| 借入 | `loans.yaml` の残高 |
| 物件前提 | 亀沢の稼働率・運営コスト |
| 固定費 | `fixed-costs.yaml` |
| 計画・予実 | `yojitsu-fy2026.yaml` 等 |
| 公開情報 | `kamezawa-public.yaml` |

---

## 基本ワークフロー

```bash
# 1. YAML / docs を編集

# 2. 影響範囲を確認（チェックリスト）
npm run steward -- deps check --file cursor/data/contracts/CTR-008.yaml
# または
npm run steward -- impact cursor/data/properties/PROP-002.yaml

# 3. スキーマ検証 + 依存鮮度警告
npm run validate
npm run validate -- --deps    # ソースより古い下流 CSV/MD を警告

# 4. 下流を更新
npm run steward -- sync all   # docs/data/*.csv
npm run steward -- dashboard  # 経営ダッシュボード再生成

# 5. 再検証
npm run validate
```

Markdown で保存する場合:

```bash
npm run steward -- deps check --file cursor/data/plans/yojitsu-fy2026.yaml --markdown -o impact-yojitsu.md
```

---

## 代表的な依存チェーン

### 契約 ↔ 借入 ↔ 物件

```
CTR-009 ──→ loans.yaml (LOAN-002)
         ──→ PROP-002.acquisition_price (9,600万)
PROP-002 ──→ loans.yaml (financing フィールド)
```

### 亀沢運営前提 → 予実 → ダッシュボード

```
PROP-002.operating_costs ──→ yojitsu expense_kamezawa
fixed-costs ──→ expense-plan ──→ profit-plan
yojitsu + monthly + fixed-costs ──→ dashboard（バーンレート等）
```

### 計画 → 人向け CSV

```
revenue/expense/profit/investment-plan ──→ docs/data/*.csv  (steward sync all)
contracts/*.yaml ──→ 契約管理表.csv
```

### 保険契約 → 証券保管

```
CTR-013/014 (executed) ──→ docs/corporate/licenses/ 配下
                        ──→ document-io.yaml（inbox 処理）
```

### 亀沢公開情報 → ゲスト MD → 掲示 PDF

```
kamezawa-public.yaml ──→ docs/operations/lodging/templates/guest-facing/*.md
                      ──→ docs/outbox/lodging/
```

---

## 依存マップ全体を見る

```bash
npm run steward -- deps graph
npm run steward -- deps graph -o dependency-map.md
```

---

## グラフのメンテナンス

新しい連動関係が分かったら `cursor/data/dependency-graph.yaml` に **ノード** と **エッジ** を追加する。

- `reason`: 日本語で「なぜ更新が必要か」
- `action`: `review` | `sync` | `update` | `regenerate`
- `category`: `data→data`, `data→docs`, `contract→loan` 等

追加後:

```bash
npm test -- tests/deps.test.ts
npm run validate
```

---

## 自動同期しない理由

Steward は **チェックリスト** を出すだけ。数値の自動伝播は誤更新リスクが高いため、人間（または Cursor）が YAML を意図的に更新する。

`steward sync all` は YAML → CSV の一方向同期のみ。予実 ↔ 計画の数値整合は `deps check` のリストを見ながら手動で行う。
