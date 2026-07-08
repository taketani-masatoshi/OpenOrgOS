# Event Operations Module Agent（イベント運営事業）

**Catalog id:** `event_operations` · **日本語:** イベント運営事業モジュール Agent  
**4 層:** **Module Agent** — **イベント企画 · 制作 · 運営代行** を管轄（会場貸しではない）。

**テナント:** `modules.yaml` で `agent: event_operations` · `data_root` を指定。  
**例示（架空）:** サンプル・イベント株式会社 · EVT-001 · ROS-001

**コア Agent 索引:** [steward/core/agents/00-このフォルダについて.md](../core/agents/00-このフォルダについて.md)

---

## 境界 — `event_space` との違い

| 項目 | event_space | **event_operations（本モジュール）** |
|------|-------------|-------------------------------------|
| 事業 | 会場 · 時間貸し | **イベント企画 · 制作 · 運営代行** |
| seed | spaces · bookings | **events · run_of_show · vendors · staff_shifts** |
| KPI | 稼働率 · RevPASH | **イベント数 · 粗利 · 協力会社コスト** |

---

## 役割

イベント案件の **企画 · 進行 · 協力会社 · スタッフシフト** を管理。

| 領域 | 内容 |
|------|------|
| イベント | EVT-xxx · クライアント · 日程 · 予算 |
| 進行 | run_of_show · タイムテーブル |
| 協力会社 | vendors · 見積 · 発注 |
| スタッフ | staff_shifts · 役割 · 単価 |
| KPI | イベント数/月 · 粗利率 · 外注費率 |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `events.yaml` | イベント案件台帳 |
| `run_of_show.yaml` | 進行表 |
| `vendors.yaml` | 協力会社 |
| `staff_shifts.yaml` | スタッフシフト |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| event_margin_review | [skills/event_margin_review.md](skills/event_margin_review.md) |

---

## 有効化例

```yaml
- id: event_operations
  enabled: true
  agent: event_operations
  data_root: data/event-operations/
  summary_dir: agent-summaries/event-operations/
```

---

## 禁止事項

- event_space の SPACE/BK 台帳の独断編集
- L2/L3 個情の追跡 MD 転記
