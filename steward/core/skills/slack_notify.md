# Skill: slack_notify（承認済み Slack 通知）

**runtime:** cli · **Agent:** Secretary のみ

## 目的

**人間承認済み** の Slack 下書きを Incoming Webhook で送信する。

## CLI

```bash
npm run orgos -- secretary correspondence draft \
  --channel slack --slack-channel general --body "通知文案"

npm run orgos -- org approval approve --id APR-... --approver "CEO"

npm run orgos -- skills run slack-notify --id DRAFT-...
```

## 設定

| env | 用途 |
|-----|------|
| `ORGOS_SLACK_WEBHOOK_URL` | Incoming Webhook URL（L2 · gitignore 推奨） |

## 禁止

- 承認前の webhook POST
- Finance / 契約 YAML 参照
