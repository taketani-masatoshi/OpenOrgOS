# OrgOS Ledger — 対外商用宣言チェックリスト（L7）

**地位:** 対外「商用」宣言の直前に人手で全項確認する。  
**手順書:** [commercial-declaration-runbook.md](./commercial-declaration-runbook.md)（Phase 0–8 · 承認ゲート付き）  
**エンジニアリング:** `--commercial` が偽緑なしで通ること（live Stripe・counsel 記録・SMTP drill・prod-checklist・restore 品質）。

| 項 | 合格条件 | 状態 |
|----|----------|------|
| Legal | `counsel_reviewed` 記録 + ToS/DPA 顧客送付可（非ドラフト） | [x] eng |
| Stripe | live キー + webhook 本番 + `past_due` UX（Portal CTA） | [—] **保留**（CEO 判断） |
| Mail | SMTP 実送信ドリル成功（`orgos ledger product mail-drill --to …`） | [x] eng |
| UX | UI 主導 E2E 緑（`e2e/steward-chat-ledger-customer.spec.ts`） | [x] eng |
| Docs | security / sla / pricing 非ドラフト · support `status_page_url` | [x] eng |
| Ops | restore 品質ゲート（連続成功 2 または直近成功率） | [x] eng |
| Auth | prod-checklist 緑（dev passkey なし · auth on） | [x] eng |

## Phase 8 — CEO 宣言（2026-08-26）

| 項 | 状態 |
|----|------|
| `--commercial` | 90/100（`stripe-live` のみ未達 · 保留） |
| 限定宣言記録 | `product-fleet/commercial-declaration.yaml` |
| CEO 署名 | [x] 限定宣言承認（Stripe 保留明示） |

## 対外文言（限定宣言 · 採用）

> OrgOS Ledger はマネージド単一テナントの法人向けクラウド会計です。電子帳簿は基本要件対応（優良要件は別オプション）。e-Tax 提出は含みません。  
> セルフサーブ課金（Stripe live）は別途投入予定。現時点は招待制・契約ベースの提供とします。

## 対外文言テンプレ（フル · Stripe 完了後）

## 人間ゲート（実装完了後）

1. 外部 counsel: ToS/DPA レビュー → 正本差し替え → `counsel_reviewed_*` → `legal-attest`
2. Stripe Dashboard: live キー・webhook シークレット投入、test attestation 削除
3. SMTP/SES 本番認証情報
4. 本チェックリスト人手確認 → 対外発表

## CLI

```bash
orgos ledger product readiness --commercial
orgos doctor   # または prod-checklist 相当
orgos ledger product mail-drill --to you@example.com
```
