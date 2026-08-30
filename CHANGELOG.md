# Changelog

All notable changes to OrgOS Operator Layer are documented here.

**Engineering rules / 憲章:** 正本 `steward/rules/engineering/` · 索引 `steward/rules/openorgos-engineering-constitution.md` — 変更時は本 CHANGELOG と該当 ADR を更新。

## [Unreleased]

### Added
- **医療機器台帳の読み取り面** — `GET /chat/v1/compliance/medical-device` が QMS / GVP 台帳・許可期限・未承認の決定・監査を射影する。GET 以外は 405、YAML 破損は 422。書き込みは CLI + org approval のままで、コンソールから台帳を書き換える経路は作らない
- **面ごとの証跡テスト** — money / books / mail / stripe / claims / governance / tax / ops / product の E2E 9本（`e2e/helpers/api-login.ts` 経由の BFF ログイン）と、面別 HTTP 単体テスト15本。各面で「入れる席」と「断られる席」の両方を主張する。Stripe 鍵はテスト用ファイルへ隔離し（`ORGOS_STRIPE_SECRETS_FILE`）、テストが実運用の鍵を読み書きしない
- **採点を証跡から出す（`npm run ooo:unit` / `ooo:routes`）** — 能力53件の仕様20点・実装30点を、YAML の手書き数字ではなくソース走査（権限ガード · 入力検証 · 例外封じ込め）と「緑になった Vitest の記録」から算出する。緑の記録に無いテストには点を与えない。`docs/org-os/ooo-surfaces/` が仕様側の証跡、[ooo-99-program.md](docs/org-os/ooo-99-program.md) が手順
- **2ハブ統合ドリル（`npm run ooo:integration`）** — `deploy/integration/docker-compose.yaml` の2ハブ構成に対して、組織間の登録・通知・承認・受領までを1コマンドで通す
- **モジュールの同時実行上限** — 業務・JP パック18件の manifest が `security.limits.concurrent_jobs` を宣言し、AIA が無制限に並列実行しない
- **所見に副次ギャップを併記** — 1つの統制に複数のギャップが立つとき、判定の根拠になった1件しか所見に出ていなかった。`other_gaps` を所見に追加し、レポートの問題点・課題表に「併記」列、改善提案に「あわせて」を出す。様式が未記入（`doc_missing`）で不適合と判定されたとき、その裏で記録内容も仕様を満たしていない（`record_invalid`）ことが担当者に届くようになる。
- **適合ドリル（`scripts/iso-conformity-drill.ts`）** — 使い捨てテナントに「適合するダミー」と「規則ごとに壊したダミー」を生成し、期待した重大度・メッセージで指摘されるかを照合する（14 枠 327 ケース）。第2段では `iso audit run` の総合判定とギャップ種別まで確認する。ダミーは証拠ではなく、実行後にテナントを破棄する。
- **監査枠組みの展開（ADR 0069）** — available 12 ISO の空レジスタを禁止し、HLS コア REQ + 領域記録を充填。`apply-precheck` / `brief` / `follow-up`。計画に `framework: iso|financial|jsox`。mal は 12 規格を enabled、ISO-22000 は適用除外。会計アサーションパックと JP モジュール `jp_jsox`（内部統制報告書・EDINET は出さない）。LLM は判定しない。
- **ISO 適合性検査の深化（記録内容 · 要求事項 · ISO 19011 · 署名）** — 証拠の「存在」しか見ていなかった検査を4層に分けた。**A層**: パックが `records.yaml` で記録ごとの仕様を宣言し（`computed` · `conditional_required` · `comparison` · `freshness` · `unique` · `non_empty` · `required_sections` · `no_placeholders` の**閉じた**語彙。式パーサは作らない）、`orgos iso records check` と `orgos validate` が検査する（`validate` は整合性ゲートなので warning、適合性のゲートは `records check --strict`）。`computeControlGaps` に `record_invalid` を追加し、「作られていない」と「内容が仕様を満たさない」を区別。根本原因と有効性確認のない「是正済み」は通らない。KPI ログの構造検査は `records.yaml` へ移し、`iso-kpi.ts` は原単位計算に縮めた。**B層**: `requirements.yaml`（ISO-21401 は39件、他パックは器）と `orgos iso requirements` で統制との被覆を双方向に検査（未被覆 · 孤立統制 · 参照切れ · 未検証）。ISO 本文は再配布できないため statement は言い換えであり、`verified_on` が埋まるまで結果は「規格への網羅性」ではなく「想定した要求事項への網羅性」だと明示する。**C層**: `orgos iso audit run` を**適合性の事前検査**と位置づけ直し、`orgos iso audit plan create` / `finding set` / `conclude` で ISO 19011 の監査を別に置いた。未判定の要求事項が1件でもあれば `conclude` は拒否し、不適合の判定には監査員の記述を要求する。**D層**: 新しい暗号処理は作らず、`subject_type: iso.internal_audit.signoff` で org approval に載せて `humanApproveOrgApproval()` を通す（`audit:sign` 権限を `auditor` 既定に追加）。署名後に所見を書き換えると digest 照合が落ちる。監査員の独立性（`allowed_agents` と監査範囲の交差）と力量（`CMP-10`）を計画作成のゲートにし、`orgos iso audit programme` で期間内に一度も監査されていない要求事項を出す。**LLM は判定に関与しない。** ADR 0068
- **ISO-21401 の実運用化（証拠様式 · KPI 検査 · 着手順序）** — 統制が要求する証拠ファイルに対して空様式11本を `templates/` に整備し、`orgos iso templates <ID> [--write]` でテナントへ配置できるようにした（既存ファイルは上書きしない）。整備状況は `catalog.yaml` の `evidence_forms`（`complete` / `partial`）で宣言し、契約テストが宣言と実態の一致を双方向に検査する（ISO-21401 · 9001 · 13485 · 37000 が complete、残り8件は partial として債務を可視化）。
- **空の様式を証拠として数えない** — CSV はデータ行が1件以上、Markdown は `{PLACEHOLDER}` の置換を必要とする。様式を配っただけで統制が適合に転じる誤りを防ぐ。ギャップ表示は「未作成」「様式が未記入」「記録なし」を区別する。
- **`orgos iso kpi`** — ISO 21401 の KPI ログを決定論的に検査し、宿泊人泊あたりの原単位と前月比を計算する。月形式・重複・負値・非数値・稼働0での使用量計上を検出。総量ではなく原単位で評価するため、稼働増による見かけの悪化と実際の非効率を取り違えない。
- **`orgos iso clauses`** — 条項番号の検証状況を一覧する。ISO 本文は再配布できないためパックの条項は対応表にすぎず、`iso_refs` / `core_bindings` に `verified_on` · `verified_by` が入るまで「未検証」と表示する。内部監査レポートの注記からも参照。
- **統制の着手順序（`priority` P1/P2/P3）** — 規格を有効化した直後はほぼ全statementが未達になるため、パックが着手順序を宣言する。P1 は人の安全・法令要求、P2 は他が依存する土台、P3 は改善・報告。内部監査の改善提案はこの順に並ぶ。mal / ISO-21401 では不適合17件が P1 4件・P2 7件・P3 6件に整理される。
- **力量マップ・研修計画・実施記録（ISO 21401 7.2）** — 正本を `data/hr/competence.yaml`（役割 · 要求力量 · 4段階評価）と `data/hr/training.yaml`（研修 · 有効性の判定基準 · 実施結果）に置き、表とギャップは `orgos hr competence map|plan|records [--write]` で導出する（手書きの表を持たない）。`orgos hr competence check` は力量マップの参照整合と、法定要求ギャップが研修計画で受講者まで手当てされているかを検査し、未計画なら異常終了する。評価のない力量はレベル0として扱い、欠落を隠さない。mal: 亀沢旅館（開業 2026-09-18）向けに CMP-01〜09 を REG-012 各条から起こし、開業前研修 TRN-001〜008 と教材7本を整備。
- **ISO-21401 パックの作り込み** — 未束縛だった4 work（`risk_approach` 6.1 · `documented_information` 7.5 · `operation` 8.1 · `corrective_action` 10.2）を `core_bindings` に追加し、本規格の主題である環境・社会文化・経済の領域統制を新設（領域統制 1 → 14）。`kpi-log.csv` を `env-resources` / `env-waste` の証拠に接続。裏づけのないサステナビリティ訴求を防ぐため、表示の実態一致を `guest-communication` で1統制として扱う。条項番号は規格本文で未検証のため、パック索引に §確認事項 として明示。
- **ISO 共通コアモジュール + Coming Soon 拡張路** — HLS の器を `steward/standards/iso/core/` に `CTL-CORE-{work}` 10件として集約し、各パックは `core_bindings` で自分の条項番号を結ぶだけにした（内部監査は Annex SL 9.2 / ISO 13485 8.2.4）。`iso_refs.edition` は catalog の `year` から loader が付与。`evidence_mode: all` により、統制を1件に畳んでも規格ごとの証拠欠落が隠れない。`orgos controls migrate-core` が `supersedes` 経由で成熟度を引き継ぐ（mal: 旧 28 ID → コア 9件、内部監査 L3 を保持）。新設7規格に領域統制（危険源 · BIA · HACCP · EnPI · SLA · 贈収賄リスク · 環境側面）を追加。catalog に `status` を導入し、`coming_soon` は verify で skip・テナントで有効化不可。`orgos iso roadmap|scaffold`。ADR 0067
- **ISO 内部監査ループ** — 単一 `internal_audit` が catalog + control-map を読む。`orgos iso catalog|maps verify|audit run|audit report` · append-only ログ · 経営レポート（現状・問題・課題・適合・改善）。ADR 0066。規格ごとの監査 Agent は作らない。
- **ISO 37000 自己宣言経路** — 11原則パック · `orgos governance principles status|init|declare` · tenant init で目的ドラフト · ADR 0024。認証ではない。purpose の実文言と ceo/auditor 補償統制を点検する。
- **Console #23 — できるが未配線だった操作を Console に接続** — 承認受信箱から `POST /chat/v1/approvals/propose` で稟議起案 · 帳簿詳細で逆仕訳・電帳検索/check・補助元帳 · 税モジュールにカレンダーと申告ギャップ（e-Tax 提出は出さない）
- **Console #24 — 契約・宿泊・消費税・給与計算・WO DAG** — `/contracts/` · `/stays/` · 消費税 assessment · `POST /chat/v1/tax/payroll-calc` · 実行状況の wave DAG（e-Tax 提出・宿泊者氏名は出さない）
- **Console #25 — 税務 5b XML / 別表ドラフト** — 別表四・五相当と Completeness。提出用ではない（ADR 0052 5c）
- **Console #26 — 宿泊税 from_ledger** — `lodging-tax.yaml` assessments を税カレンダー金額に接続
- **Console #27 — 年末調整の決定論計算** — `POST /chat/v1/tax/yea/compute`（個人別は gitignore · e-file なし）
- **Console #28 — Gmail 接続状態** — `GET /chat/v1/mail/gmail`（トークン非表示）· ADR 0004 は SHIPPED フラグ維持
- **#29 Witness Hub 公開リレー GA** — `GET /metrics` · `orgos hub ga-check` · mTLS compose overlay
- **#30 Stripe セルフサーブ live 手順** — settings に `next_steps`（秘密鍵は git に置かない）
- **Console Wave 1 — 途中=0 の残コード** — Gmail: Console 設定から Community Connections へリンク · Hub: `ORGOS_HUB_REQUIRE_TLS` / `ORGOS_HUB_PUBLIC` で公開 bind の TLS 必須 · Stripe: doctor / commercial の detail を Console `next_steps` と同一文言
- **テナント設定を Console Web UI へ** — `/?onboarding=1` を「会社の設定」ハブにし、メールカード（送信元・provider・Gmail 連携 / 切断）を追加。`GET /chat/v1/mail/gmail`（provider · from · `platform_ready`）· `POST /chat/v1/mail/gmail/connect|disconnect` · `PUT /chat/v1/mail/config`（ceo/approver）。SMTP パスワードと OAuth トークンは画面に出さず、Google 認可は Community のまま。SHIPPED は運営（CEO）の判断
- **経費精算の社員席と個人枠（mal 先行）** — role `employee` + 権限 `expense:claim`（Console は開かない）· 社員デスク `GET /chat/v1/org/budget/expense-claim/desk`（自分の枠と自分の申請のみ）· `ClaimDeskPage` で署名 QR をカメラ取込（`person_id` はサーバでセッション席に固定 · 他人の枠は 403）· 承認受信箱に経費精算（誰が・何円・残枠・返す日 / gate 名は非表示）· `reimbursement.due_on`（未指定は次の金曜を決定論で補完）· mal に `org-authority` / `budget-delegations` の個人枠（business-unit 30万・admin-unit 6万）· [expense-claim-spec.md](docs/org-os/expense-claim-spec.md)
- **Operator Console 組織 — 外部専門家** — `/org/` に顧問弁護士・税理士・技術顧問。正本 `data/company.yaml` `advisors`（メール非表示）。mal は松尾剛行（CTR-022）・税理士/技術顧問は未契約
- **Operator Console 経営ホーム（ADR 0065）** — `/` を CEO 朝ダッシュボードに（要対応 · 目標ギャップ · 依頼進捗）。帳簿は `/?ledger=1`。`GET /chat/v1/executive/home` · 承認受信箱の CEO 質問/日程 · 対外メール送信 · 振込指示（L1）· TowerActionCard · 会社イベント · デスクトップ通知。mal `kpi-targets` を事業計画・ヘッドカウントに接続
- **セールス CRM Wave 2b 100点クロージャ** — mal `migrate-accounts` · deal update / inquiry-set-status / follow-up-from-sent / account merge / mail-link-resolve · Console pipeline/inbound 操作 · demo confirm hook · [sales-crm-runbook.md](docs/org-os/sales-crm-runbook.md) · ADR 0062 DoD #2（POST vs CLI-only）

