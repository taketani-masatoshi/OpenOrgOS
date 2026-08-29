# ADR 0056: 消費税は集計と還付手続を分ける

**Status:** Accepted · **Date:** 2026-08-24  
**親:** [0011](0011-jp-permit-application-vs-registry.md) · [0012](0012-business-vs-compliance-fulfilment.md) · [0042](0042-consumption-tax-model.md) · [0052](0052-tax-filing-phase5-deferred.md)

## Context

`jp_tax_consumption` は課税/免税の区分チェックと、仕訳からの本則差額集計までを持つ。`net_tax_yen` はマイナスになり得るが、出力は「差引納付税額」であり、還付申告・輸出還付・簡易課税の適格判定は未実装である。

これを同じモジュールに足すと、許認可で起きた混同が再発する。

- readiness 90 点が「還付申請できる」と読める
- 計算（決定論）と行政手続（人間/税理士）が同一 CLI に混ざる
- 簡易課税の還付を本則と同じ式で出してしまう危険がある

簡易課税はみなし仕入率で税額を計算し、**仕入税額控除を行わない**。みなし仕入率は最大 90% なので、国内課税売上だけなら還付は原則生じない。輸出免税に伴う仕入税額還付を取りたい事業者は、実務上 **本則** を選ぶ。

## Decision

### 1. 三層（消費税）

```
Assessment（計算・適格）     jp_tax_consumption ＋ jp_invoice_qualified
        │  金額と eligibility だけを出す。申請書を持たない
        ▼
Fulfilment（還付クレーム）   jp_consumption_refund（新設）
        │  CLAIM-* · 申請パック · 税理士 handoff
        ▼
Cash / GL（入金）            accounting 仕訳 ＋ finance / treasury
```

独立の還付台帳モジュール（`jp_consumption_refund_registry`）は作らない。還付は年数回のイベントであり、許認可のような常時保有台帳ではない。状態は fulfilment の `CLAIM-*` で足りる。常時更正・複数管轄が常態になってから分離する。

### 2. モジュール境界

| モジュール | 所有 | やってはいけないこと |
|------------|------|----------------------|
| **`jp_tax_consumption`** | 区分 · 本則差額 · 簡易みなし仕入 · 輸出ゼロ税率集計 · 還付**候補**判定 | 申請書 · 還付口座値 · 提出 · クレーム状態の更新 |
| **`jp_invoice_qualified`** | 適格請求書・T 番号（仕入控除の証拠条件） | 還付金額の計算 |
| **`jp_consumption_refund`** | `CLAIM-*` · 種別ゲート · 申請パック · 提出は人間記録のみ | 金額の invent · e-Tax 送信 · 簡易還付の自動許可 |
| **業モジュール**（hospitality 等） | 売上・仕入の業務事実 | 消費税区分や還付ステータスの独自マスタ |

課税方式（本則 / 簡易 / 2割特例）の **選択結果** は `data/finance/tax-profile.yaml` の `consumption_tax` に置く。選択届そのものは手続だが、発生頻度が低いので当面モジュール化せず、profile フィールド + eligibility CLI とする。

### 3. クレーム種別と既定ゲート

| `claim_kind` | 意味 | 既定ゲート |
|--------------|------|------------|
| `principle_net` | 本則: 仕入税額控除 ＞ 売上税額 | Assessment が `refund_candidate` かつ method=standard |
| `export` | 輸出免税売上に対応する仕入税額還付 | 輸出売上 > 0 かつ method=standard。証拠パス必須 |
| `simplified` | 簡易課税下の還付 | **既定 ineligible**（`simplified_no_input_credit`）。税理士が `exception_basis` を書いたときだけ draft 可 |
| `interim` | 中間申告での還付 | 後期。確定と同じゲートを中間期間に適用 |

`simplified` をカタログに残すのは「将来できるようにする」ためであり、本則と同じ計算で還付額を出してはならない。

### 4. Agent は増やさない

| 主体 | 責務 |
|------|------|
| **tax** | 消費税モジュール全体の owner（既存 proxy）· パック下書き · 要約 |
| **accounting** | 仕訳 `tax_category` · 還付金入金仕訳 |
| **finance / treasury** | 入金後の資金。口座番号は `bank_account_id` のみ |
| **compliance** | インボイス制度。還付金額は触らない |
| **人間 / 税理士** | 方式選択 · 区分確定 · 申告書 · 電子署名 · 提出 |
| **government_affairs** | 補助金等のみ。税の還付手続は持たない |

還付専用 Agent は作らない。CEO / 税理士の窓口を tax に固定する。クレーム件数が常時キューになる段階で、tax 配下の extension（例: `tax_consumption`）を検討する。

### 5. 提出は ADR 0052 を維持

OrgOS は e-Tax / 申告書 XML を実行しない。Fulfilment の終端は `ready_to_file` と、人間が書いた `filed_by_human` 記録まで。

### 6. 段階

| Phase | 内容 | モジュール |
|-------|------|------------|
| **R0** | 既存 calc を正直にする（還付候補ラベル · `tax_free` 集計） | `jp_tax_consumption` |
| **R1** | 方式・みなし仕入率・輸出割合の eligibility | 同上 · tax-profile 拡張 |
| **R2** | `jp_consumption_refund` 新設（CLAIM · pack · ゲート） | 新モジュール |
| **R3（実装済）** | 入金仕訳と CLAIM 由来の還付入金予定（カレンダー） | accounting + tax-profile |
| **R4** | XML / e-Tax | しない（0052） |

mal に R2 を点数目的で有効化しない。実クレームが起きたときだけ tenant ON。

## Consequences

- 消費税モジュールの 90 点は「区分と集計」のまま読める。還付手続は別 readiness。
- 簡易課税還付を自動で出さないので、誤還付のリスクをコードで止められる。
- モジュールが 1 つ増える。capability / pack-ids / CLI 登録の同期が必要。
- 税理士が例外を書く口（`exception_basis`）を残す。LLM はその口を実行しない。

## Related

- 仕様: [consumption-tax-refund-spec.md](../org-os/consumption-tax-refund-spec.md)
- 集計: [consumption-tax-spec.md](../org-os/consumption-tax-spec.md)
- 申告準備: [tax-filing-spec.md](../org-os/tax-filing-spec.md)
