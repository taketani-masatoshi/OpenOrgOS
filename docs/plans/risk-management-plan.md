# リスク管理計画

**版:** 2026-06-07 · **対象:** 株式会社 MAL 全社

## 目的

全社リスクを登録・評価・対応・モニタリングし、P0 事項の早期解消と経営判断の材料を提供する。

## 管理対象

- 戦略・財務・法務・運用・物件リスク
- P0/P1/P2 優先度

## 必要な入力情報

- `docs/corporate/executive-remaining-tasks.md`
- 各下位計画のリスク欄
- `cursor/data/contracts/`（draft 一覧）
- `npm run steward -- alerts`

## 出力すべき情報

- リスク登録簿（下表）
- 月次リスクレポート
- P0 エスカレーション

## KPI

| KPI | 目標 |
|-----|------|
| 高リスク（深刻度≥4）未対応 | 0 件 |
| P0 平均解消日数 | ≤7 日 |
| 保険カバー率（物件） | 100% |
| リスクレビュー実施 | 月次 100% |

## 関連フォルダ

- `docs/plans/risk-management-plan.md`
- `docs/plans/properties/*/risk-plan.md`
- `docs/corporate/executive-remaining-tasks.md`

## 担当エージェント

- **主:** Executive Steward
- **実務:** Compliance · Contract · Finance · 物件エージェント

## 更新頻度

- 登録簿: 随時 · 棚卸 月次
- レポート: 月次

## リスク

- 登録簿の陳腐化 · 実務 P0 と docs 乖離

---

## リスク登録簿

| ID | リスク | 深刻度 | 可能性 | 対応 | 状態 | 担当 |
|----|--------|--------|--------|------|------|------|
| R-001 | CTR-013/014 火災保険未加入 | 5 | 4 | 加入パケット申込 | **P0 未了** | Contract |
| R-002 | cash-balance / B/S TBD | 5 | 5 | 残高入力・税理士共有 | **P0 未了** | Finance |
| R-003 | 亀沢低稼働 | 4 | 3 | 稼働率計画・OTA 施策 | 開業前 | Hospitality |
| R-004 | CTR-011 賃貸借 draft | 3 | 4 | 借主確定・締結 | P1 | Contract |
| R-005 | CTR-012 清掃 draft | 3 | 4 | 委託締結 | P1 | Contract |
| R-006 | 役員貸付 1.126 億 CF 依存 | 3 | 2 | 返済シナリオ · DSCR | 監視中 | Finance |
| R-007 | サービス収益未計上 | 2 | 3 | 中期計画で数値化 | 計画中 | Executive |
| R-008 | secrets 漏洩 | 5 | 2 | アクセス境界 · 転記禁止 | 運用中 | Compliance |

**深刻度:** 1（低）〜5（高） · **可能性:** 1（低）〜5（高）

---

## エスカレーション

1. 深刻度≥4 かつ P0 → Executive 即時
2. 保険・許認可 → Compliance 連携
3. CF 関連 → Finance + `liquidity-crisis-plan.md`

## 正データ参照

- `cursor/data/contracts/CTR-013.yaml` · `CTR-014.yaml`（status: draft）
- `cursor/data/finances/cash-balance.yaml`
- `cursor/data/finances/loans.yaml`

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-06-07 | 初版 — executive-remaining-tasks から起稿 |
