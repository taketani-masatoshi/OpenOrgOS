# ADR 0011: 許認可取得（プロジェクト）と保有台帳の分離

**状態:** Accepted  
**日付:** 2026-07-14  
**決定者:** OpenOrgOS コアメンテナ

---

## Context

`jp_permit_registry` は種別カタログ・保有台帳・申請案件・gap 分析を同居させてきた。業モジュール（例: `hospitality`）の readiness 評価では「免許取得」と「取得後運用」が混同され、カタログ上 `production_ready` でも許可が `pending` のまま「営業できる」と読めない問題が起きた。

行政書士連携や更新・変更届は **始まりと終わりのあるプロジェクト**であり、日次の名簿・清掃・OTA 運用とはライフサイクルが異なる。

案 B: 取得専用モジュールを新設し、台帳は `jp_permit_registry` に残す。

## Decision

1. 新モジュール **`jp_permit_application`**（プロジェクト型）を導入する  
   - 所有: `APP-*` · ドラフト/チェックリスト/PDF · 行政書士 handoff  
   - テナント data: `data/permit-applications/`
2. **`jp_permit_registry`** は保有許可 SSOT（`PER-*`）· 義務インスタンス · gap/expiry に寄せる  
   - 申請 CLI（prepare/checklist/draft/export-pdf）の所有権は application へ移す
3. 業モジュール（`hospitality` 等）は取得**後**の定常運用と義務**証拠**のみを持つ  
   - 許可番号の invent / `PER-*` 直書込は禁止  
   - `PER-* active` を開業ゲートの入力とする（実装は後続）
4. 法域共通の種別・条件・政府 URL は **CSV カタログ**を正本とする  
   - 配置: `jp_permit_registry/catalog/*.csv`（application が参照）  
   - 法令全文は転載しない（条・要約・公式 URL のみ）
5. `approved` 遷移時のみ application が registry へ `PER-*` upsert し、義務インスタンス生成をトリガする
6. 行政への自動提出は行わない（現行 agent 禁止事項を維持）
7. 医療機器の詳細義務正本は引き続き `jp_medical_device`（取得モジュールは案件リンクのみ）

## Consequences

### Positive

- 取得と運用の評価軸が分離し、自己評価・Today ブロッカーが明確になる
- 行政書士 handoff のオーナーが application に固定される
- CSV により法令・URL 変更の行単位更新がしやすい
- 既存 MAL の `PER-*` 台帳投資を壊さずに移行できる

### Negative / トレードオフ

- モジュール数が増える（catalog / readiness / capability の同期コスト）
- 申請データのパス移行（`permit-registry` → `permit-applications`）が一時的に必要
- YAML カタログとの二重管理期間が発生しうる（CSV 正本化完了まで）

## 関連

- 上位の責務分離（業 ↔ Compliance Fulfilment）: [0012-business-vs-compliance-fulfilment.md](0012-business-vs-compliance-fulfilment.md)
- 要件: [jp-permit-application-requirements.md](../org-os/jp-permit-application-requirements.md)
- 台帳: [jp_permit_registry](../../steward/jurisdiction-packs/JP/modules/jp_permit_registry/)
- 実行信頼: [0008-module-runtime-trust-internal-only.md](0008-module-runtime-trust-internal-only.md)
- モジュール契約: [module_contract.md](../../steward/modules/module_contract.md)
