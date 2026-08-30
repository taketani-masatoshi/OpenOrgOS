# ADR 0068 — ISO 適合性検査を「存在」から「妥当性」へ

**状態:** Accepted · **日付:** 2026-08-30 
**関連:** [ADR 0067](0067-iso-common-core-and-roadmap.md) · `steward/standards/control-framework/00-README.md`

## 背景

`hasEvidenceForControl()` は「所定パスにファイルがあり、空でないか」しか見ていない。
審査員が見るのは「その記録が要求事項を満たしているか」である。この差により、

- 根本原因も有効性確認もない行を並べた `corrective-actions.csv` が「是正処置あり」として通る
- 統制が箇条単位でしか要求に対応しておらず、箇条内の個々の shall が落ちても見えない
- `orgos iso audit run` が「内部監査」と名乗っていたが、実体は決定論の存在確認であり、
  ISO 19011 が求める監査員の判定・独立性・サンプリング・報告を欠いていた

## 決定

適合性検査を4層に分け、決定論で担保できる層と人の判断が要る層を分離する。

| 層 | 内容 | 担保 |
|---|---|---|
| **A** | 記録の内容検査 | 決定論（`records.yaml` + `iso-records.ts`） |
| **B** | 要求事項への網羅性 | 決定論（`requirements.yaml` + `iso-requirements.ts`） |
| **C** | 要求事項ごとの判定 | **人間の監査員**（`iso audit plan` / `finding set` / `conclude`） |
| **D** | 監査の適格性（独立性・力量・署名・プログラム） | 決定論のガード |

**LLM は判定に関与しない。** CLI は判定を記録・署名するが、判定を生成しない。

### A層 — 記録の内容検査

パックが `records.yaml` で記録ごとの仕様を宣言する。ルール語彙は
**閉じた discriminated union**（`schemas/iso-record-spec.ts`）とし、式パーサは作らない。

```
required · type · pattern · enum · range   列の型と値域
computed         score = severity * frequency の一致
conditional      significant=yes なら control と objective が必須
comparison       local_spend_yen <= total_spend_yen
freshness        reviewed_on が365日以内
unique           id / month の重複禁止
non_empty        空の登録簿は証拠ではない
section · no_placeholders   Markdown 様式の必須見出し・未置換
```

語彙で表現できない適合性は **監査員の判断** であり、DSL を拡張して吸収しない。

`computeControlGaps()` に `gap_type: "record_invalid"` を追加した。
`doc_missing`（作られていない）と区別することで、「書け」と「直せ」を混同させない。
`orgos validate` にも `collectIsoRecordIntegrityIssues()` 経由で出る。

KPI ログの構造検査は `records.yaml` に移し、`src/lib/iso-kpi.ts` は原単位と前月比の
算出だけに縮めた。同じ検査を2箇所に持たない。

### B層 — 要求事項レジスタ

統制より細かい単位で `requirements.yaml` を置き、統制との被覆を**双方向**に検査する。
片方向では不足する — 全要求を被覆しながら、規格に辿れない統制を抱えることがある。

- `uncovered` — 統制が紐づいていない要求事項
- `orphan_controls` — どの要求事項にも紐づかない統制
- `dangling` — 実在しない統制を参照している要求事項
- `unverified` — `verified_on` 未記入（＝規格票と未突合）

**ISO 本文は再配布できない。** `statement` はパック作成者の言い換え（`source: paraphrase`）
であり、`verified_on` が埋まるまで、被覆検査は「規格への網羅性」ではなく
**「私たちが想定した要求事項への網羅性」** を示すにすぎない。レポートにもそう書く。
器は全パックに用意し、記入済みは ISO-21401（39件）のみ。

### C層 — ISO 19011 の内部監査

`orgos iso audit run` を **適合性の事前検査** と位置づけ直し（レポート冒頭に明記）、
監査プロセスを別に作った。判定は1件ずつ記録する（対話 UI は作らない）。

```bash
orgos iso audit plan create --iso ISO-21401 --auditor OP-00X --period 2026-09..2027-08
orgos iso audit finding set --plan IAP-001 --req REQ-21401-6.1-a \
    --verdict conform --evidence <path> --sample "..." --note "..."
orgos iso audit conclude --plan IAP-001 --summary "..."
```

- `conclude` は **全要求事項に判定があること** を要求し、未判定があれば拒否する
- 不適合の判定には監査員の記述（`--note`）を要求する
- 結論後に所見を変更すると計画は `draft` に戻り、結論は破棄される

### D層 — 署名・独立性・力量・プログラム

**署名に新しい暗号処理は作らない。** `conclude` した計画を
`subject_type: "iso.internal_audit.signoff"` で org approval に載せ、
`humanApproveOrgApproval()` を通す。認証済み人間・自己承認禁止・attestation 記録が
そのまま効く。所見の digest を併せて保存するため、署名後に所見を書き換えると
`auditSignoffValid()` が落ち、レポートに「署名後に所見が変更されています」と出る。

**権限** — `audit:sign` を追加し、`auditor` ロールの既定に付与した。

**独立性** — 監査員 operator の `allowed_agents` が監査範囲の統制の担当 agent と
交差したら計画作成を拒否する。`--force` で記録は残せるが、黙って通ることはない。

**力量** — `CMP-10`（内部監査の実施）の評価がなければ計画作成を拒否する。

**プログラム** — `orgos iso audit programme --months 12` で、期間内に一度も監査
されていない要求事項を出す。同じ箇条を繰り返す監査は「定期的に監査している」を
満たしながら、見ていない領域を残す。

## 結果

**得られたもの**

- 空の様式・計算の合わない評価・根本原因のない是正が証拠として通らなくなった
- 要求事項の落ちが機械的に見えるようになった
- 監査の判定・根拠・サンプル・監査員が記録として残り、改竄が検出される
- 監査員の独立性と力量が計画作成時に検査される

**引き受けたもの**

- ルール語彙が閉じているため、表現できない検査は監査員の判断に回る。これは意図した設計であり、
  DSL を育てる方向には進まない
- 要求事項の文言は未検証である。規格票との突合は人の作業として残る
- 独立性検査は `internal_audit` agent を除外している。全パックが内部監査の統制を持つため
  除外しないと適格な監査員がいなくなる。監査プログラム自体の妥当性は
  マネジメントレビューと外部審査に委ねられ、本検査では担保しない
- **認証の取得可否は保証しない。** 本実装は審査に耐える記録と手順を整えるものであって、
  審査に合格することを保証するものではない

## 実装

| 層 | スキーマ | ライブラリ | CLI |
|---|---|---|---|
| A | `schemas/iso-record-spec.ts` | `src/lib/iso-records.ts` · `iso-records-integrity.ts` | `orgos iso records check` |
| B | `schemas/iso-requirements.ts` | `src/lib/iso-requirements.ts` | `orgos iso requirements` |
| C | `schemas/iso-audit-plan.ts` | `src/lib/iso-audit-plan.ts` | `orgos iso audit plan/finding/conclude` |
| D | 既存 `schemas/org/approval.ts` | 既存 `src/lib/org/approval/` | `orgos iso audit sign/eligibility/programme` |

テスト: `tests/iso-records.test.ts` · `tests/iso-requirements.test.ts` · `tests/iso-audit-plan.test.ts`
