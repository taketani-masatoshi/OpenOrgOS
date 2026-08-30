# ADR 0069 — 監査枠組みの展開（ISO · 会計アサーション · J-SOX）

**状態:** Accepted · **日付:** 2026-08-30  
**関連:** [ADR 0068](0068-iso-conformity-depth.md) · [ADR 0066](0066-iso-internal-audit-control-maps.md)

## 背景

ISO-21401 パックが A（記録内容）· B（要求事項）· C（19011 の計画・所見・結論）· D（独立性・力量・署名）の正本になった。他の available パックは空の `requirements.yaml` / `records.yaml` のままだと、19011 の計画が要求事項を列挙できない。会計アサーションと金商法の財務報告内部統制（J-SOX）も同じ A–D に載せたいが、本文転記・証明書・内部統制報告書・EDINET は出さない。

## 決定

1. **空レジスタを先に埋める。** catalog `available` の 12 規格は 1 件以上の REQ と records spec を持ち、orphan / dangling / uncovered を禁止する。`requirements.length === 0` で orphan 検査を skip しない。
2. **適用除外は偽記録で埋めない。** `standards.yaml` の `applicability: excluded` には `exclusion_reason` が必須。mal の ISO-22000 は食品製造を行わないため excluded。
3. **決定論の所見案は `apply-precheck`。** A 層 error → `nonconform_minor`。A+B 清潔 → `conform`。`nonconform_major` と `not_applicable` は人間だけ。既存の人間所見は上書きしない。
4. **LLM は判定しない。** `iso_audit_brief` は `chat.kind: read`。verdict と署名は人間。ローカル LLM は情報不足なら `ERROR:` 1 行（ADR 0061）。
5. **会計は `framework: financial`。** 実在・網羅・評価・期間帰属・表示を GL / period-lock / 補助元帳 / 月次締めへ載せる。外部会計監査人の代替ではない。
6. **J-SOX は JP モジュール `jp_jsox`。** `jp_inspection` に相乗りしない。評価 CLI（status / scope / gaps / evaluate）のみ。finance の自己評価は拒否。内部統制報告書・EDINET は出さない。
7. **フォローアップ** は `iso audit follow-up`。是正の有効性は 21401 の CSV 規則を一般化した仕様検査 + 人間確認。
8. **監査プログラム** は既存 `iso audit programme` を `framework` ごとに回す。

## 結果

- available 12 規格に空の requirements / records が無い。
- 計画は `framework: iso | financial | jsox` で同じ conclude / sign に載る。
- LLM 経路が verdict を書けないことをテストする。
- 成熟度の自動 L2 化、coming_soon の量産、records 語彙の式言語化は行わない。
