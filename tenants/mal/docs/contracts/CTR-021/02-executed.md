# 【法務デモ】業務システム利用契約【締結版】

> **契約 ID:** CTR-021 · **状態:** executed  
> **Owner:** Contract Agent（法務）  
> **台帳:** [`data/contracts/CTR-021.yaml`](../../../data/contracts/CTR-021.yaml)  
> **Canvas:** `mal-contract-portfolio`（期限超過デモ · `-N日`）  
> **パック索引:** [DEMO-canvas-pack.md](../DEMO-canvas-pack.md)

**注意:** デモ用。実 SaaS 契約の代替ではない。

---

## 契約サマリー

| 項目 | 内容 |
|------|------|
| 甲 | 株式会社MAL（利用企業） |
| 乙 | デモソフト株式会社（提供者） |
| サービス | デモ業務スイート（アカウント管理・監査ログ） |
| 期間 | 2025-08-01 〜 2026-07-31（自動更新） |
| 月額 | 48,000 円（税別） |
| 更新意思表示期限 | **2026-06-15**（デモ: 超過） |

## 主要条項（要約）

1. 利用範囲: MAL 役員・運用オペレータに限定
2. SLA: 月次稼働率 99.5%（デモ値）
3. データ取扱: L2 を乙側に保管しない（ログは仮名化）
4. 解約: 更新期限の 30 日前書面通知
5. 準拠法: 日本法

## 法務メモ（要対処）

- 更新見積・料金改定状が未受領（デモ）
- Canvas では更新期限超過として danger 表示される想定
- 対応後も実契約には本 ID を流用しないこと

## 関連 CLI

```bash
ORGOS_TENANT=mal orgos contracts show CTR-021
ORGOS_TENANT=mal orgos canvas present --suite contract
```
