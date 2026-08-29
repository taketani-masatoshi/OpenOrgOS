# Ops landing readiness (2026-07-12)

CLI 正本で Wire / JP bank / scheduling を運用可能か確認するチェックリスト。

## Wire

```bash
npm run orgos -- --tenant mal wire score --json
# grade: enterprise を期待

ORGOS_LIVE_VERIFY=1 npm run orgos -- --tenant mal wire live-verify --json
# 本番 live 検証（外部副作用あり · env ゲート必須）

npm run orgos -- --tenant mal doctor
```

## JP bank corporate

```bash
npm run orgos -- --tenant mal jp bank reconcile list --json
npm run orgos -- --tenant mal jp bank reconcile propose --json
npm run orgos -- --tenant mal jp bank cashflow --help
```

## Scheduling

```bash
npm run orgos -- --tenant mal executive scheduling rehearsal --setup-only --json
# SMTP 未設定時は smtp_credentials で ready=false（想定）
# 本番: SMTP 資格情報は Console「会社の設定 → メール → SMTP / IMAP の秘密」から保存（env でも可）

npm run test:scheduling
```

## Gates

```bash
npm run test:preflight
npm run agent:pipeline:check
npm run test:contract
npm test
```
