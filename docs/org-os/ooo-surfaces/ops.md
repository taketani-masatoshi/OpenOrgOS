# 対話と運用の面（OOO-24〜OOO-28 · OOO-37〜OOO-39）

**実装:** `src/lib/steward-chat/routes/chat-api.ts` · `tower-api.ts` · `orchestration-api.ts` ·
`platform-api.ts` · `src/lib/operator-runtime/local-llm-error-fallback.ts`
**採点:** `docs/org-os/ooo-capability-items.yaml` の OOO-24〜OOO-28 · OOO-37〜OOO-39

毎日使う面。Today と Ask、依頼を CLI に落とす司令塔、Work Order の進行、
そして組織間の Wire。**LLM が勝手に会社を書き換えないこと**が共通の要件。

## 経路と必要権限

| 経路 | 権限 | 用途 |
|---|---|---|
| `GET /chat/v1/today` | `chat:read` | 今日の経営状況（JSON） |
| `GET /chat/v1/today.md` | `chat:read` | 同じ内容の markdown |
| `POST /chat/v1/message` | `chat:ask` | Ask。LLM への問い合わせ |
| `GET /chat/v1/tower/inventory` | `chat:read` | 司令塔の担当一覧 |
| `POST /chat/v1/tower/classify` | `chat:read` | 依頼の分類（読むだけ） |
| `POST /chat/v1/tower/assign` | `chat:ask` | 確認後の割当 |
| `GET /chat/v1/orchestration/runs` | `chat:read` | Work Order DAG の実行状況 |
| `POST /chat/v1/orchestration/runs/retry` | `chat:ask` | 失敗ノードの再実行 |
| `GET /chat/v1/hub/status` | `chat:read` + platform operator | Witness Hub / 公開リレーの状態 |
| `GET /console/v1/tenants` | Wire Console セッション | 見えるテナントの一覧 |
| `POST /console/v1/tenants/:id/notices/propose` | `protocol:approve` 手前の起票 | Wire notice の起票 |
| `POST /console/v1/tenants/:id/approvals` | `protocol:approve` | notice の承認（決裁面） |
| `POST /console/v1/tenants/:id/outbox` | `protocol:approve` | 承認済み notice の送信 |
| `POST /console/v1/tenants/:id/inbox` | `protocol:approve` | 受信 notice の取込 |
| `POST /console/v1/tenants/:id/snapshot` | Wire Console セッション | 台帳スナップショット |
| `POST /console/v1/tenants/:id/scenario` | Wire Console セッション | デモ用シナリオの投入 |

分類は読むだけなので `chat:read`、割当と再実行は `chat:ask`。Hub の状態は
プラットフォーム運用者だけが見る。

## 拒否する条件

| 状況 | 応答 |
|---|---|
| セッションが無い | 401 `unauthorized` |
| 読み取り権限だけで割当・再実行 | 403 `forbidden` |
| 本文が壊れている | 400 `invalid body` |
| 存在しない Work Order | 404 |
| プラットフォーム運用者でない席が hub/status | 403 |
| Wire の自己承認 | 拒否。提案者と承認者は別人 |
| LLM ワーカーの API キー要求 | 返さない。設定画面でもマスクする |
| 想定外の例外 | catch して JSON。プロセスは落とさない |

## 根拠が無いときの答え方

`tier: local` のワーカーは、prompt・tool 結果・添付のどこにも根拠が無いとき、
**`ERROR: <理由>` の1行だけ**を返す。「未確認です」の作文も、断り書きの長文も
出さない（[ADR 0061](../adr/0061-local-llm-error-fallback.md)）。
クラウドワーカーは従来どおり Grounding の「未確認」を使う。
意図的な `ERROR:` は Work Order を起票しない。

## やらないこと

- LLM が `data/**/*.yaml` を黙って書き換えること。変更は change plan を通す
- Wire notice の LLM による承認・送信
- Today に L2 の値（口座番号・個人携帯）を載せること

## テスト

| 層 | パス |
|---|---|
| 単体 | `tests/steward-chat-today.test.ts` · `tests/local-llm-error-fallback.test.ts` · `tests/dispatch-tower-classify.test.ts` · `tests/orchestration-dag.test.ts` |
| HTTP | `tests/steward-chat-ops-http.test.ts` · `tests/steward-chat-local-llm-error-http.test.ts` · `tests/wire-console-server.test.ts` · `tests/steward-chat-platform-api.test.ts` |
| E2E | `e2e/steward-chat.ops.spec.ts` · `e2e/steward-chat.runboard.spec.ts` · `e2e/steward-chat.wire.spec.ts` · `e2e/steward-chat.witness.spec.ts` |
