# OOO 99点プログラム — チケット台帳

90点プログラム（[ooo-90-program.md](ooo-90-program.md)）の続き。当初の 53 件（現在 57 件）を、
今度は **99 点** まで引き上げる。1 件ずつ「洗い出し → 対策比較 → 選定 → 実装 →
テスト → 再採点」を回す方針は変えていない。

- 採点正本: [ooo-capability-items.yaml](ooo-capability-items.yaml)
- 採点: `npm run ooo:score -- --gate 99`
- E2E の緑記録: `npm run ooo:e2e`

## 出発点で見えた問題

90点時点の平均は 90.5 で、内訳は「仕様18 + 実装22〜24 + テスト30 + 実機20」だった。
テストと実機はすでに満点で、**99 に届かせるには仕様と実装の点を上げるしかない**。
ところがこの2軸だけは YAML に手で書いた数字で、機械化されていなかった。
このまま数字を 20 と 29 に書き換えれば形の上では 99 になるが、それは
「点は手で書かない」という 90点プログラムの前提を壊す。

そこで最初のチケットを、**採点の残り2軸の機械化**にした。

## W0' 採点の機械化 II

仕様と実装を宣言値から証跡算出に変えた（`scripts/ooo-score.ts`）。

| 軸 | 満点 | 算出 |
|---|---|---|
| 仕様 | 20 | `spec.docs` が全て実在（8）+ `spec.mentions` の各文字列が文書内に在る（4点 × 最大3） |
| 実装 | 30 | `impl.sources` 実在（6）+ 権限ガード（6）+ 入力検証（6）+ 例外封じ込め（6）+ HTTP テストが拒否を主張（6） |

`mentions` は慣例として **経路・必要権限・拒否条件** の3つを書く。文書が現物から
ずれればその文字列は消え、点も落ちる。ガードはソースを正規表現で走査して
検出するので、`impl` の数字を自分で申告することはできない。

機械化した直後の点は **全 53 件が 50 点**（テスト30 + 実機20 のみ）だった。
これが手を入れる前の、証跡だけで言える本当の状態になる。

## 各波で見つけた実装の穴

文書を書き、証跡を繋いでいく過程で、採点器が実際の欠陥を5つ拾った。

1. **決済 step-up をセッションだけで開けた**（`settlement-api.ts`）—
   `POST /chat/v1/settlement/challenge` は `opts.user` の有無しか見ておらず、
   読み取り専用の席でも金の儀式を開始できた。儀式は承認の前半なので
   `chat:approve` を要求するよう変更し、拒否のテストを追加。
2. **医療機器の読み口に例外の封じ込めが無かった**（`medical-device-api.ts`）—
   台帳はテナント YAML から射影しており、手で壊れうる。try/catch で 422 に
   落とすようにした。規制対象の読み取り面がプロセスごと落ちるのは筋が悪い。
3. **ローカル LLM 経路に拒否のテストが無かった** — セッション無しで
   `/chat/v1/message` が何を返すかを誰も主張していなかった。追加。
4. **Stripe の拒否が2つとも無主張だった** — 代表以外の `stripe-settings` と、
   署名が通らない webhook。両方テストを追加。webhook の実際の応答は 422 で、
   文書側の記述（400）が現物とずれていたのでこちらを直した。
5. **採点器の検出漏れ 3 件** — `json(400, ...)`（`res` を閉じ込めた形）、
   ZodError からの status マッピング、`requireWireConsolePermission`。
   いずれも実装は正しく、検出側が狭すぎた。正規表現を広げた。

## 追加した仕様文書

証跡として指定できる文書が無かったので、面ごとに5本書いた。各文書は
**経路と必要権限の表・拒否条件の表・やらないこと・テストの所在**を持つ。

| 文書 | 対象 |
|---|---|
| [ooo-surfaces/auth.md](ooo-surfaces/auth.md) | OOO-01〜03 認証・PassKey 3種 |
| [ooo-surfaces/ledger.md](ooo-surfaces/ledger.md) | OOO-09〜14 金銭と帳簿 |
| [ooo-surfaces/governance.md](ooo-surfaces/governance.md) | OOO-04〜08 · 40〜46 統治と法務 |
| [ooo-surfaces/tax-pay.md](ooo-surfaces/tax-pay.md) | OOO-15〜23 税務・給与・精算 |
| [ooo-surfaces/ops.md](ooo-surfaces/ops.md) | OOO-24〜28 · 37〜39 対話と運用 |
| [ooo-surfaces/mail.md](ooo-surfaces/mail.md) | OOO-29〜36 通信 |
| [ooo-surfaces/product.md](ooo-surfaces/product.md) | OOO-47〜53 営業と製品 |
| [ooo-surfaces/connectors.md](ooo-surfaces/connectors.md) | OOO-54〜57 外部連携ハブ |

## 完了時点の全体

**57 件すべて 99 点以上 · 平均 100.0**（2026-08-30 実測。外部連携ハブの
OOO-54〜57 を加えたあとの再採点）。

- E2E 緑 23 本。`npm run ooo:e2e` で再現
- `npm run ooo:score -- --gate 99` が exit 0
- 4 軸すべてが証跡から算出される。YAML に点数の欄はもう無い

### 再採点で落ちた分と、その原因

能力を4件足した直後の採点は **平均 78.9 · 99点以上 1 件** だった。落ちた理由は
実装の劣化ではなく証跡側の2つで、どちらも採点器が正しく拾った欠陥である。

1. **E2E の緑記録が一部しか無かった** — 前回の実行が中断し、
   `tests/.ooo-e2e-green.json` に passkey 系6本だけが残っていた。取り直すと
   主 config が「ポート 9473 使用中」で起動できず、残骸サーバーを落として
   再実行して緑 23 本に戻した（赤 1 本 `steward-chat.runboard.spec.ts` は
   採点対象の能力に紐づいていない）。
2. **文書と経路のずれ 5 件** — `POST /chat/v1/correspondence/send` は現物が
   `POST /chat/v1/correspondence/:id/send`。`GET /chat/v1/receipts` ·
   `GET /chat/v1/org/chart/change` · `GET /chat/v1/ledger/bank-csv-template`
   は実装にあって文書に無かった。`GET /chat/v1/mail/secrets` は
   「読み出す API を持たない」ことを拒否表に書いていたのを、経路の宣言と
   読み違えないよう書き換えた。
3. **走査側の検出漏れ 1 件** — `if (pathname !== "/x") return false;` で
   1経路を占有し、メソッドを下で分岐する書き方では最初の1メソッドしか
   拾えず、`PUT /chat/v1/platform/integration` が「文書にあって実装に無い」
   と出ていた。ブロック全体から全メソッドを集めるようにした（`scripts/ooo-routes.ts`）。

つまり点は、能力を足すたびに文書・E2E 記録・走査の3点を揃え直さないと
戻らない。これは仕組みの意図どおりである。

残っている限界も書いておく。ガードの検出は正規表現なので、「権限ガードが
**在る**」ことは言えても「**正しい権限**が掛かっている」ことまでは言えない。
そこは `mentions` に必要権限を書かせ、文書と実装を人が突き合わせる前提で運用する。
