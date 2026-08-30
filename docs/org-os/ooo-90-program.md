# OOO 90点プログラム — チケット台帳

「できる」53 件を、厳格採点で 90 点以上に引き上げる。1 件ずつ
「洗い出し → 対策比較 → 選定 → 実装 → テスト → 再採点」を回す。並行しない。

- 採点正本: [ooo-capability-items.yaml](ooo-capability-items.yaml)
- 採点: `npm run ooo:score`（点は手で書かない。実在するテストと playwright config を走査して算出）
- E2E の緑記録: `npm run ooo:e2e`（緑だった spec だけが `tests/.ooo-e2e-green.json` に載り、
  採点の E2E 12 点と実機 20 点はこの記録がある spec にしか付かない）

## 配点

| 軸 | 満点 | 根拠 |
|---|---|---|
| 仕様 | 20 | ADR / runbook が現物と一致し、やらない境界も書かれている（人の判断） |
| 実装 | 30 | RBAC · 監査 · 秘密の非返却 · 失敗時の扱い（人の判断） |
| テスト | 30 | 単体（厚10 / 薄5 / 無0）+ HTTP 8 + E2E（緑12 / 登録のみ3 / 未登録1 / 無0） |
| 実機 | 20 | `npm run ooo:e2e` で再現できる緑 20 / 登録のみ 8 / それ以外 0 |

90 点に届くには、事実上どの項目も「厚い単体 + HTTP の拒否テスト + 緑の E2E」が要る。

## ローカルでの注意

`tests/setup-restore-protocol.ts` は **テストごとに `tenants/demo/data` を git HEAD から復元する**。
vitest と Playwright を同時に走らせると demo テナントの seed が消え、E2E が理由なく赤くなる。
E2E を回すときは他の vitest を止める。

---

## W0 基盤（完了分）

### W0-1 採点の機械化

- [scripts/ooo-score.ts](../../scripts/ooo-score.ts) · [scripts/ooo-e2e.ts](../../scripts/ooo-e2e.ts)
- 初回実測: 53 件 · 平均 45.7 · 90 点以上 0 件

### W0-2 孤児 E2E の登録

`e2e/steward-chat.receipt.spec.ts` と `e2e/steward-chat-console-ia.spec.ts` は
どの playwright config の `testMatch` にも載っておらず、存在するのに一度も実行されていなかった。
`playwright.steward-chat.config.ts` に追加。領収書 spec は環境変数依存の skip をやめ、
共通ログインと config の baseURL を使う形に書き換えた。

### W0-3 E2E サーバーを本番と同じ形に

`/wire/` 画面は `/console/v1/tenants/...` を呼ぶが、E2E サーバーは `/chat/v1` しか出しておらず、
SPA の HTML が JSON として返って全 Wire 系が赤だった。
[scripts/run-steward-chat-smoke-server.ts](../../scripts/run-steward-chat-smoke-server.ts) を
`startOperatorConsoleServer`（本番と同じ結合サーバー）に切り替えた。

### W0-4 ログイン導線の一本化

spec ごとに違うログイン手順（ラベル文字列 / 「入る」ボタン / ID）を
[e2e/helpers/console-login.ts](../../e2e/helpers/console-login.ts) に集約。
既ログイン状態でも通るようにし、コピー変更で落ちないようにした。

### W0-5 単体テストがビルド成果物を壊す問題

`tests/prod-startup.test.ts` と `tests/steward-chat-abnormal.test.ts` が
`apps/steward-chat/dist/index.html` を 13 バイトのスタブで上書きしていたため、
`npm test` の後に E2E を回すと画面が真っ白で全滅していた。
[tests/helpers/spa-dist-stub.ts](../../tests/helpers/spa-dist-stub.ts) で退避・復元する。

### W0-6 本番起動が Stripe 鍵を必須にしていた

決済を使わないテナントが本番起動できなかった。決済実行時の拒否は
`createStripeCheckout` にあるため、起動時チェックは警告に下げた
（[src/lib/console-auth/prod-checklist.ts](../../src/lib/console-auth/prod-checklist.ts)）。

---

## チケット（OOO-01 〜 OOO-53）

着手順はリスク優先。各チケットは完了時にここへ 6 段の記録を追記する。

