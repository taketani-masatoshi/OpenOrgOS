# Venue Web Booking — 予約サービス洗い出し（調査メモ）

**Date:** 2026-07-12  
**Channel:** `venue_booking`（Wire ではない）  
**目的:** 会食・対面の **Web 予約可能なサービス** を列挙し、公式 API / 提携 / 深リンク可否を整理する。  
**実装方針:** スクレイピング・LLM ブラウザ操作は本番正経路にしない。公式 API → 提携 → 深リンク → 人手配の順。

関連: [venue-booking-runbook.md](venue-booking-runbook.md) · [ADR 0009](../adr/0009-venue-web-booking-channel.md)

---

## 1. 判定凡例

| 記号 | 意味 |
|------|------|
| **Search** | 店舗・条件検索 API |
| **Avail** | 日時・人数の空き照会 API |
| **Book** | 仮押さえ / 確定 / キャンセル API |
| **Deep** | 公式または安定した検索・店舗 URL（人が予約） |
| **Gate** | キー取得のみ / 法人審査 / 店舗側契約が必要 |

推奨接続度: **A** 実装候補 · **B** 提携後 · **C** 深リンクのみ · **D** 対象外（人手配）

---

## 2. 国内グルメメディア（消費者向け）

| ID（案） | サービス | Search | Avail | Book | Deep | 推奨 | 所見 |
|----------|----------|--------|-------|------|------|------|------|
| `hotpepper_gourmet_search` | ホットペッパーグルメ | ○ 公開 | △ 情報項目のみ | × 公開なし | ○ | **A（検索）/ C（予約）** | リクルート WEB サービスで **グルメサーチ等は無料キー可**。クレジット表示義務。**予約確定 API は一般公開なし**。飲食店から対価を得るビジネス用途はガイドラインで制限あり。店舗ページ URL は深リンク可。 |
| `hotpepper_deep_link` | （同上 · 深リンク） | — | — | — | ○ | **C（実装済）** | P0/P1 済み。人が予約 → `confirm --external-ref`。 |
| `tabelog_deep_link` | 食べログ | × 公開予約 API | × | ×（B2B 店舗側） | ○ | **C（実装済）** | 消費者向け公開予約 API なし。店舗は「食べログノート」· サイトコントローラー連携が主。スクレイピング禁止。 |
| `gnavi_search` | ぐるなび API（情報） | ○ 法人 | △ 空席情報あり（商品による） | — | ○ | **B** | [ぐるなび API](https://solution.gnavi.co.jp/service/gnavi_api/) は法人向け。日本語版 Ver3 で空席等の動的データ。**3ヶ月トライアル**（予約 API 除く）。配信サービスの法人格が条件。 |
| `gnavi_reserve` | ぐるなび 席のみ予約 API | — | ○ | ○（条件付き） | — | **B（最有力の国内 Book）** | **席のみ予約 API Ver1**（登録 / ライト or スタンダードで確認・キャンセル）。利用条件・問い合わせ必須。OrgOS の `hold`/`confirm`/`cancel` に最も近い。 |
| `retty` | Retty | × 公開予約 | × | × | ○ | **C/D** | Web 予約ありだが公開 API なし。口コミデータは Food Data Platform（予約ではない）。 |
| `ikyu_restaurant` | 一休.com レストラン | × | × | × | ○ | **C** | 高価格会食向き。公開 API なし（社内 GraphQL のみ）。深リンク + 人手配。 |
| `ozmall` | OZmall レストラン | × | × | × | ○ | **C** | デート・記念日系。公開 API 未確認 → 深リンク想定。 |
| `hitosara` | ヒトサラ | × | × | × | ○ | **C/D** | 料理人・コース中心。公開予約 API なし。 |
| `pocket_concierge` | ポケットコンシェルジュ | × | × | × | ○ | **C** | 高級店・事前決済。公開 API なし。会食グレードが高い店が多い。 |
| `epark` | EPARK レストラン予約等 | × 一般 | × | × | ○ | **C/D** | 領域により API 提携あるが、汎用公開は限定的。要個別確認。 |
| `yahoo_gourmet` / PayPay グルメ | Yahoo!/PayPay グルメ | × | × | × | ○ | **C/D** | 消費者 Web 予約あり。第三者向け予約 API は非公開。 |

### ホットペッパー（重要）

- ドキュメント: https://webservice.recruit.co.jp/doc/hotpepper/
- **できること:** 店舗検索 · エリア · 予算 · ジャンル · 店舗 URL 取得
- **できないこと（公開範囲）:** ネット予約の仮押さえ・確定・キャンセル
- OrgOS マッピング: `checkAvailability` ≈ 店舗候補検索 / `hold`=`pending_manual`+店舗 URL / `confirm`=人手 `external_ref`

### ぐるなび（重要）

- 情報 API と **予約 API が別商品**
- 予約 API は「席のみ」中心 · 会員システム・問い合わせ窓口など利用条件あり
- OrgOS の次の **Book 実装第1候補**（提携後 `gnavi_reserve` Adapter）

---

## 3. 予約基盤・台帳（店舗側エンジン）

消費者サイトではなく、**在庫の正本**側。秘書が「店の予約エンジン」に直接繋ぐモデル。

| ID（案） | サービス | Search | Avail | Book | Deep | 推奨 | 所見 |
|----------|----------|--------|-------|------|------|------|------|
| `tablecheck` | TableCheck | ○ Directory（審査） | ○ Availability / Web Booking | ○（Distribution / Booking · 審査） | ○ ホスト予約ページ | **A/B（最有力の横断 Book）** | 公開ドキュメントあり。`api@tablecheck.com` でアクセス申請。Listing/コンシェルジュ向けは **Web Booking / Distribution**。決済・複雑フォームはホストページへリダイレクト推奨の記述あり。日本の高級店・ホテルレストランに多い。 |
| `restaurant_board` | レストランボード（リクルート） | × 消費者 | × | × 第三者公開 | — | **D（店舗側）** | ホットペッパー等の在庫ハブ。**OrgOS が直接繋ぐ対象ではない**（店が契約する台帳）。 |
| `tabelog_note` | 食べログノート | × | × | × 第三者 | — | **D（店舗側）** | 同上。 |
| `tobu` / その他 SC | レスラク等サイトコントローラー | — | — | 店舗↔媒体 | — | **D** | 媒体横断の在庫同期。B2B のみ。 |
| `r_reserve` 等 | Reserve with Google 対応 SaaS | 製品による | 製品による | 製品による | ○ | **B（個別）** | 店が導入していれば Google 経由の導線あり。OrgOS は店の provider 設定で切替。 |

### TableCheck（重要）

- Docs: https://tablecheck.atlassian.net/wiki/spaces/API
- コンポーネント: Directory · Availability · Web Booking · Booking · Sync（Webhook）
- OrgOS: 提携後に `tablecheck` Adapter で `checkAvailability` → `hold` → `confirm` が現実的
- 全店横断の「好きな店を予約」ではなく、**catalog に shop_id がある店**向けが主戦場

---

## 4. 海外・インバウンド系

| ID（案） | サービス | Search | Avail | Book | Deep | 推奨 | 所見 |
|----------|----------|--------|-------|------|------|------|------|
| `opentable` | OpenTable | パートナー | パートナー | 限定 / リダイレクト多い | ○ | **B（海外出張・外資接待）** | 公式は **API Partner / Affiliate 審査**。完全 API 確定よりリンク埋め込みが多い。日本カバーは都市部・ホテル系に偏る。 |
| `resy` | Resy | × 一般 | × | × | ○ | **C** | 米中心。公開予約 API なし。 |
| `tock` | Tock | × | × | × | ○ | **C** | 体験・チケット型。深リンク。 |
| `google_reserve` | Reserve with Google | — | 店側エンジン経由 | 店側 | ○ Maps | **C（導線）** | Google 自体が在庫を持たず、OT / TableCheck / 国内媒体が供給。OrgOS から Google API で直接予約は非現実的。 |
| `openrice` | OpenRice | 地域による | — | — | ○ | **C** | 香港等。食べログ海外連携の話あり。MAL 会食の主戦場外。 |
| `dianping` / 美団 | 大衆点評 | — | — | — | — | **D** | インバウンド相手店向け。第三者秘書連携は非現実的。 |

---

## 5. 会食以外だが隣接（スコープ外メモ）

| 領域 | 例 | OrgOS との関係 |
|------|-----|----------------|
| ホテル・宴会場 | 一休ホテル · Booking.com · 楽天トラベル | 既存 `travel_booking` モジュール |
| 会議室・貸室 | インスタベース · スペースマーケット | 別 Adapter 候補（将来） |
| ゴルフ・サウナ等 | 楽天GORA 等 | 会食チャネル外 |

---

## 6. 実装ロードマップ（洗い出し結果に基づく）

| Phase | 内容 | Provider |
|-------|------|----------|
| **P0** | Adapter IF + 手動 | `manual` ✅ |
| **P1a** | 深リンク | `hotpepper_deep_link` ✅ · `tabelog_deep_link` ✅ |
| **P1b** | 公開 Search API | `hotpepper_gourmet_search`（キー取得後 · 検索のみ） |
| **P1c** | 深リンク追加 | `ikyu_restaurant` · `pocket_concierge` · `ozmall` |
| **P2a** | 提携 Book | `gnavi_reserve`（問い合わせ） |
| **P2b** | 提携 Book | `tablecheck`（api@ 申請） |
| **P2c** | 任意 | `opentable`（Affiliate） |
| **P3** | テナント catalog | 店ごとに `provider_id` + 外部 shop_id。未対応は `manual` |

### 優先順位（CEO 会食ユースケース）

1. **TableCheck** — 高級店で実在在庫に届きやすい / ドキュメント明確  
2. **ぐるなび席のみ予約 API** — 国内 Book の公式経路  
3. **ホットペッパー Search** — 候補店リストの自動化（予約は人手）  
4. **一休 / Pocket Concierge 深リンク** — グレード感のある店の人手配短縮  
5. **食べログ** — 深リンク維持（Book API 待ちにしない）

---

## 7. アンチパターン

| やり方 | 理由 |
|--------|------|
| Playwright で食べログにログインして予約 | ToS · 決済 · 壊れやすさ |
| 非公式スクレイプ API | 規約・可用性・法務 |
| Wire に予約を載せる | 組織間証跡と混同（ADR 0009） |
| 「Web で予約できる＝全部自動化」 | 公開 Book API がない媒体が大半 |

---

## 8. 次アクション（調査完了後）

- [ ] 本表を `venue-providers.yaml` の stub 一覧に反映（`supports_api` / `notes`）
- [ ] ホットペッパー Search 用キー取得手順を runbook に追記（L2 は records）
- [ ] ぐるなび / TableCheck に **利用用途（社内秘書・会食手配 · スクレイプなし）** で問い合わせ下書き
- [ ] P1b: `hotpepper_gourmet_search` Adapter（検索のみ）実装

---

## 9. 参照リンク

| サービス | URL |
|----------|-----|
| ホットペッパー API | https://webservice.recruit.co.jp/doc/hotpepper/ |
| ホットペッパー guideline | https://webservice.recruit.co.jp/doc/hotpepper/guideline.html |
| ぐるなび API | https://solution.gnavi.co.jp/service/gnavi_api/ |
| TableCheck API | https://tablecheck.atlassian.net/wiki/spaces/API |
| OpenTable API partners | https://www.opentable.com/restaurant-solutions/api-partners/ |
| 食べログ ネット予約（店舗向け） | https://owner.tabelog.com/home/net_reservation/ |