### Fixed
- **決済儀式が読み取り席でも始められた** — `POST /chat/v1/settlement/challenge` がセッションの有無しか見ていなかったため、承認権限のない席でも step-up を開始できた。`chat:approve` を必須にした
- **税務の書き込み経路が `chat:ask` で通っていた** — `xml-draft` / `bonus-draft` / `yea/ready` の3経路を `finance:reconcile` に引き上げた
- **本番で名簿外の operator に既定権限が付いていた** — 本番モードでは登録簿が正本（登録簿の欠落は起動時に失敗）なので、名簿に無い id には権限を一切与えない
- **公開 product 経路が SPA フォールバックで HTML 200 を返していた** — signup / plans / Stripe webhook がセッション無しだと画面 HTML を返し、Stripe が配信成功と誤認していた。公開経路はフォールバック前に API へ通す
- **非同期ハンドラの例外でチャットサーバが落ちていた** — throw が unhandled rejection になりプロセスごと終了していたのを、500 応答に閉じ込めた
- **`modules.yaml` の無いテナントでコンソールが落ちた** — モジュール目録・業務データ読み込みを欠落に耐える形にした（`loadModulesFileSafe`）
- **壊れたセッションからログアウトできなかった** — teardown が失敗してもブラウザの Cookie は必ず落とす
- **PassKey ハンドオフの戻り先** — 常に `/` へ戻していたため、設定画面から登録すると画面が変わっていた。要求した画面へ戻す
- **適用除外の規格に記録 warning が出ていた** — `orgos validate` の記録検査が `enabled` だけを見ていたのを、適用対象（excluded を除く）に合わせた
- **`required_sections` が文書タイトルを節として数えていた** — 本文全体の部分一致だったため、必須節を削っても表題に同じ語が含まれていれば適合になっていた（ISO-21401 `guest-protection-policy.md` · ISO-22000 `applicability.md`）。見出し行（`##` 以上）に限定。番号付き見出し（`## 3. 労働条件`）は従来どおり通る
- **会社イベントパネルの「Invalid month」** — `GET /chat/v1/events` が `parseMonth` に `YYYY-MM-DD` を渡していたのを修正（`YYYY-MM` を導出）
- **Agent 要約のラベル重複** — ファイル名のみだと全 Agent で同一表示になるため、所属 Agent フォルダ名を付与
- **目標ギャップ件数** — サマリーが `unknown` を数えず合計が行数と一致しなかったのを修正
- `events_create` を `chatAuditActionSchema` に登録（監査書き込みの型エラー解消）
- `mail_gmail_connect` / `mail_gmail_disconnect` / `mail_config_update` を `chatAuditActionSchema` に登録