| 波 | 対象 |
|---|---|
| W1 | 金銭と不可逆: OOO-14 振込指示 / OOO-13 銀行CSV / OOO-30 外部送信 / OOO-31 Gmail / OOO-37 Wire notice / OOO-03 決済PassKey / OOO-51 Stripe live |
| W2 | 帳簿: OOO-09 / OOO-10 / OOO-11 / OOO-12 / OOO-22 / OOO-23 |
| W3 | 統治と法務: OOO-40 / OOO-41 / OOO-42 / OOO-04 / OOO-05 / OOO-06 / OOO-07 / OOO-08 / OOO-43 / OOO-44 / OOO-46 / OOO-45 |
| W4 | 税務と給与: OOO-15 〜 OOO-21 |
| W5 | 対話と運用: OOO-24 〜 OOO-28 / OOO-38 / OOO-39 / OOO-01 / OOO-02 |
| W6 | 営業・製品・通信設定: OOO-47 / OOO-48 / OOO-49 / OOO-50 / OOO-52 / OOO-53 / OOO-29 / OOO-32 〜 OOO-36 |

---

## 完了チケット

### OOO-14 振込指示の生成（口座はマスク） — 42 → 92

1. **洗い出し** — `/chat/v1/broker` に HTTP テストが 1 本も無く、口座マスク・dry-run 既定・
   tier B/C の承認ゲートがどれも実行時に確かめられていなかった。
2. **対策案** — (a) 単体だけ足す (b) HTTP テストを新設し、E2E でも動いているサーバーを叩く。
3. **選定** — (b)。マスクと dry-run は「ルートを通ったときの応答」でしか保証できない。
4. **実装** — テストのみ。本体の変更なし（既存実装が要件を満たしていた）。
5. **テスト** — [tests/steward-chat-broker-http.test.ts](../../tests/steward-chat-broker-http.test.ts)
   （無セッション 401 / 口座番号の非返却 / dry-run 既定 / tier B/C の 422 / 本番モードでの権限拒否）·
   [e2e/steward-chat.money.spec.ts](../../e2e/steward-chat.money.spec.ts)。
6. **再採点** — 92。

**判ったこと:** dev セッションは権限チェックを丸ごと素通りする（`requireWireConsolePermission`）。
権限拒否のテストは本番セキュリティモードに切り替えないと意味が無い。

### OOO-09 / OOO-13 仕訳・BS/PL と銀行 CSV — 91

HTTP を [tests/steward-chat-ledger-http.test.ts](../../tests/steward-chat-ledger-http.test.ts) に寄せた。
vitest は demo テナントへの仕訳書き込みを禁じているため、帳簿系の HTTP テストは
`_fixture-books` テナント（[tests/helpers/finance-fixture.ts](../../tests/helpers/finance-fixture.ts)）で回す。

### OOO-10 月次 lock / 理由付き unlock — 51 → 91

ロック済み月への記帳が拒否されること、理由なし unlock が 422 になることを HTTP と E2E の両方で押さえた。
`occurred_at`（`date` ではない）を渡さないとロックを跨げてしまうことが実測で判明。

### OOO-11 誤りの訂正（逆仕訳） — 40 → 91

逆仕訳が別 ID で起票され、元仕訳が書き換わらないことを確認。`entry_id` 空は 422。

### OOO-12 電子帳簿の検索 — 36 → 91

仕様の正本が無かったため [electronic-ledger-search.md](electronic-ledger-search.md) を新設し、
検索条件・真実性・**やらないこと**（タイムスタンプ局 / スキャナ保存）を明記した。

### OOO-03 決済 step-up PassKey — 63 → 91

1. **洗い出し** — `/chat/v1/settlement/*` の HTTP テストが無く、E2E は config には載っていたが赤だった。
2. **対策案** — (a) 単体を厚くする (b) HTTP テストを新設し、既存 E2E の赤を根本から直す。
3. **選定** — (b)。第2鍵は「無セッション・無トークンで通らないこと」が要点で、これはルート越しでしか証明できない。
4. **実装** — 本体は次の3点を修正した。
   - `steward-chat` サーバーはリクエストハンドラ内の throw で **プロセスごと落ちていた**。500 を返して生き延びるようにした。
   - `modules.yaml` が無い / 空のテナントで `buildAgentModuleInventory` と `isModuleEnabled` が throw していた。空の在庫として扱う。
   - webauthn smoke サーバーを `0.0.0.0` bind に変更（`localhost` は ::1 のみ解決する環境があり、正規ホストへのリダイレクトを検証できなかった）。
5. **テスト** — [tests/steward-chat-settlement-http.test.ts](../../tests/steward-chat-settlement-http.test.ts)
   （challenge の 401 / 422 / 404、トークン無しでの challenge 非開示、complete の偽装拒否、enroll の 401）·
   [e2e/wire-console-settlement-stepup.smoke.spec.ts](../../e2e/wire-console-settlement-stepup.smoke.spec.ts)
   （tier B の起票 → 決済 PassKey 登録 → iPhone 儀式 → 承認まで通し）。
