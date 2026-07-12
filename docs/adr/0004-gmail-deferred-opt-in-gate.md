# ADR 0004: Gmail / tenant-mail connect の deferred 扱いと opt-in 本番ゲート

**状態:** Accepted · **Implemented:** 2026-07-12  
**日付:** 2026-07-12  
**決定者:** OpenOrgOS コアメンテナ

---

## Context

mal Wire pilot（Phase 2–3）を進める一方、以下 2 系統のメール連携は **コードは存在するがライブ未接続** だった。

| 系統 | 内容 | ブロッカー |
|------|------|-----------|
| **email_wire** | SMTP/IMAP フォールバック transport（Phase 4a） | `mail-config.yaml` · L2 SMTP/IMAP |
| **Community tenant-mail** | Option B · Gmail OAuth token push（Phase 4b） | OS_Community UI · OAuth 本番 |

`prod-wire-gate` が `email_wire` 不足で FAIL すると、Wire Gateway 本番検証が Gmail 待ちで止まる。  
`community-integration.json` の `tenant_mail_connect_api: true` は実態と乖離し、Community 側が未出荷 API を「利用可」と誤認するリスクがあった。

## Decision

### 方針 B — opt-in blocking gate

1. **既定:** `email_wire` 本番チェックは **deferred**（`ok: true` · detail に deferred 明示）
2. **opt-in:** `ORGOS_EMAIL_WIRE_REQUIRED=1` のときのみ mail-config 不足で blocking
3. **Community フラグ:** `tenant_mail_connect_api/ui: false` を正本とし、export 時に自動 `true` 化しない
4. **scaffold 維持:** `email_wire` · tenant-mail API コードと mock テストは削除しない
5. **Community UI:** `COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED=1` まで orgos-mail 連携 UI/API を 503 で非公開
6. **roundtrip:** `wire-live-verify --roundtrip` 時のみ子プロセスへ `ORGOS_EMAIL_WIRE_REQUIRED=1` を渡す

### フェーズ分割

| Phase | スコープ | ゲート |
|-------|---------|--------|
| 2–3 | Wire Gateway · relay · trust | 既定 PASS（Gmail 不要） |
| 4a | email_wire SMTP/IMAP live | `ORGOS_EMAIL_WIRE_REQUIRED=1` |
| 4b | Community Gmail OAuth | `tenant_mail_connect_*: true` + Community env |
| 5 | 統合出荷 | 4a + 4b + CEO 承認 |

## Consequences

### Positive

- mal Wire pilot を Gmail 未設定のまま本番ゲートで通せる
- integration フラグと実装の乖離を防止
- 出荷時は env とフラグ 1 箇所で blocking に切り替え可能

### Negative / トレードオフ

- email_wire の本番検証は **明示 opt-in まで後回し** — Phase 4a 着手前に runbook 確認が必要
- Community tenant-mail は UI 非表示のため、内部 demo は env で明示有効化が必要
- readiness スコアの `tenant-mail-connect-api` チェックは `ok: false`（deferred）— cap 99 には影響しない

## 関連

- [community-tenant-mail.md](../org-os/community-tenant-mail.md)
- [gmail-ship-gate-checklist.md](../org-os/gmail-ship-gate-checklist.md)
- [deploy/mal-pilot/README.md](../../deploy/mal-pilot/README.md)
- 実装: `src/lib/protocol/prod-wire-gate.ts` · `publish/protocol/community-integration.json`