### Changed
- **Operator Console コピー整理・UI 統一** — 説明過剰なリード文を削減（承認 · 経営ホーム · 顧客管理 · チャット設定 · クラウド LLM · ワーカー · FAQ）。見出しとボタン/チェックボックスの文言重複を解消。未使用の重複コピーキー（`moduleCatalogSection` / `moduleCatalogLead` / `customersLockedHint`）を削除
- **RAG · KPI 表示の統一** — 経営ホームと分析ダッシュボードで RAG をローカライズ済みテキストチップに統一（絵文字・生 enum を廃止）。目標値の単位書式を両画面で共通化。要対応カードの生 enum ステータスを削除し、種別をローカライズ
- **縦リズムとレイアウト修正** — `.outlook-panel` にセクション間余白、`.kpi-value` / `.kpi-label` をグローバル化（経営ホーム・分析の KPI 行崩れ修正）。承認ページの送信待ち/振込パネルをページコンテナ内に収め、メール本文プレビューを `<details>` に格納
- Operator Console 1段目ナビに **経営**。ホーム default は帳簿から経営へ
- **Operator Console — Wire を帳簿 SPA に統合** — `/wire/` は steward-chat の soft-nav（`history.pushState`）。別 `dist-combined` / タブ切替フルリロードを廃止。Wire UI は lazy chunk · `/console/v1/*` API は従来どおり。静的 `assets/` JS/CSS は gzip + `Vary: Accept-Encoding`

