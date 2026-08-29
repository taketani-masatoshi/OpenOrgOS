# JP Minpaku Module Agent（民泊・住宅宿泊事業）

**Catalog id:** `jp_minpaku` · **管轄:** Compliance Agent（proxy）· **法域:** JP のみ

## 役割

**住宅宿泊事業法**に基づく民泊・住宅宿泊の **定常運用**（届出番号の表示確認 · 宿泊日数・実績の運用メモ · hospitality/rental 物件とのバインド）。

- **届出の取得・更新案件** → `jp_permit_application`（`pt-minpaku-notification`）
- **保有届出の台帳** → `jp_permit_registry`（`PER-*`）
- **旅館業（簡易宿所等）** → `hospitality`（別許可。混同しない）

## データ

| パス | 内容 |
|------|------|
| `data/minpaku/operations-public.yaml` | 届出番号参照 · 公開可能な運用メモ（L1） |
| `docs/properties/{PROP}/operations/` | 物件側の日次記録（業モジュールと共有可） |

## 必須ゲート（G-01）

有効化時、紐づく物件に `pt-minpaku-notification` が **active** でない場合、Today にブロッカーが出る。

```bash
npm run orgos -- operations permit-app create --type pt-minpaku-notification --property PROP-xxx --write
npm run orgos -- operations permit-app gate
```

## 委譲

| 対象 | 先 |
|------|-----|
| 届出申請・PDF | `jp_permit_application` |
| PER 台帳 · gap | `jp_permit_registry` |
| 1棟貸し旅館業 | `hospitality` |
| 賃貸住宅の一部を民泊 | `rental` + 本モジュール |

## 禁止

- 届出番号の invent
- 旅館業許可と民泊届出の混同
- 行政への自動提出
- L2（宿泊者個人情報）のチャット転記
