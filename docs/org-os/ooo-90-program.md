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
