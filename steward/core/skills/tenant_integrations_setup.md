# Skill: tenant_integrations_setup（テナント初回設定）

**runtime:** cli · **Agent:** Setup

## 目的

新規テナント / clone 後の **integrations 初回設定** を CLI ウィザードで完了する。

## CLI

```bash
npm run orgos -- tenant setup
npm run orgos -- tenant setup --answers ./setup-answers.json --non-interactive
npm run orgos -- integrations status
```

Skill 経由:

```bash
npm run orgos -- skills run tenant-integrations-setup
```

## 生成物

| 出力 | パス |
|------|------|
| 統合設定 | `data/integrations/integrations.yaml`（L2 · gitignore） |
| メール設定 | `records/executive/mail-config.yaml`（L2） |
| executive SoT | `data/executive/*.yaml`（example からコピー） |

## シークレット

| 種別 | 格納 |
|------|------|
| SMTP user/password | `ORGOS_SMTP_USER` · `ORGOS_SMTP_PASSWORD`（env） |
| Slack webhook | `ORGOS_SLACK_WEBHOOK_URL`（env） |
| Google Calendar | `.env` · [google-calendar-setup.md](../../../tenants/mal/docs/executive/google-calendar-setup.md) |
| Operator keys | `~/.orgos/operators/*.key` |

## 完了条件

- `integrations.setup.completed_at` が設定されている
- `orgos integrations status` スコア ≥ 80%
