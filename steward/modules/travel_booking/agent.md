# 旅費・旅行手配モジュール（travel_booking）

Steward OS **総務・出張手配** モジュール。Operations Agent · `travel_booking` Skill と連携する。

## スコープ

| 含む | 含まない |
|------|---------|
| ヒアリング必須項目の検証（CLI） | 決済・予約確定の自動実行 |
| 手配ドラフト MD 生成 | カード情報の保持 |
| 旅行ポータル索引（login_id のみ） | 精算・出張報告書（Finance） |
| REG-008 宿泊上限チェック | 私用旅行 |

## データ（テナント bind）

| 論理パス | 内容 |
|---------|------|
| `data/operations/travel-portals.yaml` | ポータル URL · login_id（**gitignore**） |
| `docs/operations/travel-drafts/**` | 手配ドラフト（**gitignore**） |
| `docs/company/regulations/ryohi-kisoku.md` | REG-008 旅費規程 |

```bash
cp data/operations/travel-portals.yaml.example data/operations/travel-portals.yaml
# login_id のみ記入 · パスワードはブラウザセッション
```

## CLI（Phase 1）

```bash
npm run steward -- operations travel portals
npm run steward -- operations travel intake \
  --portal rakuten-travel --destination 大阪 --area 新大阪駅周辺 \
  --check-in 2026-06-23 --check-out 2026-06-24 --guests 1
npm run steward -- operations travel check --budget 12000
npm run steward -- operations travel draft ... --write
```

browser 手順は **cursor-only**（`steward/core/skills/travel_booking.md`）。CLI は intake 検証と draft 骨格生成。

## Agent 連携

- **Operations** — browser 手配 · draft 完成 · 規程チェック
- **Secretary** — 決済後カレンダー（`type: travel`）
- **Finance** — 事後精算

## 禁止

- 決済ボタン押下 · L2/L3 値の tracked 出力
- 規程上限超過を承認なしで「推奨」

## 関連

- Skill: [steward/core/skills/travel_booking.md](../../core/skills/travel_booking.md)
- 規程: REG-008（テナント `docs/company/regulations/`）
