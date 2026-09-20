# e-Tax 問題点 1–16 修正計画

**日付:** 2026-09-21 · **前提:** 証拠捏造禁止 · tip `production-gate` を偽 true にしない · 実 NTA はオペレータ待ち  
**状態:** コード口実施済み（operator-complete ではない）

| # | 問題 | 修正 | 状態 |
|---|------|------|------|
| 1 | stub で host bind 可能 | bind が stub / `not NTA` health を拒否 | done |
| 2 | COM 推測呼び出し | host が COM 失敗を正直に unbound；推測 API を文書化・防御 | done |
| 3 | acceptance が host 待ちハング | stdio RPC にタイムアウト | done |
| 4 | B層未実行を受け入れ済みと誤解 | ACCEPTANCE code-ready vs operator · CI 注記 · A層明示 | done |
| 5 | NTA 未実施 | D4/B層は fail 維持；completion JSON 必須（捏造しない） | done |
| 6 | credential 分離が文書のみ | `credentials-contract` + example environments + D8 | done |
| 7 | release と approval flag の順序 | release が承認後に `orgos_human_approval_recorded` を立てる | done |
| 8 | 受付 XML 推定 | mapping notes + 未知ルート fail-closed | done |
| 9 | promote/ToS 文字列置換 | YAML/構造化更新 | done |
| 10 | RHO0010 最小経路 | ACCEPTANCE/mapping にスコープ明示 | done |
| 11 | inter-form 過大表現 | notes を正直化（HOA110 切片のみ） | done |
| 12 | D4 plain-text 甘い | completion は JSON スキーマ必須 | done |
| 13 | D3 が MOCK 拒否を見ない | `receipt-policy` + evaluateD3 + transport | done |
| 14 | tip hostBound=true が Darwin 破壊 | A層で tip catalog `hostBound===false` を固定 | done |
| 15 | ToDo 完了とオペレータ未達の混同 | ACCEPTANCE code-ready vs operator-complete | done |
| 16 | CHANGELOG 誤解 | Fixed に「コード口のみ・未対応完了」明記 | done |
