# 消費税還付 — 集計と手続の分割仕様

**Status:** Active · **ADR:** [0056](../adr/0056-consumption-tax-assessment-vs-refund.md)  
**Agent:** Tax（新 Agent は作らない）· **Jurisdiction:** JP

## 目的

本則差額還付 · 輸出還付 ·（例外としての）簡易課税還付 · 還付申請パックを、**計算モジュールを汚さずに** 段階導入する。  
e-Tax 提出は行わない（[tax-filing-spec.md](./tax-filing-spec.md) · ADR 0052）。

## なぜ分割するか

`jp_tax_consumption` の 90 点超は区分チェックと仕訳集計の完成度である。還付申請・輸出証拠・簡易課税の適格は別ライフサイクルなので、許認可の取得/台帳分割（ADR 0011）と同じ型で切る。

```
業の事実（売上・仕入）
    → Assessment  jp_tax_consumption / jp_invoice_qualified
    → Fulfilment  jp_consumption_refund（CLAIM-*）
    → 人間/税理士が提出
    → 入金は accounting + finance
```

## モジュール

### `jp_tax_consumption`（既存 · Assessment）

所有: 課税区分 · 本則税額 · 将来の簡易みなし仕入 · 輸出ゼロ税率の**集計** · `refund_candidate` 判定。

| CLI（将来含む） | 出力 |
|-----------------|------|
| `check` | 課税/免税/インボイス矛盾 |
| `calc` | 売上税額 · 仕入税額 · 差引。マイナスなら `direction: refund_candidate` |
| `eligibility`（R1） | method × 輸出割合 × みなし仕入率 → どの `claim_kind` が開くか |

禁止: 申請書生成 · `CLAIM-*` 更新 · 還付口座の値。

### `jp_invoice_qualified`（既存）

仕入税額控除の**証拠条件**（登録番号 · 適格請求書）。還付額は計算しない。

### `jp_consumption_refund`（R2 で新設 · Fulfilment）

所有: 還付クレームと申請パック。金額は Assessment を読むだけ。

```
steward/jurisdiction-packs/JP/modules/jp_consumption_refund/
  module.manifest.yaml
  agent.md                 # proxy: tax
  cli/{schema,lib,commands,register}.ts
  skills/registry.yaml
  seed/consumption-refund-claims.yaml.example
```

テナント正本:

| パス | 内容 |
|------|------|
| `data/tax/consumption-refund-claims.yaml` | `CLAIM-*` |
| `docs/company/tax/refund/` | パック · チェックリスト（L1） |
| 還付口座 | `bank_account_id` のみ。口座番号は書かない |

推奨 CLI:

```
orgos operations consumption-refund eligibility --period YYYY-MM
orgos operations consumption-refund propose --kind export --period YYYY-MM
orgos operations consumption-refund pack --id CLAIM-...
orgos operations consumption-refund status --id CLAIM-...
orgos operations consumption-refund advance --id CLAIM-... --to ready_to_file
orgos operations consumption-refund file --id CLAIM-...
orgos operations consumption-refund receive --id CLAIM-... --bank-account-id BANK-...
```

`propose` は eligibility が `open` のときだけ draft を書く。`simplified` は既定 `blocked`。

## クレーム

```yaml
# data/tax/consumption-refund-claims.yaml
entity: example
claims:
  - id: CLAIM-2026-03-export      # CLAIM-{period}-{kind}
    kind: export                 # principle_net | export | simplified | interim
    period: 2026-03
    assessment_period: 2026-03   # calc の期間
    amount_yen: 0                # Assessment からコピー。手入力禁止
    status: draft                # draft|blocked|advisor_review|ready_to_file|filed_by_human|received|rejected
    gate: open                   # open|blocked
    gate_reason: ""              # 例: simplified_no_input_credit
    exception_basis:             # 税理士メモのパス。LLM は書けない
    evidence_paths: []           # 輸出許可・船積等の L1 パス
    refund_bank_account_id:      # L2 値は持たない
    filed_on:
    received_on:
```

状態は前へしか進まない。`filed_by_human` は人間/CLI 人間セッションのみ。

## 種別ゲート（決定論）

| kind | 開く条件 | 閉じる条件 |
|------|----------|------------|
| `principle_net` | tax-profile method=standard（または未選で本則扱い）かつ calc が還付候補 | 簡易選択中 |
| `export` | method=standard かつ 期間内 `tax_free` 売上 > 0 かつ仕入税額 > 0 | 輸出売上 0 · 簡易選択中 |
| `simplified` | **開かない** | 常に `simplified_no_input_credit`。`exception_basis` がある draft のみ |
| `interim` | 本則かつ還付候補（確定と同じゲートを中間期間へ） | 簡易選択中 · 候補なし |

簡易課税で還付額を本則式（実仕入税額 − 売上税額）で出してはならない。みなし仕入の式は Assessment の `calc --method simplified` に閉じる。

## Agent 境界

| 主体 | 読む | 書く | 禁止 |
|------|------|------|------|
| **tax** | tax-profile · 集計 · CLAIM · refund docs | パック下書き · 要約 | 提出 · 例外根拠の捏造 · 口座番号 |
| **accounting** | 仕訳 | `tax_category` · 入金仕訳 | クレーム金額の上書き |
| **finance / treasury** | 入金後キャッシュ | 資金計画 | 税区分の変更 |
| **compliance** | インボイス | 制度整合 | 還付計算 |
| **税理士 / 代表** | すべて | 方式選択 · 提出 · exception_basis | — |

government_affairs に税還付を載せない。

## イベント（実装は段階的）

`ConsumptionRefundClaimOpened` · `RefundPackPrepared` · `RefundAdvisorAccepted` · `RefundFiledByHuman` · `RefundReceived` · `RefundRejected`

入金イベント後だけ accounting が還付金仕訳を切る。CLAIM 金額を手で変えない。

## 段階と「できる」の意味

| Phase | 利用者ができること | まだできないこと |
|-------|-------------------|------------------|
| **R0（実装済）** | 候補と輸出売上高が見える | — |
| **R1（実装済）** | 簡易/本則/輸出のどれが開くか分かる | — |
| **R2（実装済）** | パックを税理士に渡せる（モジュール有効時） | 提出 · 入金消込 |
| **R3（実装済）** | 入金を GL に残せる · カレンダーに入金予定 | XML |
| **R4** | — | e-Tax（やらない） |

## テナント

- mal は Assessment のみ有効でよい。R2 モジュールは実クレームが起きてから `modules.yaml` で ON。
- 点数のために還付モジュールを有効化しない（ADR 0053）。

## 関連

- [consumption-tax-spec.md](./consumption-tax-spec.md)
- [tax-filing-spec.md](./tax-filing-spec.md)
- ADR [0042](../adr/0042-consumption-tax-model.md) · [0052](../adr/0052-tax-filing-phase5-deferred.md) · [0056](../adr/0056-consumption-tax-assessment-vs-refund.md)
