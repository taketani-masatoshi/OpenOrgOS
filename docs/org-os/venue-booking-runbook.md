# Venue Web Booking Runbook

**チャネル:** `venue_booking`（**Wire ではない**）  
**ADR:** [0009-venue-web-booking-channel.md](../adr/0009-venue-web-booking-channel.md)  
**CLI:** `orgos operations venue …`

## なぜ Wire と分けるか

| | Wire | venue_booking |
|--|------|---------------|
| 相手 | 組織 peer | 予約サイト / 人手 |
| 正本 | protocol transactions | `venue-reservations.yaml` |
| 信頼 | DID · witness · approve | CEO internal APR · external_ref |
| 実装 | `src/lib/protocol/` | `src/lib/venue-booking/` |

## P0 フロー（本番推奨の骨格）

1. Secretary: 対面場所が固まると `operations venue reserve --case SCH-… --venue VENUE-001`
2. Adapter が深リンク / 検索 URL を返す（スクレイピングしない）
3. 人がサイトで予約し、予約番号を得る
4. `org approval propose`（scope=internal · subject_ref=VR-…）→ CEO approve
5. `operations venue confirm --id VR-… --external-ref … --approval-id APR-…`
6. scheduling-case に `venue_reservation_id` が残る

デモのみ: `--allow-unapproved`（本番正経路にしない）

## コマンド早見

```bash
npm run orgos -- operations venue providers
npm run orgos -- operations venue catalog
npm run orgos -- operations venue search --venue VENUE-001 --provider hotpepper_deep_link
npm run orgos -- operations venue reserve \
  --case SCH-2026-001 --venue VENUE-001 --provider hotpepper_deep_link --request-id demo-1
npm run orgos -- operations venue confirm \
  --id VR-2026-001 --external-ref HP-XXXX --approval-id APR-…
npm run orgos -- operations venue list --json
```

## テナント初期化

```bash
cp steward/modules/venue_booking/seed/venue-providers.yaml.example \
  tenants/{id}/data/operations/venue-providers.yaml
cp steward/modules/venue_booking/seed/venue-catalog.yaml.example \
  tenants/{id}/data/operations/venue-catalog.yaml
# modules.yaml で venue_booking: enabled: true
```

## 交通便に基づく会場提案

```bash
orgos operations venue suggest --case SCH-… --timing evening
```

正本: `data/operations/party-locations.yaml`（**駅・エリアの L1 のみ**）。自社 `self_company` · 相手 `email_domains` / `org_hint` · 任意で帰宅最寄 `home_commute`。  
個人の番地住所は Zone C（L2）に置き、CLI 出力・社外文・チャットに出さない。スコアは駅クラスタ間の決定論テーブル（外部 Maps API なし）。

---

## 禁止

- LLM ブラウザ予約を本番正経路にする
- Wire / `protocol notice` に店舗予約を載せる
- API キーを tracked YAML に書く（L2 · records）

## サービス調査

媒体別の API / 深リンク可否: [venue-booking-providers-survey.md](venue-booking-providers-survey.md)
