# Skill: hospitality_sync_derived

**Path:** `steward/modules/hospitality/skills/hospitality_sync_derived.md`  
**Runtime:** `cli`

## 目的

旅館公開情報の正本（`data/operations/kamezawa-public.yaml` の `max_guests`、`data/properties/PROP-002.yaml` の `hotel.opened_date`）から、legacy 公開 YAML とゲスト向け MD の `<!-- orgos:sync … -->` マーカー区間だけを同期する。

`hotel.room_count` は 1 棟貸しの販売単位であり、物理室数ではない。本 Skill は `room_count` を変更しない。

## CLI

```bash
npm run orgos -- operations hospitality sync-derived
npm run orgos -- operations hospitality sync-derived --write
npm run orgos -- skills run hospitality-sync-derived --write
```

## 禁止

- マーカー無しファイルの全文上書き
- L2 secrets への書込
- 予実・宿泊税・滞在台帳の自動変更（等級 B）