### Added
- **医療機器薬事（jp_medical_device）運用強化** — 型付き台帳（苦情分類 · AE/GVP期限 · CAPA · 変更 · PMS · 当局照会 · 文書版）· `deadlines` / `ledger add` · org approval subject（`medical_device.*`）· `audit.jsonl` · 品目申請チェックリストドラフト（提出は人間）· ADR 0064
- **モジュール公式 readiness 整合** — sales を `MODULE_CLI_BUNDLES` + co-located skills + `production_ready` で **100** に。cursor-only Skill を cli 化（ecommerce 等）· venue/JP 一部の Skill・tier ギャップ修正
- **メール文脈パイプライン 100点クロージャ** — 金額抽出の堅牢化 · 和暦日付照合 · compose sanitize/ゴールデン回帰 · 知識検索エッジテスト（ADR 定義: 決定論 100）
- **OOO ゲート横断クロージャ** — Slack correspondence に email 同等の claims/style-lint · 全角数字/万円/在庫すり抜け封じ · 拒否時 `correspondence_gate` 監査 · [ooo-gate-matrix.md](docs/org-os/ooo-gate-matrix.md)
- **メール文脈パイプライン A+ hardening** — 金額ゲート常時 · style-lint を draft/compose · 納期 SoT 厳密化 · 知識検索再帰/見積構造化 · Gmail thread 注入 E2E · DEAL 送信後タグ · Asana push モック
- **メール文脈パイプライン hardening** — 手動 draft も宛先 registry 必須 · compose/draft 時点で claims 検証 · retail_store 在庫 / 案件納期の facts · E2E（triage→compose→send→INQ）
- **メール文脈パイプライン** — Gmail スレッド取得 · facts verify · knowledge search · LLM compose（送信なし）· send-gate に style-lint/claims/添付 · 送信後 INQ/DEAL 更新 · Asana レプリカ（ADR 0063）
- **ローカル LLM ERROR フォールバック** — worker `tier: local` で必要情報欠落時は `ERROR: <理由>` 1行のみ（未確認・拒否エッセイ禁止）。`tool-loop` 注入 + enforce · ADR 0061 · `ORGOS_LOCAL_LLM_ERROR_FALLBACK=0` で無効
- **顧客管理タブ** — 1段目 `/customers/`（sales または customer_success モジュール On 時）。2段目: アウトバウンド（施策 + 商談）· インバウンド · アフターセールス · 解約・休眠。`GET /chat/v1/customers/*` · `sales` モジュール catalog · `binds_modules` 同期
- **Operator Console 情報設計** — 1段目を **帳簿** / **予実**（`/?wallet=1`）/ **取引** に分割。セットアップ・アカウントは設定アコーディオンへ。共通 `OpsPage` と `loading-panel` で読み込み表示を統一
- **CEO 承認受信箱** — `/approvals/` タブ。モジュール・規格切替などの承認待ちをスチュワードチャットから分離。PassKey セッションの stale `approver_id`（例: Demo CEO）は名簿の承認者名に再バインド。`tenant.config` は同一 CEO の受信箱確認を許可
- **エージェント追加・モジュール追加の承認ゲート** — エージェント有効化とカタログからのモジュール追加（`import_enable`）は `tenant.config` 承認キュー経由。能力増加の承認（追加・On・規格 On）は iPhone Settlement PassKey 必須（ADR 0037 拡張）。Off は PassKey なし
- **Operator Console 実行状況（Asana 風）** — 既定は未完了のみ。表示切替（未完了/完了/すべて）· グループ（計画/担当/種別/期限）· 計画スイムレーン · カード完了チェック · `POST .../complete|reopen`（`escalate:complete`）· `orgos escalate reopen`
- **ローカル LLM 変更ゲート** — `orgos change plan|apply` · 等級 A/B/C · hospitality `sync-derived` · Chat `change_plan`/`change_apply`（write は確認カード）· opened_date/stays/tax/room_count integrity warnings · ADR 0060
- **名簿↔給与・社保のソフト突合** — `employees` / `payroll.employee_ids` / org-chart の不一致を error ではなく warning + `fix_hints` で提示（`orgos validate` · headcount）。未リンク＝非従業員とは断定しない
- **OOO / Operator Console ログインドメイン** — `operators.yaml` の `login_policy.email_domains` で Community SSO を会社ドメインに制限。個人メールは創業者1席（`grandfather_emails` 最大1件）のみ。常勤メールのテナント横断は validate / invite で禁止。PassKey は対象外
- **Chat answer memory** — クラウド LLM の過去回答を派生索引し、ローカル LLM の system に参考として注入（ADR 0059 · `orgos chat memory reindex` · `ORGOS_CHAT_ANSWER_MEMORY=0`）
- **Chat feedback + FAQ index** — Good/Bad 評価 · Bad 回答の再利用停止 · Good から FAQ 索引を構築し完全一致時は LLM スキップ（`POST /chat/v1/feedback` · `orgos chat faq build` · アイドル自動更新）
- GL 商用 Wave 2–3: 月次発生主義（売掛/買掛）· 納付仕訳 · 期間ロック履歴 · 現金/固資/借入統制 · 未計上月 warning · 決算 PDF の BS/株主資本等変動 · 税理士引き渡しのテナント/FY 化 · 勘定科目内訳 CSV · Steward Chat 帳簿画面
- **消費税還付 R0–R3** — ADR 0056 · [consumption-tax-refund-spec.md](docs/org-os/consumption-tax-refund-spec.md)。還付候補 / eligibility / CLAIM · pack に加え、人間の `file` / `receive` で入金仕訳と税カレンダーの還付入金予定。e-Tax はしない。mal は点数目的で有効化しない
- Engineering Constitution 分割正本（`steward/rules/engineering/00–09`）と Cursor ミラー sync
- `validatePolicyMirrors()` — `orgos validate` / `npm run generated:check` で policy ミラー鮮度検査
- ADR 0001–0003 · `.github/pull_request_template.md`（DoD チェックリスト）
- **ADR 0044** · `orgos orchestrate` — Work Order DAG（`depends_on`）· 状態機械 · wave dispatch · retry/cancel · `orchestration_status` Skill
- `src/lib/orchestration/` — `work-order-state` · `plan-graph` · `orchestrate-actions`
- `orchestrate plan --write --depends` — 依存 edge 永続化 · `syncParentPlanStatus`（全 child 完了で親 complete）
- `orchestrate status --json` — `aia` · `aia_runs` · `nodes[].aia`
- Operator Console 組織図 — 取締役会で定めた会社図に加え、当該テナントで稼働中のエージェント（スチュワード・秘書等）と過去の組織記録（`as_of`）を表示
- 設定の表示言語 — 日本語／英語のプルダウン（未設定は日本語）。外観ピッカーと同じ設定画面

