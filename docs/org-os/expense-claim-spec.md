# 社内経費精算（expense-claim）

**版:** 1.0 · **日付:** 2026-08-24  
**状態:** 実装済み（本ドキュメントは実装に合わせた後追い正本）  
**関連 ADR:** [0032 amount-free Wire claim](../adr/0032-amount-free-receipt-wire-claim.md) · [0027 budget envelope](../adr/0027-budget-envelope-governance.md) · [0038 HumanApprovalContext](../adr/0038-human-approval-context.md)

## 目的

署名付き QR 領収書を取込み、REG-004 / REG-005 に沿った承認ゲートで経費精算し、弁済（reimbursement）までを決定論で記録する。口座番号などの L2 は YAML / チャットに書かず、`bank_account_id` / broker 参照のみ。

## データ正本

| パス | 内容 |
|------|------|
| `data/finance/expense-claims.yaml`（実装の claims ストア） | 請求一覧 · `claims_revision` |
| `data/finance/expense-evidence/` 等 | 証跡（`claim_key` は保持しない方針） |
| receipt snapshot | 取込時の検証済み JSON（相対パス） |

スキーマ: `schemas/finance/expense-claim.ts`  
ドメイン: `src/lib/finance/expense-claim*.ts` · `employee-reimbursement-payable.ts` · `cost-allocation*.ts`

## 状態機械

```
draft
  → pending_approval
      → approved
          → pending_reimbursement   （月次 post 後の推奨）
              → reimbursed
      → rejected
```

| status | 意味 |
|--------|------|
| `draft` | 取込直後・未提出 |
| `pending_approval` | 承認待ち |
| `approved` | 承認済み（仕訳準備可） |
| `posted` | **deprecated** — `pending_reimbursement` を優先 |
| `pending_reimbursement` | 弁済待ち |
| `reimbursed` | 弁済完了（broker / 証跡 ref） |
| `rejected` | 却下 |

### 返す日（`reimbursement.due_on`）

申請者が「いつ戻るか」を聞かなくて済むように、承認時に返す日（`YYYY-MM-DD`）を記録する。承認 API の `due_on` が未指定なら `defaultReimbursementDueOn()` が **次の金曜**を決定論で埋める。`paid_at` は実際に払った時刻、`due_on` は予定日。口座番号は今までどおり書かない。

CAS: 請求単位 `claim_revision`（HTTP `expected_claim_revision`）とファイル revision を併用。

## Gate（REG-004 / REG-005）

`expenseClaimGateSchema`:

| gate | 意味 |
|------|------|
| `allow_immediate` | 即時可 |
| `needs_manager` | 上長承認 |
| `needs_rep_approval` | 代表承認 |
| `needs_late_exception` | 期限例外 |
| `needs_ringi` | REG-004 B · 代表取締役の二重承認 |
| `needs_board` | REG-004 C · 取締役会証跡（`board_event_id`） |
| `blocked_dept_envelope` | 部門執行枠不足 |
| `blocked_company_envelope` | 全社執行枠不足 |

金額・枠・期限は `src/lib/finance/expense-claim.ts` が決定論で算出。最終承認は HumanApprovalContext（必要時 settlement PassKey）。

## 取込と Wire

1. 請求側: 署名ペイロードをローカル検証（任意 `fetch_url` でオンライン再取得）。
2. `POST .../expense-claim/ingest` で claim 作成 + gate 判定。
3. **best-effort** で発行元へ amount-free Wire claim（失敗は notes。本体金額はローカル snapshot が正）。
4. 発行元: `POST /wire/v1/receipts/claim` → Chat `/?receipt=1` で承認（Wire に金額なし）。

詳細: [receipt-qr-spec.md](receipt-qr-spec.md) · ADR 0032。

## HTTP（予算 BFF 配下）

プレフィックス: `/chat/v1/org/budget`

