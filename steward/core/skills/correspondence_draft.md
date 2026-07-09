# Skill: correspondence_draft（対外連絡下書き · 承認起案）

**runtime:** cli · **Agent:** Secretary のみ

## 目的

社外メール / Slack 通知の **下書き作成** と `org approval` への **承認起案**。送信は行わない。

## CLI

```bash
npm run orgos -- secretary correspondence draft \
  --channel email \
  --to "partner@example.com" \
  --subject "打合せのご調整" \
  --body "本文..."

npm run orgos -- secretary correspondence draft \
  --channel slack \
  --slack-channel general \
  --body "社内通知文案"
```

Skill 経由:

```bash
npm run orgos -- skills run correspondence-draft \
  --to "partner@example.com" --subject "件名" --body "本文"
```

## 出力

| 種別 | パス |
|------|------|
| 下書き YAML | `docs/executive/correspondence-drafts/DRAFT-*.yaml`（gitignore） |
| 下書き MD | 同フォルダ `DRAFT-*.md` |
| 承認 | `data/org/pending-approvals.yaml` · `subject_type: correspondence.email` |

## ワークフロー

1. Secretary が下書き + `proposeOrgApproval`（`pending_approval`）
2. 人間が `org approval approve --id APR-... --approver "CEO"`
3. `correspondence_send` / `slack_notify` で送信（Secretary CLI · 承認済みのみ）

## 禁止

- 承認前の `correspondence send`
- 財務 YAML 参照 · L2 値の tracked MD 転記