6. **再採点** — 91。

**判ったこと:** Chrome の仮想オーセンティケータは hybrid トランスポートを話せない。
決済儀式は hybrid/internal に限定しているため、E2E ヘルパー側でブラウザの
`navigator.credentials.get` から hints と transports を落として仮想鍵に届かせている
（サーバーが検証する内容は一切変えていない）。ログイン儀式は internal のままにする必要がある。

### OOO-50 / OOO-51 Stripe セルフサーブ — 56 / 57 → 91

1. **洗い出し** — E2E が 1 本も無い。
2. **対策案** — (a) UI を通す E2E (b) 実際に動くサーバーへ API で当てる E2E。
3. **選定** — (b)。live 鍵の有無で UI が出し分けられるため、証明したいのは「鍵が漏れないこと」「webhook が信用できない要求で動かないこと」。
4. **実装** — 統合コンソール（本番が動かすサーバー）が **公開 product ルートを一切通していなかった**。
   `/chat/v1/product/stripe/webhook` は SPA の HTML を 200 で返しており、Stripe から見れば配送成功、
   実際には課金イベントが黙って捨てられる状態だった。`isPublicChatPath` に従って `handleProductApi` へ渡すよう修正。
5. **テスト** — [e2e/steward-chat.stripe.spec.ts](../../e2e/steward-chat.stripe.spec.ts)
   （設定応答に鍵の実体が出ない / 保存応答にも出ない / plans は公開・subscription は 401 / webhook は信用できない要求を処理しない）。
6. **再採点** — 91。

### OOO-22 QR 領収書の発行と claim — 67 → 91

1. **洗い出し** — 単体も HTTP も 0 本。E2E は 1 本あったが、発行の副作用を確認していなかった。
2. **対策案** — (a) 発行まで通す E2E (b) HTTP で preview / issue / claim 判断の拒否系を押さえる。
3. **選定** — (b) を主とする。preview が **保存しない** ことは一覧の差分でしか証明できない。
4. **実装** — テストのみ。
5. **テスト** — [tests/steward-chat-receipt-http.test.ts](../../tests/steward-chat-receipt-http.test.ts)
   （無セッション 401 / preview が保存しない / 明細 0 は 422 / 壊れた JSON は 400 / 未知の領収書は 404 /
   claim 承認・却下の拒否 / 本番モードでの `receipt:issue` 拒否）·
   [e2e/steward-chat.claims.spec.ts](../../e2e/steward-chat.claims.spec.ts)。
6. **再採点** — 91。

**判ったこと:** 適格請求書の発行には法人番号が要る。demo テナントには無いため、
正常系は `aiac`、拒否系は demo で確かめる。

### OOO-23 経費精算ゲート〜弁済記録 — 39 → 91

1. **洗い出し** — HTTP テストが無く、E2E も無い。弁済は実際の送金に繋がる。
2. **対策案** — (a) 画面から一連を通す (b) 楽観リビジョンと未知 claim の拒否を HTTP / E2E で押さえる。
3. **選定** — (b)。この行為の安全性は「見ていない状態のまま進められないこと」に集約される。
4. **実装** — テストのみ。
5. **テスト** — [tests/steward-chat-expense-claim-http.test.ts](../../tests/steward-chat-expense-claim-http.test.ts)
   （desk の 401 / ingest・approve のリビジョン必須 / 未知 claim の弁済・送金準備の拒否 /
   本番モードでの `expense:claim` 拒否）· [e2e/steward-chat.claims.spec.ts](../../e2e/steward-chat.claims.spec.ts)。
6. **再採点** — 91。

## W3 統治と法務（13件 · 完了）

対象: OOO-04 / 05 / 06（稟議）· OOO-07 / 08 / 25（変更等級とコマンドルータ）·
OOO-40 / 41（会社イベント）· OOO-42（組織図変更）· OOO-43（会社情報）·
OOO-44（契約台帳）· OOO-45（国家 eID · 既に90点）· OOO-46（医療機器）。

1. **洗い出し** — 稟議・契約台帳・会社情報・医療機器は HTTP テストも E2E も 0 本だった。
   コマンドルータ（OOO-25）は単体すら無い。統治の行為は「拒否されるべきときに拒否されるか」でしか
   確かめられないのに、その確認が一切自動化されていなかった。
