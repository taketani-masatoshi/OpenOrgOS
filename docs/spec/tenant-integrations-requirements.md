# テナント統合設定 — 要件定義書

**版:** 1.0 · **日付:** 2026-07-09  
**ステータス:** 実装中（Secretary メール · setup wizard · integrations 正本）  
**親:** [openorgos-protocol-requirements.md](openorgos-protocol-requirements.md) §2.4（OrgOS Implementation 付帯 · Core 外）  
**スキーマ:** [schemas/integrations.ts](../../schemas/integrations.ts)  
**実装:** [src/lib/integrations.ts](../../src/lib/integrations.ts) · [src/lib/mail-send.ts](../../src/lib/mail-send.ts) · [src/lib/tenant-setup-wizard.ts](../../src/lib/tenant-setup-wizard.ts) · [src/commands/tenant-setup.ts](../../src/commands/tenant-setup.ts) · [src/commands/mail.ts](../../src/commands/mail.ts)

---

## 1. 背景・目的

Secretary Agent は社長の **社外窓口** として、メール下書き・日程調整を担う。テナントごとにメール送信設定 · webhook キー · OAuth トークン等の **機密は Git に載せない** 必要がある。

| 課題 | 本機能での解決 |
|------|----------------|
| メールは compose リンクのみ | integrations 正本 + SMTP 送信 CLI（承認ゲート付き） |
| シークレットがフォルダごとに分散 | `data/integrations/integrations.yaml` に統合（L2 · gitignore） |
| 初回設定が手動 cp + ドキュメント | `orgos tenant setup` ウィザード + Setup Agent |

**OpenOrgOS Core との関係:** 組織間 Wire（FR-WT-*）とは独立。単一組織の Implementation 付帯。

---

## 2. スコープ

### 2.1 In scope

| ID | 機能 |
|----|------|
| FR-TI-01 | integrations 正本（`data/integrations/integrations.yaml` · example 追跡） |
| FR-TI-02 | L2 分類 · gitignore · validate 警告 |
| FR-TI-03 | `orgos tenant setup` 対話ウィザード（非 TTY 時 `--answers` JSON） |
| FR-TI-04 | Setup Agent — ウィザード起動と完了検証 |
| FR-TI-05 | メール下書き（既存 `external_correspondence` · compose URL） |
| FR-TI-06 | メール送信 — `provider: smtp \| gmail_compose` |
| FR-TI-07 | webhook シークレット — テナント `integrations.webhooks[]` |
| FR-TI-08 | `orgos integrations status` · `doctor` 連携 |
| FR-TI-09 | Gmail API 送信（Community OAuth · 承認後のみ · ADR 0004 の出荷ゲート） |
| FR-TI-10 | 外部連携ハブ — Slack / Asana / Google の接続・切断・送り先設定（[connectors.md](../org-os/ooo-surfaces/connectors.md) · OOO-54） |
| FR-TI-11 | Slack 投稿（Bot Token · Webhook フォールバック · `chat:approve`。OOO-55） |
| FR-TI-12 | Asana へ Work Order / 社長タスクを L1 複製（OOO-56） |
| FR-TI-13 | Google Drive へ許可リスト内の PDF を格納（`drive.file` · OOO-57） |

### 2.2 Out of scope

| 項目 | 所在 |
|------|------|
| Wire human-mail UI | Wire Console · [wire-console-plan.md](../org-os/wire-console-plan.md) |
| 請求 `.eml` / `.msg` 生成 | Finance · [invoice.md](invoice.md) |
| Slack Events API での双方向同期 | 将来 |
| Asana Webhook から OrgOS 正本を書き換えること | 将来 |
| Drive 全ファイル同期 · YAML の Drive ホスティング | 将来 |
| LINE · Microsoft 365 · Calendar | 将来 |

---

## 3. 現状（As-Is · 2026-07-09）

| 領域 | 現状 | ギャップ |
|------|------|----------|
| 秘書メール | 下書き MD + Gmail compose URL · **Agent 自動送信禁止** | SMTP 送信 CLI なし |
| シークレット | `*-secrets.yaml` · `.env` · `~/.orgos/operators/*.key` は gitignore 済 | テナント統合設定正本なし |
| 初回設定 | `tenant init` + 手動 `cp *.example` + ドキュメント | Q&A で完了する Setup Agent / CLI なし |

---

## 4. 機能要件

### FR-TI-01 integrations 正本