### Removed
- **フリート運用 Web UI** — `/ops/` タブ・`FleetOpsPage`・HTTP `GET /chat/v1/product/ops-dashboard` / `ops-available` を廃止。`/ops/` は `/` へリダイレクト。運用は `orgos ledger product ops-dashboard` と runbook のみ

### Fixed
- **医療機器薬事 Round 2** — `ae mark-filed`（report_filed_on）· CAPA/照会ゲートを `ledger close` と単一化 · reject が `status_before_approval` 復元 · 苦情→AE 昇格 · change `risk_review` / CAPA `root_cause`+`action` · 文書 `effective_on` は承認時 · integrity に medical-device · 出荷/製造デモ行 · 全 subject E2E
- **医療機器薬事 100点 uplift** — reject 時台帳巻き戻し · apply 失敗時承認ロールバック · `humanApprove` E2E · active 業許可 `expires_on` 欠落を validate error · 申請充足チェック + `--force` · `audit list` · CAPA 有効性（`schedule/record-effectiveness`）· CLI を ops/draft/application に分割 · ADR 0064 / Skill 更新
- **医療機器承認閉ループ** — `org approval approve` 後に `medical_device.*` 台帳を反映（CAPA close · 変更実施 · 文書 approved · GVP 報告確認）。苦情/AE↔CAPA 双方向リンク · GVP escalate の Work Order 起票 · 当局照会 `set-response` · mal テスト残骸除去
- **決済 PassKey `allow_credentials` スコープ** — `settlementAllowCredentialsForOperator()` で名簿 `approver_name`（`boundApproverId`）に一致する決済鍵のみ提示。同一 operator の古い Demo CEO 鍵が混ざり iPhone 承認が「見つかりません」になる問題を修正。スナップショット/復元: `scripts/operator-passkey-snapshot.sh` · [passkey-known-good-baseline.md](docs/org-os/passkey-known-good-baseline.md)
- **PassKey Ceremony Router** — ログイン（`client-device` / Mac Touch ID）と決済承認（`hybrid` / iPhone QR）の切り替えを `apps/shared/passkey-ceremony.ts` に集約。`usb` トランスポートからの誤った hints 推論を禁止。承認モーダルは手動開始・決済 PassKey 未登録時のガイドを追加
- Operator Console Docker 統合 — ホスト SPA/CLI dist が古いと Good/Bad・FAQ が :9470 に出ない問題。`start-local-stack.sh` が起動前に dist を自動ビルドし、`--ensure` 時は console を recreate
- Chat 決定論経路（Fact / Command / Tower 等）でも `assistant_turn_id` を返し、Good/Bad ボタンを表示
- PassKey ログイン — 発行済みの鍵があればログアウト後に「Touch ID で入る」を出し、開発モードでも WebAuthn ログインを受け付ける
- PassKey 発行 — 開発環境でもログイン後の設定から Touch ID / iPhone 登録ができるよう、WebAuthn 設定を返し、未設定の loopback origin を受け付ける
- Operator Console ナビ — combined の `/wire/` と設定の戻る先を正しい面に固定。設定でスチュワードタブが current になっていた誤りを解消
- Operator Console 配色 — 本文・リンク・塗りボタン・警告/成功/危険を WCAG 相対輝度で読みやすく固定（塗りホバーは暗くする。薄い文字色禁止）· `tests/theme-contrast.test.ts`
- **FS-guard 自己評価修正** — `runFsGuardInternal` で台帳書込を hook 免除し `operator_guard_apply` / 本番 `guard init` が監査追記で失敗しない問題を解消 · bootstrap パス（operators / access-grants）の本番 init 前免除 · canonical-write baseline を `file:symbol` 件数キーへ · Shell 走査を interpreter argv のみに限定 · doctor の Skill Agent 警告を WARN 化
- `listHandoffs()` が dispatch manifest（`DISP-*.yaml`）を Work Order として parse し、dispatch 実行済みテナントで Today / dashboard が落ちる問題
- Work Order `blocked` → `pending` 復帰（上流 complete 後 · cancel 由来は除外）
- `orchestrate run|retry|cancel` の `auditCliMutation` 引数過多 — 監査行から件数/対象が欠落していた問題
- Run Board が親を持たない単独 Work Order を一覧に出さなかった問題（`child_ids` 必須 → top-level 判定へ）
- Run Board の KPI・ノード表の崩れ — 未定義 `.kpi-value` / `.kpi-label` を自前定義し、表カラムを `.orchestration-runs` 配下にスコープ
- Run Board の状態表示を絵文字からテキストラベルへ（絵文字フォント非搭載環境で判読不能だった）
- Run Board の SSE フォールバックが到達不能だった問題 — `EventSource` は例外でなく `onerror` で失敗するため、切断時に画面が静かに凍結していた（ポーリング切替 + 表示切替）