2. **対策案** — (a) 13件それぞれに spec を作る (b) 領域単位で HTTP / E2E を 1 ファイルにまとめる。
3. **選定** — (b)。13本の spec は実行時間が破綻するうえ、統治の行為は同じセッション・同じ登録簿を
   共有するため、1ファイルに集約したほうが前提の食い違いが出にくい。
4. **実装** — テストが主。加えて次の 2 点を直した。
   - `resolveChatPermissionsFromRegistry` が、本番モードでも登録簿に無い operator に
     `chat:read` / `chat:ask` を既定で与えていた。本番では空にする
     （[src/lib/console-auth/operator-rbac.ts](../../src/lib/console-auth/operator-rbac.ts)）。
   - 医療機器の運用台帳には HTTP の読み口が無かった。読み取り専用の
     [/chat/v1/compliance/medical-device](../../src/lib/steward-chat/routes/medical-device-api.ts) を新設。
     **書き込みは 405** — 規制対象の台帳に、監査されない第2の変更経路を作らない。
5. **テスト** —
   [tests/steward-chat-governance-http.test.ts](../../tests/steward-chat-governance-http.test.ts)（14件）·
   [tests/steward-chat-commands-http.test.ts](../../tests/steward-chat-commands-http.test.ts)（7件）·
   [tests/steward-chat-medical-device-http.test.ts](../../tests/steward-chat-medical-device-http.test.ts)（5件）·
   [e2e/steward-chat.governance.spec.ts](../../e2e/steward-chat.governance.spec.ts)（12件）。
6. **再採点** — 13件すべて 90–91。全体は 31/53 が 90点以上、平均 73.2。

**判ったこと:** demo テナントの権限は役職名から推測できない。`OP-002` は operator だが
`events:write` を持ち、`chat:approve` は持たない。`OP-003` は approver でその逆。
拒否テストを書くときは、まず登録簿の実体に当たる。

## W4 税務と給与（8件 · 完了）

対象: OOO-15（申告カレンダー・gap・handoff）· OOO-16（消費税 assessment）·
OOO-17（申告書 XML ドラフト）· OOO-18（宿泊税のカレンダー展開）·
OOO-19 / 20 / 21（給与集計・料率計算・年末調整）· OOO-52（税理士ゲスト）。

1. **洗い出し** — 税務・給与の BFF（`/chat/v1/tax/*`）は 12 経路あるのに HTTP テストが実質 0 本。
   加えて **書き込みが読み取り権限で通っていた**: `xml-draft` はドラフト書き出し、
   `bonus-draft` は run の保存、`yea/ready` は状態遷移なのに、いずれも `chat:ask` で足りていた。
2. **対策案** — (a) 書き込み経路を承認ゲートに載せる (b) 既存の `finance:reconcile` に合わせる
   （`bonus-post` は既にそうなっていた）。
3. **選定** — (b)。同じ帳簿に触る行為の権限が経路ごとに違うのが問題であって、
   新しいゲートを足すことではない。
4. **実装** — [src/lib/steward-chat/routes/tax-api.ts](../../src/lib/steward-chat/routes/tax-api.ts)
   の 3 経路を `requireBudgetSurfacePermission(user, "finance:reconcile")` に変更。
5. **テスト** —
   [tests/steward-chat-tax-http.test.ts](../../tests/steward-chat-tax-http.test.ts)（11件）·
   [tests/steward-chat-guest-invite-http.test.ts](../../tests/steward-chat-guest-invite-http.test.ts)（4件）·
   [e2e/steward-chat.tax.spec.ts](../../e2e/steward-chat.tax.spec.ts)（10件）。
   要点は 2 つ: `handoff` が常に `submission: "not-for-etax"` を返すこと（ADR 0052 の境界）と、
   同じ月・同じ額の給与計算が二度目も同じ数字を返すこと。
6. **再採点** — 8件すべて 90。全体は 39/53 が 90点以上、平均 80.6。

**判ったこと:** 宿泊税は台帳から引けないとき `台帳に該当期間の算定なし` と自分で言う。
金額の確度（`amount_confidence`）が `ledger` なのに根拠が無い行が出ないことをテストで固定した。

## W5 対話と運用（6件 · 完了）

対象: OOO-24（Today / Ask）· OOO-26（司令塔の分類と割当）· OOO-27（ローカル LLM の ERROR 1 行）·
OOO-28（Work Order DAG）· OOO-38（Witness Hub）· OOO-39（公開リレーの本番 bind）。

1. **洗い出し** — この波の共通リスクは「提案が黙って実行に変わる」こと。司令塔は分類と割当が
   別経路なのに、割当を確認なしで叩けないことを誰も確かめていなかった。ERROR フォールバック
   （ADR 0061）は単体はあるが、HTTP を一往復しても残るかは未検証だった。