| Method | Path | 用途 |
|--------|------|------|
| POST | `/expense-claim/gate` | gate 予告 |
| GET | `/expense-claim/desk` | 社員デスク（自分の枠と自分の申請のみ · `expense:claim`） |
| POST | `/expense-claim/ingest` | 取込（`chat:ask` または `expense:claim`） |
| POST | `/expense-claim/approve` | 承認 |
| POST | `/expense-claim/reject` | 却下 |
| GET | `/expense-claim/{id}/receipt` | 紐づく領収書 |
| POST | `/expense-claim/prepare-transfer` | 振込準備（broker 指示 · 口座番号非出力） |
| POST | `/expense-claim/reimburse` | 弁済完了記録 |

実装: `src/lib/steward-chat/routes/org-budget-api.ts`

## UI

| 面 | コンポーネント |
|----|----------------|
| 個人ウォレット取込 | `PersonalWallet.tsx` |
| 経費精算デスク | `OrgBudgetPeople.tsx`（予算管理 → 個人配布） |
| 承認受信箱の経費精算 | `ExpenseClaimApprovals.tsx`（`ApprovalsQueue.tsx` 内） |
| 社員の申請面 | `ClaimDeskPage.tsx` |

### 社員席（`expense:claim`）

社員には Operator Console を渡さない。role `employee` の既定権限は `expense:claim` **のみ**で、`chat:read` も付かない。

- 名簿: `data/org/operators.yaml` に会社ドメインメール（`login_policy.email_domains`）で追加。`person_id`（無ければ `org_unit_id`）で予算の個人枠に結ぶ。個人 Gmail の grandfather は増やさない。
- 面: `/chat/v1/auth/me` の `claim_only` が真のとき、`BudgetAuthGate` が URL に関わらず `ClaimDeskPage` だけを表示する。出るのは残円・費目・QR 読取・自分の申請の「待ち / 通った / 戻る日」。gate 名（`needs_rep_approval` 等）は出さない。
- 取込: 署名 QR をカメラ（`BarcodeDetector`）または貼り付けで読む。`person_id` / `org_unit_id` はサーバで**セッションの席に固定**され、他人の枠で出そうとすると 403（`claim_person_forbidden`）。
- 自動承認は緩めない。社員の申請は今までどおり REG-004 のゲートを通る。

実装: `src/lib/org/operator-claim-person.ts` · `buildClaimDeskPayload()`（`org-budget-api.ts`）

### mal のドリル（発行 → 撮影 → 実績）

1. 代表が `/?receipt-issue=1` で領収書を発行し、署名 QR を出す。
2. 社員席（OP-003 / OP-004）でログインし、QR を撮って費目を選び「出す」。
3. 代表が `/approvals/` で金額・残枠・返す日を見て承認する（返す日は既定で次の金曜）。
4. その人の個人枠の `actual_yen` が同じ円だけ増えることを予実で確認する。

## 識別子

| フィールド | 形式 |
|-----------|------|
| `claim_id` | `ECL-YYYYMMDD-###` |
| `issuer.org_id` | テナント id または外部 slug |
| `issuer.peer_id` | 任意 `PEER-###` |
| `payment_ref` / `broker_evidence_ref` | 振込・証跡参照（口座番号禁止） |

## 関連モジュール（短い契約）

| モジュール | 役割 |
|-----------|------|
| `expense-claim-journal` | 仕訳連携 |
| `expense-claim-bank-match` | 明細突合候補 |
| `expense-claim-invoice` | インボイス検証状態 |
| `employee-reimbursement-payable` | 未払金・弁済準備 |
| `cost-allocation` / rollup | 配賦軸（詳細は付録または別 ADR 予定） |

## 関連

- [org-budget-delegation.md](org-budget-delegation.md)
- [receipt-qr-spec.md](receipt-qr-spec.md)
- 施行規程: REG-004 · REG-005（テナント `docs/company/regulations/`）
