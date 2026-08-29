# ADR 0049: Inbound Inquiry Mail Intake

**Status:** Accepted  
**Date:** 2026-08-24

## Context

インバウンド問合せは `data/sales/inbound/inquiries.yaml` と `sales_inbound` Agent で定義されていたが、メール受信（Mail Intake）は既定 `routing: secretary` のみで、問合せの自動起票経路がなかった。

ADR 0047 でパイプライン側の決定論スタックを整備した後、インバウンド側も同様に View/CLI を追加し、メール triage からの intake を接続する必要がある。

## Decision

1. **`mailRoutingSchema` 拡張**
   - `"sales_inbound"` を routing 値に追加

2. **inquiry 分類ルール**
   - `mail-triage-rules.yaml` に `inquiry.subject_keywords` を追加
   - `routing.inquiry_ham: sales_inbound`（p0 緊急は従来どおり secretary）

3. **intake CLI**
   - `orgos sales inbound intake` — `routing: sales_inbound` かつ `handoff_status: pending` の triage を `INQ-YYYY-NNN` で起票
   - L2 禁止: メール本文 · アドレスは `inquiries.yaml` に書かず `source_ref`（triage entry id）のみ

4. **Secretary との分担**
   - Secretary: 送信実行 · 社外窓口 · p0 緊急メール
   - sales_inbound: 問合せトリアージ · 初回回答下書き · inquiries SoT 更新

## Consequences

- テナントは `orgos mail-intake triage` 後に `orgos sales inbound intake` を実行（または cron）
- 既存 tenant ルールで `inquiry_ham` 未設定の場合は secretary 維持（後方互換）
- Web フォーム webhook は別 ADR（本 ADR のスコープ外）

## Related

- [sales-inbound-spec.md](../org-os/sales-inbound-spec.md)
- [0047 Sales Line Deterministic Stack](0047-sales-line-deterministic-stack.md)
- [schemas/correspondence/mail-triage.ts](../../schemas/correspondence/mail-triage.ts)
- [schemas/sales.ts](../../schemas/sales.ts)