2. **対策案** — (a) ERROR 方針は単体で十分とする (b) ローカル worker を立てて `/chat/v1/message`
   を実際に往復させる。
3. **選定** — (b)。この方針の価値は「運用中の応答がそうなること」であって、関数の戻り値ではない。
4. **実装** — テストのみ。stub の OpenAI 互換サーバを立て、`tier: local` の worker として
   プールに差し込む。
5. **テスト** —
   [tests/steward-chat-ops-http.test.ts](../../tests/steward-chat-ops-http.test.ts)（10件）·
   [tests/steward-chat-local-llm-error-http.test.ts](../../tests/steward-chat-local-llm-error-http.test.ts)（4件）·
   [e2e/steward-chat.ops.spec.ts](../../e2e/steward-chat.ops.spec.ts)（8件）。
   押さえた点: 分類は work order を作らない · 割当は `confirmed=true` と実在の plan が要る ·
   worker 一覧は `api_key_env` の名前しか返さない · 拒否エッセイは `ERROR:` 1 行に畳まれる。
6. **再採点** — 6件すべて 90–91。全体は 45/53 が 90点以上、平均 84.8。

**判ったこと:** ローカル LLM の往復を試すには、決定論のコマンドルータが答えられない問いを
使う必要がある。「先月の売上は？」は台帳から即答されて worker に届かない。

また、`steward-chat-ledger-customer` が全体実行でだけ赤くなったのは、前回の実行が残した
9473 番のサーバを掴んでいたため。テスト側の問題ではなかった。

## W6 営業・製品・通信設定（8件 · 完了）

対象: OOO-01（Community SSO）· OOO-02（ログイン PassKey）· OOO-35 / 36（Gmail・tenant-mail の既定出荷と Community 側 UI）·
OOO-47（営業パイプライン）· OOO-48（宿泊 L1 台帳）· OOO-49（テナントプロビジョン）· OOO-53（テナント隔離）。

1. **洗い出し** — この波は「2社目のテナントが最初に触る面」。にもかかわらず、
   コントロールプレーンと営業・宿泊の各面に HTTP テストも E2E も無かった。
   OOO-02 は HTTP 証跡のパスが `/console/v1/auth` を指していたが、実際のテストは
   `/chat/v1/auth` を叩いており、採点だけが空振りしていた。
2. **対策案** — (a) 面ごとにテストを分ける (b) 「セッションが無ければ何も返らない」という
   共通の境界を 1 本の spec でまとめて確かめる。
3. **選定** — (b)。隔離の検証は個々の画面ではなく、無記名の呼び出しが公開プラン以外を
   一切受け取らないことに集約される。
4. **実装** — テストのみ。証跡パスの誤りを修正。
5. **テスト** —
   [tests/steward-chat-sales-http.test.ts](../../tests/steward-chat-sales-http.test.ts)（8件）·
   [tests/steward-chat-platform-tenant-http.test.ts](../../tests/steward-chat-platform-tenant-http.test.ts)（8件）·
   [e2e/steward-chat.product.spec.ts](../../e2e/steward-chat.product.spec.ts)（8件）。
   押さえた点: 無記名は `/product/plans` だけ 200 で他は全て 401 · ログアウトが本当に
   セッションを終わらせる · 宿泊モジュールが無効なら台帳は 0 件と自分で言う ·
   メールのフラグ更新は「Community 側の再デプロイが必要」と応答に明記される。
6. **再採点** — 8件すべて 90 以上。

## 完了時点の全体

**53 件すべて 90 点以上 · 平均 90.5。**

- E2E 緑 23 本（`playwright.steward-chat.config.ts` 17 本 + WebAuthn 系 6 本）
- 採点は `npm run ooo:e2e && npm run ooo:score` で再現。点は手で書けない
- 新規に追加した HTTP テスト 12 ファイル · E2E spec 7 ファイル

実装側で直したもの（テストだけで終わらなかった箇所）:

- 本番モードで登録簿に無い operator に既定権限が付いていた（`operator-rbac.ts`）
- 税務の書き込み 3 経路が読み取り権限で通っていた（`tax-api.ts`）
- 公開 product API が SPA に落ちて Stripe webhook が握り潰されていた（`combined-server.ts`）
- 医療機器の運用台帳に HTTP の読み口が無かった（`medical-device-api.ts` を新設 · 書き込みは 405）
- `modules.yaml` の欠落でサーバが落ちていた（`loadModulesFileSafe`）