### Changed
- Operator Console 表示言語 — 設定・認証・シェル・チャットまわりのボタンと見出しを日英で揃え、混在しないようにした
- 設定画面 — 案内文と画面内リンクをやめ、言語・外観・PassKey を折りたたみ一覧にして展開してから変更する
- `openorgos-engineering-constitution.md` を索引専用に整理
- `executive_steward` readiness — orchestration 軸（2pt）· **100%**
- Run Board API — `/chat/v1/orchestration/runs` · SSE · `GET ?include=completed` · `POST /runs/retry|cancel`（`chat:ask`）
- Run Board UI — Steward Chat `/?runs=1` · 操作可否は `retryableCount` / `cancellableCount` · 完了済み root · Inbox は `/steward/` リンク
- Run Board E2E — `e2e/steward-chat.runboard.spec.ts`（pending「待機」· failed retry 失敗→待機 · Playwright 4 件 green）
- Run Board HTTP 契約 — `tests/steward-chat-orchestration-http.test.ts` · POST エラー not found=404 / その他=400 · 一覧 GET は queue 例外を 500
- `orchestrate plan --propose` — 起票前 validation ゲート（`llm-planner.ts` · 分解は決定論のみ）
- Work Order lifecycle queue event を状態機械に集約 — `dispatch_requested` · `work_order_running`
- orchestrate CLI smoke — `plan --write` → `run --dry-run` → `status --json`
- テスト fixture restore lock — ヘルパ抽出 · 単体テスト · `vitest` `hookTimeout` 120s（lock 90s より上）

