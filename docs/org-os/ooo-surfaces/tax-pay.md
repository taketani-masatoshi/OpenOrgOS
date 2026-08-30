# 税務・給与・精算の面（OOO-15〜OOO-23）

**実装:** `src/lib/steward-chat/routes/tax-api.ts` · `receipt-api.ts` · `org-budget-api.ts`
**採点:** `docs/org-os/ooo-capability-items.yaml` の OOO-15〜OOO-23

申告・給与・領収書・経費精算。ここは**計算が毎回同じ答えを返すこと**と、
**提出は人間がすること**の2点が要件で、自動提出は範囲外。

## 経路と必要権限

| 経路 | 権限 | 用途 |
|---|---|---|
| `GET /chat/v1/tax/calendar` | `chat:read` | 申告カレンダー（宿泊税の台帳展開を含む） |
| `GET /chat/v1/tax/gaps` | `chat:read` | 期限に対する不足 |
| `GET /chat/v1/tax/readiness` | `chat:read` | 提出準備の状態 |
| `GET /chat/v1/tax/consumption` | `chat:read` | 消費税の本則差額集計 |
| `POST /chat/v1/tax/handoff` | `chat:ask` | 税理士への引渡し ZIP の要求 |
| `POST /chat/v1/tax/payroll-calc` | `chat:ask` | 料率に基づく給与計算 |
| `POST /chat/v1/tax/xml-draft` | `finance:reconcile` | 申告書 XML / 別表ドラフト |
| `POST /chat/v1/tax/bonus-draft` | `finance:reconcile` | 賞与ドラフト |
| `POST /chat/v1/tax/bonus-post` | `finance:reconcile` | 給与・賞与仕訳の起票 |
| `POST /chat/v1/tax/yea/ready` | `finance:reconcile` | 年末調整の確定ドラフト |
| `GET /chat/v1/receipts` | `chat:read` | 発行済み領収書の一覧 |
| `POST /chat/v1/receipts/preview` | `chat:ask` | QR 領収書の下書き |
| `GET /chat/v1/org/budget` | `chat:read` | 予算枠と消化の一覧 |
| `POST /chat/v1/org/budget/expense-claim/gate` | `chat:ask` | 立替の可否判定（申請の入口） |
| `GET /chat/v1/org/budget/expense-claim/desk` | `chat:read` | 精算デスク（決裁待ち一覧） |
| `POST /chat/v1/org/budget/expense-claim/ingest` | `chat:ask` | 領収書の取込 |
| `GET /chat/v1/org/budget/expense-claim/:id/receipt` | `chat:read` | 取込んだ領収書の参照 |
| `POST /chat/v1/org/budget/expense-claim/approve` | `chat:approve` | 精算の決裁（承認） |
| `POST /chat/v1/org/budget/expense-claim/reject` | `chat:approve` | 精算の決裁（却下） |
| `POST /chat/v1/org/budget/expense-claim/prepare-transfer` | `broker:transfer` | 弁済の振込指示を組む |
| `POST /chat/v1/org/budget/expense-claim/reimburse` | `broker:transfer` | 弁済の記録を閉じる |

同じ面は `/api/v1/org/budget/...` にも載る（Console の SPA が使う別名）。
`GET /api/v1/org/budget` · `POST /api/v1/org/budget/expense-claim/gate` ·
`GET /api/v1/org/budget/expense-claim/desk` ·
`POST /api/v1/org/budget/expense-claim/ingest` ·
`POST /api/v1/org/budget/expense-claim/approve` ·
`POST /api/v1/org/budget/expense-claim/reject` ·
`POST /api/v1/org/budget/expense-claim/prepare-transfer` ·
`POST /api/v1/org/budget/expense-claim/reimburse` は同じ権限・同じ拒否条件で動く。

読むだけなら `chat:read`、帳簿や確定ドラフトを作るものは `finance:reconcile`。
計算の下書きは `chat:ask` で開くが、**帳簿へ落とす瞬間だけ権限が上がる**。

## 拒否する条件

| 状況 | 応答 |
|---|---|
| セッションが無い | 401 `unauthorized` |
| 読み取り権限だけで XML / 賞与 / 年調確定を呼ぶ | 403 `forbidden` |
| 給与計算の月・総額が無い | 422 `month YYYY-MM and gross_yen are required` |
| 賞与の期間・総額が無い | 422 `period and gross_yen required` |
| 仕訳起票に run_id が無い | 422 `run_id required` |
| 適格請求書に法人番号が無いテナント | 422。番号の無いまま「適格」と称さない |
| 精算が予算ゲートを超える | 承認へ回す。黙って通さない |
| 見つからない精算 ID | 404 `claim_not_found` |
| 想定外の例外 | catch して 400 / 422 の JSON |

## 決定論

`payroll-calc` と `yea/compute` は同じ入力に同じ料率表を当てれば必ず同じ額を返す。
料率はテナントの YAML にあり、コード内に定数で埋めない。E2E は同じ月を2回
呼んで一致することを見る。

## やらないこと

- e-Tax / eLTAX への自動提出。生成するのは XML とドラフトまで
- 税額の最終判断。差額集計は出すが、申告是非は税理士と代表が決める
- 個人の給与明細をチャットへ出すこと（L2）

## テスト

| 層 | パス |
|---|---|
| 単体 | `tests/payroll-jp.test.ts` · `tests/consumption-tax-journal.test.ts` · `tests/statutory-filing-readiness.test.ts` |
| HTTP | `tests/steward-chat-tax-http.test.ts` · `tests/steward-chat-receipt-http.test.ts` · `tests/steward-chat-expense-claim-http.test.ts` |
| E2E | `e2e/steward-chat.tax.spec.ts` · `e2e/steward-chat.claims.spec.ts` · `e2e/steward-chat.receipt.spec.ts` |
