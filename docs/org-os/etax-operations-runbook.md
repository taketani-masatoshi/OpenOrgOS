# e-Tax運用ランブック

## 本番解放条件

以下をすべて満たすまで送信を有効化しない。

1. 国税庁配布元、取得日時、帳票版、手続ID、XSD SHA-256を仕様カタログへ登録する。
2. mapper、XSD validator、電子証明書signer、transportについて接続試験記録を残し、`certified`を有効にする。
3. 代表者または税理士の権限検査を`approveEtaxSubmission`の`authorize`へ接続する。
4. 秘密鍵は外部鍵保管またはOS鍵保管からsignerへ渡し、テナント・Git・監査JSONへ保存しない。
5. 申告状態ディレクトリとXML、署名、添付、`.xtx`は暗号化された保管領域に配置する。

本番の`EtaxSubmissionStore`は`{ production: true, encryptedStorage: true }`を指定する。未指定の暗号化保管は起動時に拒否する。これは暗号化製品そのものを実装するフラグではなく、暗号化済みボリューム/KMS管理ストレージを配備済みであることを構成管理で宣言するゲートである。

## 公式モジュールの登録

- 帳票mapperは`CatalogEtaxFormMapper`へ、mapping JSON、接続試験証跡、それぞれのSHA-256を渡す。
- XSD validatorは`commandEtaxXsdValidator`へ、絶対実行パス、実行ファイルSHA-256、適合試験証跡SHA-256を渡す。
- 電子署名は`CommandEtaxSigner`、送受信は`CommandEtaxTransport`を使用できる。いずれもシェルを介さず、固定された実行ファイルだけを起動する。
- APIキー、利用者識別番号、PIN、秘密鍵を引数、JSON状態、Git管理ファイルへ書かない。送受信モジュールに必要な秘密値は実行環境のsecret providerから渡す。
- `certified`は自己申告値として運用せず、実行ファイルと試験証跡のハッシュ一致を必須とする。

## 送信中断

`sending`で停止した場合、同じ申告を直ちに再送しない。`recoverInterruptedEtaxSubmission`で受付照会する。

- `found`: 受付結果を保存して状態を更新する。
- `not_found`: 失敗試行として記録し、`signed`へ戻した後に同じ冪等キーで再送する。
- `unknown`: `sending`を維持し、人間へエスカレーションする。

## 証跡

`verifyEtaxSubmissionEvidence`でXML、添付、署名ファイル、受付`.xtx`を検証する。既定保存期間は10年だが、テナントの法務・税務方針で`EtaxSubmissionStore`へ明示指定する。`legal_hold: true`の記録は保存期限経過後も削除しない。削除処理は本モジュールでは提供しない。

承認には`approveEtaxSubmissionWithHumanContext`を使い、Operator Registryの`chat:approve`と署名済み・単回使用のHumanApprovalContextを検証する。提出後は`recordEtaxAuditEvent`で申告ID、package SHA-256、受付番号をCompany Eventのハッシュチェーンへ記録する。

## 訂正・修正

`amended`または`corrected`は元の受付番号を必須とする。元申告とは別の申告ID・冪等キー・承認・署名を作成し、上書きしない。

## eLTAX

地方税は`src/lib/finance/eltax.ts`の独立スキーマとtransportを使う。e-TaxパッケージをeLTAX adapterへ渡すことはできない。
提出は prepare → approve → sign → sending → received/accepted/rejected の状態遷移を通し、`sending`中断時は受付照会後にだけ再送する。
本番は暗号化保管と、公式仕様・電子証明書・接続試験を完了した`officialIntegrationReady`の両方が必要である。未完了時は送信を拒否する。
法人住民税・法人事業税は`corporate-local-tax.ts`で計算するが、税率をコードへ固定しない。自治体コード、適用期間、公式資料URL・SHA-256を持つ認証済み税率プロファイルを必須とする。