## [0.8.0-beta.3] — 2026-08-24

Public demo refresh (`ghcr.io/taketani-masatoshi/orgos-demo:0.8.0-beta.3`).

### Changed
- Community OIDC 引き継ぎで Wire / 予実の二重ログインを避ける
- Steward の財務回答をテナント YAML に接地し、Work Order を自動オーケストレーション
- PassKey 登録を SSO 必須にし、`operators.yaml` にバインド
- LLM / MCP から最終承認ツールを削除（`operator_approve` · `steward_approve`）。本番は `ORGOS_LLM_TOOLS_WRITE=1` を doctor / prod-checklist が拒否
- `orgos doctor` が prod-checklist を実行する
- 承認は認証済み ceo/approver に名義バインド。自己承認禁止を全内部 subject に適用
- 週次 attest がチェーン末尾 digest を Witness pin として固定。`events chain pin` を追加。台帳 YAML/JSONL/MD のヘルパー直書きを拒否。壊れたチェーンを `backfill --force` で復旧しない
- `events:write` で会社イベント CLI を認証。`chain backfill --force` は `ORGOS_EVENTS_CHAIN_REBUILD=1` + ceo + `--i-understand-rebuild` に隔離。`skipChain` は非公開

## [0.8.0] — 2026-06-28

### Added
- Steward Chat CEO Today panel with KPI, wire/witness actions, streaming ask
- Combined Operator Console (`orgos operator console start`) — shared session cookie
- MCP 7 tools including witness register/verify/flush
- HTTP rate limiting and MCP rate limiting
- CSRF, RBAC, Chat audit logging for production
- Witness E2E (Chat UI + BFF + MCP + local hub fixture)
- `orgos mcp rotate-token` for MCP token rotation checklist
- `steward-chat:release-check` release gate script

### Changed
- Production misconfig now blocks server startup (`ORGOS_ENV=production`)
- Wire Console SPA builds to `/wire/` base for combined deploy

### Distribution
- `@orgos/cli` and `@orgos/wire` npm packages with publish-check CI
- Homebrew tap templates in `homebrew-tap/`
