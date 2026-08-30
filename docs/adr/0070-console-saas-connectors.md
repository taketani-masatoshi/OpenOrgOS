# ADR 0070: Operator Console の SaaS コネクタ（Slack / Asana / Gmail / Drive）

**状態:** Accepted · **日付:** 2026-08-30
**決定者:** OpenOrgOS コアメンテナ

---

## Context

コンソールから会社の外へ出す口が Gmail だけに閉じていた。Slack は Incoming Webhook の
片道、Asana はメール案件だけを CLI で複製、Google Drive は未実装。一方で CEO からは
「コンソールで見ているタスクを Asana に出したい」「正本の規程を人が読める PDF で共有したい」
という要求が出ている。

素直に作ると、プロバイダごとに OAuth クライアント・トークン置き場・接続 UI・承認の扱いが
ばらばらに増える。とくに危ういのは次の 3 点。

1. トークンの置き場所と読み出し経路がプロバイダごとに違うと、L2 が漏れる面が増える。
2. 外部 SaaS を「もう一つの正本」にしてしまうと、OrgOS の YAML が唯一の正本でなくなる。
3. 未完成のコネクタが Community の Connections ページに出ると、CEO が触れてしまう。

## Decision

### 1. OAuth の起点は Community（Gmail 経路の一般化）

Gmail で既に動いている bind → OAuth → token push を汎用化する。

- Steward が bind nonce を発行（`community-connector-bind.ts`）
- Community が OAuth を実行（`/api/integrations/orgos-connectors/{provider}/*`）
- Community が governance Bearer + nonce でトークンを push（`/protocol/v1/community/connectors/token`）
- Community はトークンを保存しない

Bearer だけでは「どのテナントか」を主張できるのが Community 側になってしまうため、
**bind nonce（単回・短命・発行元は当該テナントのコンソール操作）を必須**にする。

Gmail は `tenant-mail` 専用経路を維持する。コールバックが mail-config も書くため、
汎用経路へ寄せると送信元設定が抜ける。汎用経路は Gmail トークンを 422 で拒否する。

### 2. 外部 SaaS は L1 レプリカ、正本は OrgOS

- Asana へ出すのは id・件名・状態・期限のみ。pull しても OrgOS の status を上書きしない。
- Drive の PDF は派生物。Drive 側で編集しても正本は変わらない。
- Drive へ出せるのは許可リスト（人が読む docs · 領収書 · WO 要約 · 社長タスク一覧）だけ。
  `data/**` の YAML と L2 は出さない。

### 3. 外へ出る操作は全部 `chat:approve`

読むのは `chat:read`。接続・切断・送り先の設定・投稿・push・格納はすべて `chat:approve`。
初版で粒度を分けない（「リンク済みの再同期だけ `chat:ask`」等は後日）。LLM / MCP は実行しない。

### 4. 出荷ゲートは ADR 0004 と同型

プロバイダごとに Community 側 env（`COMMUNITY_{SLACK|ASANA|GDRIVE}_CONNECT_SHIPPED`）と
`community-integration.json` のフラグ（`connector_slack` / `connector_asana` / `connector_gdrive`）。
未出荷なら Community が 503、Steward が `platform_ready: false` を返してコンソールが接続させない。

### 5. 秘密は書込のみ

OAuth トークンは `records/integrations/{provider}-oauth.json`（0600 · gitignore）。
Slack Webhook と Asana PAT は `data/secrets/connector-secrets.env`（0600 · gitignore）。
読み出す API を置かない。画面はマスクした断片のみ表示する。

## Consequences

### Positive

- プロバイダ追加は「スキーマの enum + Community の authorize/exchange 分岐」で済む
- 秘密の置き場と承認の重さが 1 箇所に揃う
- 未出荷のコネクタは CEO の目に触れない

### Negative / トレードオフ

- Gmail だけ経路が二重（tenant-mail と connectors）。mail-config の副作用を守るための意図的な例外
- Slack のチャンネル選択は id 手入力が初版（`conversations.list` はあるが picker は未実装）
- Drive はフォルダ ID の手入力。picker は後日
- 承認粒度が粗い。運用で「毎回承認は重い」となれば再検討する

## 関連

- [ooo-surfaces/connectors.md](../org-os/ooo-surfaces/connectors.md) — 経路・権限・拒否条件
- [0004-gmail-deferred-opt-in-gate.md](0004-gmail-deferred-opt-in-gate.md) — 出荷ゲートの原型
- 実装: `src/lib/integrations/` · `src/lib/protocol/community-connector*.ts` ·
  `apps/web/src/lib/orgos-connectors.ts`（Community）
