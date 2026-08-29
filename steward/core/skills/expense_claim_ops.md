# Skill: expense_claim_ops（CLI 実行）

**Path:** `steward/core/skills/expense_claim_ops.md`
**Runtime:** `cli`

## 目的

経費精算（QR 領収書取込 → 承認ゲート → 仕訳計上 → 振込準備 → 精算）を決定論 CLI で実行する。

正本: [docs/org-os/expense-claim-spec.md](../../docs/org-os/expense-claim-spec.md)

## CLI

```bash
npm run orgos -- expense-claim list
npm run orgos -- expense-claim ingest --person-id ... --org-unit-id ... --account-code 5300 --qr ...
npm run orgos -- expense-claim approve <claimId> --operator-id <ceo>
npm run orgos -- expense-claim reject <claimId> --operator-id <ceo>
npm run orgos -- expense-claim prepare-transfer <claimId> --source-bank-account-id BANK-001 --stakeholder-id ... --payee ...
npm run orgos -- expense-claim reimburse <claimId> --payment-ref ...
npm run orgos -- validate
```

## 承認

- `approve` / `reject` は `requireCliHumanApproval`（ceo / approver のみ）
- 自己承認禁止 — `--operator-id` は認証済み operator と一致必須

## 禁止

- L2 口座番号のチャット出力
- LLM による単独承認
