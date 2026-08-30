# 統治と法務の面（OOO-04〜OOO-08 · OOO-40〜OOO-46）

**実装:** `src/lib/steward-chat/routes/chat-api.ts` · `org-budget-api.ts` · `events-api.ts` ·
`org-chart-api.ts` · `command-api.ts` · `esign-api.ts` · `medical-device-api.ts`
**採点:** `docs/org-os/ooo-capability-items.yaml` の OOO-04〜OOO-08 · OOO-40〜OOO-46

会社の意思決定が残る面。承認・稟議・会社イベント・組織図・契約・電子署名。
どれも**あとから誰が決めたかを言えること**が要件で、機能の速さではない。

## 経路と必要権限

| 経路 | 権限 | 用途 |
|---|---|---|
| `GET /chat/v1/approvals` | `chat:read` | 承認待ちの一覧 |
| `POST /chat/v1/approvals/propose` | `chat:ask` | 稟議の起票（秘書もここ） |
| `POST /chat/v1/approvals/:id/approve` | `chat:approve` | 区分 A / B の決裁（承認） |
| `POST /chat/v1/approvals/:id/reject` | `chat:approve` | 区分 A / B の決裁（却下） |
| `GET /chat/v1/commands` | `chat:read` | コマンド目録 |
| `POST /chat/v1/commands/preview` | `chat:ask` | 等級 A/B の dry-run |
| `POST /chat/v1/commands/:id/run` | `chat:approve` | 確認カード後の適用 |
| `POST /chat/v1/events` | `events:write` | 会社イベントの起票 |
| `GET /chat/v1/events/chain/verify` | `chat:read` | イベント連鎖の検証 |
| `GET /chat/v1/org/chart` | `chat:read` | 組織図 |
| `GET /chat/v1/org/chart/change` | `chat:read` | 提案中の組織図変更 |
| `POST /chat/v1/org/chart/change/propose` | `chat:ask` | 組織図変更の提案 |
| `POST /chat/v1/org/chart/change/apply` | `chat:approve` | 承認後の適用 |
| `POST /chat/v1/product/onboarding/setup` | `ceo` のみ | 会社名・決算月・代表者 |
| `GET /chat/v1/contracts/status` | `chat:read` | 契約台帳の状態 |
| `GET /chat/v1/esign/cases` | `chat:read` | 署名案件と検証結果 |
| `POST /chat/v1/esign/create` | `chat:approve` | 署名案件の作成・添付 |
| `GET /chat/v1/compliance/medical-device` | `chat:read` | QMS / GVP 台帳（読み取り専用） |

提案は `chat:ask`、決裁は `chat:approve`。この2つを分けているのが要点で、
起票できる席と決められる席は同じではない。

## 拒否する条件

| 状況 | 応答 |
|---|---|
| セッションが無い | 401 `unauthorized` |
| 決裁権の無い席が decide を呼ぶ | 403 `forbidden` |
| `events:write` の無い席がイベントを書く | 403 `forbidden` |
| 稟議 ID が無い | 422 `approval_id is required` |
| 組織図の変更 ID が無い | 422 `change_id is required` |
| 存在しない稟議・案件 | 404 `not found` |
| 自己承認 | 拒否。提案者と決裁者の `operator_id` は一致できない |
| 区分 B を単独で承認 | 拒否。両代表の決裁が揃うまで status は動かない |
| 等級 C の change apply | 拒否。plan の論点メモまで |
| 会社名設定を代表以外が呼ぶ | 403。`ceo` の席だけが名乗りを変えられる |
| 契約本文の全文をチャットへ出す | しない。台帳は概要（L1）まで |
| eID 検証が失敗・鍵が無い | 422。検証できないものを「有効」と言わない |
| 医療機器台帳への書き込み | 405 |
| 想定外の例外 | catch して JSON。プロセスは落とさない |

## 区分と等級

- **区分 A** — 単独決裁。`chat:approve` を持つ席が1つで足りる
- **区分 B** — 両代表。決裁が2件揃うまで承認は確定しない。金額があれば
  Settlement PassKey の step-up も要る（[認証の面](auth.md)）
- **等級 A / B / C** — ローカル LLM の変更ゲート。C は apply 経路を持たない
  （[operator-policy](../../steward/rules/operator-policy.md) §4.1a）

## 監査

決裁・起票・適用はすべて `appendChatAudit` を通り、`operator_id` と
`approver_id` の両方を残す。LLM / MCP はこの経路を呼べない。

## やらないこと

- LLM による最終承認。提案と下書きまで
- 会社イベントの物理削除。取り消しは void イベントで表す
- `chain backfill --force` を通常の復旧手段にすること

## テスト

| 層 | パス |
|---|---|
| 単体 | `tests/org-approval.test.ts` · `tests/operator-change.test.ts` |
| HTTP | `tests/steward-chat-governance-http.test.ts` · `tests/steward-chat-commands-http.test.ts` · `tests/steward-chat-events-api.test.ts` · `tests/steward-chat-medical-device-http.test.ts` |
| E2E | `e2e/steward-chat.governance.spec.ts` |
