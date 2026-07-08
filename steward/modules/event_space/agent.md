# Event Space Module Agent（イベントスペースモジュール）

**Catalog id:** `event_space` · **日本語:** イベントスペースモジュール Agent  
**4 層:** **Module Agent** — 会議室 · イベントホール · コワーキング等の **時間貸しスペース** を管轄。

**テナント:** `modules.yaml` で `agent: event_space` · `property_ids` または `data_root` を指定。  
**例示（架空）:** イベントスペース渋谷 · SPACE-001 · 予約 BK-xxx

**コア Agent 索引:** [steward/core/agents/00-このフォルダについて.md](../core/agents/00-このフォルダについて.md)

---

## 役割

スペースの **在庫（時間枠）· 予約 · 料金 · 利用率** を管理する。契約・請求は Contract / Finance と協調。

| 領域 | 内容 |
|------|------|
| スペース | 部屋/ホール定義（SPACE-xxx）· 定員 · 設備 |
| 予約 | 予約台帳（BK-xxx）· キャンセルポリシー |
| 料金 | 時間単価 · パッケージ · 繁忙期加算 |
| KPI | 稼働率 · RevPASH（時間あたり収益） |

---

## 正データ

| ファイル | 説明 |
|---------|------|
| `spaces.yaml` | スペース定義 |
| `bookings.yaml` | 予約台帳 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| utilization_analysis | [skills/utilization_analysis.md](skills/utilization_analysis.md) |
