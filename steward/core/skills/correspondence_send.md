# Skill: correspondence_send（承認済みメール送信）

**runtime:** cli · **Agent:** Secretary のみ

## 目的

**人間承認済み** の email 下書きを SMTP（または dry_run EML）で送信する。Wire は使わず、送信後に **会社イベント** を記録する。

## 前提

- 下書き `status: approved`
- `data/org/pending-approvals.yaml` で `approval.status: approved`
- **メール初期設定完了** — `orgos secretary mail setup-guide` が ready（未完了時は送信拒否・ガイド表示）
- SMTP 資格情報は **env / records/**（L2 · gitignore）

## 初期設定（実送信前に必須）

```bash
npm run orgos -- secretary mail setup-guide
```

未完了の典型項目:

| id | 内容 |
|----|------|
| `representative_email` | `company.yaml` の代表メール |
| `mail_config_file` | `records/executive/mail-config.yaml` |
| `smtp_host` / `smtp_credentials` | 自社 SMTP + `ORGOS_SMTP_*` |

`--dry-run` のみ SMTP 未設定でも EML 出力可。

## CLI

```bash
# 1. 承認（CEO / approver）
npm run orgos -- org approval approve --id APR-20260709-001 --approver "段燕燕"

# 2. 送信（approver 権限）
npm run orgos -- secretary correspondence send --id DRAFT-20260709-001
```

Skill 経由:

```bash
npm run orgos -- skills run correspondence-send --id DRAFT-20260709-001
```

## 設定

| 項目 | パス / env |
|------|------------|
| Mail config | `records/executive/mail-config.yaml` |
| 例 | `records/executive/mail-config.yaml.example` |
| SMTP user/pass | `ORGOS_SMTP_USER` · `ORGOS_SMTP_PASSWORD` |
| From | `ORGOS_MAIL_FROM` · config `from.email` |

`provider: dry_run` または SMTP 未設定時は **setup-guide が error を出し実送信不可**。`--dry-run` 時のみ `records/executive/mail-sent/*.eml` に書き出し。

## 出力

- 会社イベント `kind: misc` · `related.approval_id`
- 下書き `status: sent` · `company_event_id`
- 承認 `status: completed`

## 禁止

- `pending_approval` / 未承認での送信
- Wire protocol 経由の配送（本 Skill は SMTP のみ）