**パス:**

| 種別 | パス | Git |
|------|------|-----|
| 統合 · webhook · setup | `data/integrations/integrations.yaml` | ignore |
| メール SMTP/from | `records/executive/mail-config.yaml` | ignore |
| テンプレ | `*.yaml.example` | 追跡 |

**スキーマ:** [schemas/integrations.ts](../../schemas/integrations.ts) · [schemas/correspondence/mail-config.ts](../../schemas/correspondence/mail-config.ts)

### FR-TI-02 分類 · gitignore

- `classification-registry.yaml` に `RES-INTEGRATIONS`（L2 · git: ignore）
- `.gitignore`: `tenants/*/data/integrations/integrations.yaml`
- validate: 未作成時 **警告**（skeleton テナントは抑制可）

### FR-TI-03 tenant setup ウィザード

**コマンド:** `orgos tenant setup [--answers <json>] [--non-interactive]`

| ステップ | 内容 |
|---------|------|
| 1 | executive YAML（example コピー案内） |
| 2 | mail provider 選択 |
| 3 | from_address · SMTP 資格（smtp 時） |
| 4 | webhook URL/secret（任意） |
| 5 | operator registry 案内 / init-registry |
| 6 | Google Calendar `.env` 案内 |
| 7 | `setup.completed_at` 書込 · validate |

### FR-TI-04 Setup Agent

**Path:** `steward/core/agents/setup_agent.md`  
**Skill:** `tenant_integrations_setup`（`runtime: cli`）

- 初回 clone 後に `orgos tenant setup` を誘導
- 完了確認: `orgos integrations status`

### FR-TI-05 メール下書き

既存 Skill [external_correspondence.md](../../steward/core/skills/external_correspondence.md) · [correspondence-draft-template.md](../../tenants/mal/docs/executive/correspondence-draft-template.md)

- Secretary は下書き MD のみ生成
- Gmail compose URL をテンプレに埋め込み

### FR-TI-06 メール送信

**不変条件:** Agent は `mail send` を直接呼ばない。**人間 / operator** が CLI 実行。

| provider | 動作 |
|----------|------|
| `gmail_compose` | `mail send` = compose URL 出力のみ |
| `smtp` | `mail send` + `--operator-id` + `ORGOS_OPERATOR_KEY` → nodemailer 送信 |

**コマンド:**

```bash
orgos secretary mail compose-url --to addr --subject "件名" --body "本文"
orgos secretary correspondence draft --to addr --subject "件名" --body "..."
orgos org approval approve --id APR-... --approver "CEO"
orgos secretary correspondence send --id DRAFT-... --dry-run
```

### FR-TI-07 webhook

テナント `integrations.webhooks[]` に `secretary_escalate` 等を登録。  
Secretary escalate CLI はテナント webhook を優先（platform registry はフォールバック）。

### FR-TI-08 status · doctor

```bash
orgos integrations status
orgos doctor   # integrations_setup チェック（未完了は warn）
```

---

## 5. 非機能要件

| ID | 要件 |
|----|------|
| NFR-TI-01 | L2 値（SMTP password · webhook secret）を tracked MD / チャットに転記禁止 |
| NFR-TI-02 | Privacy Mode 前提で `@file` 参照 |
| NFR-TI-03 | Agent / Skill 参照は Path 第一（ツール中立） |
| NFR-TI-04 | 送信前 `--dry-run` 必須推奨（本番運用） |

---

## 6. 受入

| # | シナリオ | 確認 |
|---|---------|------|
| A-01 | `tenant setup --answers fixtures/setup.json` で integrations.yaml 生成 | テスト |
| A-02 | `integrations status` が mail/webhook/operators を表示 | テスト |
| A-03 | `mail send --dry-run` が payload を表示（SMTP 未接続） | テスト |
| A-04 | Secretary 下書き → operator `mail send` フロー | 手動 / E2E |
| A-05 | validate 警告 — integrations 未作成 | validate |

---

## 7. バックログ（v2）

| ID | 内容 |
|----|------|
| FR-TI-09 | Gmail API プログラム送信（OAuth scope 拡張） |
| FR-TI-10 | Steward Chat からの mail send 承認 UI |

---

## 8. 改定履歴

| 版 | 日付 | 内容 |
|----|------|------|
| 1.0 | 2026-07-09 | 初版 — As-Is 整理 · FR-TI-01〜08 · Setup Agent · SMTP 送信 |
