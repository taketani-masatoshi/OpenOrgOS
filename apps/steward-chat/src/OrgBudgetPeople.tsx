import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import {
  allocateOrgPersonCategoryBudget,
  approveExpenseClaimApi,
  fetchExpenseClaimReceipt,
  prepareExpenseClaimTransferApi,
  rejectExpenseClaimApi,
  reimburseExpenseClaimApi,
  type OrgBudgetCategoryRow,
  type OrgBudgetDepartment,
  type OrgBudgetPayload,
} from "./api";

type ClaimDeskTab = "pending" | "reimbursement" | "done" | "rejected";
type ExpenseClaimRow = NonNullable<OrgBudgetPayload["expense_claims"]>[number];

type RunAction = (
  action: () => Promise<OrgBudgetPayload>,
  message: string,
) => Promise<void>;

function yen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatYenInput(value: string | number): string {
  const digits = String(value).replace(/[^0-9]/g, "");
  return digits ? Number(digits).toLocaleString("ja-JP") : "";
}

function parseYenInput(value: string): number {
  return Number(value.replaceAll(",", ""));
}

function personCategories(
  department: OrgBudgetDepartment,
): OrgBudgetCategoryRow[] {
  return department.categories.filter((row) => row.person_allocatable);
}

function memberCategoryYen(
  department: OrgBudgetDepartment,
  personId: string,
  accountCode: string,
): number {
  return (
    department.members
      .find((member) => member.person_id === personId)
      ?.categories.find((row) => row.account_code === accountCode)
      ?.allocation_yen ?? 0
  );
}

function categoryAvailableYen(
  department: OrgBudgetDepartment,
  accountCode: string,
  excludePersonId?: string,
): number {
  const deptYen =
    department.categories.find((row) => row.account_code === accountCode)
      ?.allocation_yen ?? 0;
  const used = department.members
    .filter((member) => member.person_id !== excludePersonId)
    .reduce(
      (sum, member) =>
        sum +
        (member.categories.find((row) => row.account_code === accountCode)
          ?.allocation_yen ?? 0),
      0,
    );
  return deptYen - used;
}

function CurrencyInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="currency-input">
      <span aria-hidden="true">¥</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        placeholder="0"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(formatYenInput(event.target.value))}
      />
      <span>円</span>
    </div>
  );
}

export function OrgBudgetPeople({
  budget,
  budgetLiveRef,
  busy,
  onRun,
  onOpenHierarchy,
}: {
  budget: OrgBudgetPayload;
  /**
   * Shared with OrgBudgetPanel.applyBudget so 409 auto-retry reads the
   * refreshed claim/envelope tokens before React re-renders this child.
   */
  budgetLiveRef: MutableRefObject<OrgBudgetPayload | null>;
  busy: boolean;
  onRun: RunAction;
  onOpenHierarchy: (orgUnitId?: string) => void;
}) {
  const claimRevisionToken = (claimId: string, fallback?: number | string) => {
    const live = budgetLiveRef.current ?? budget;
    return String(
      live.expense_claims?.find((row) => row.claim_id === claimId)
        ?.claim_revision ??
        fallback ??
        0,
    );
  };
  const departments = budget.departments ?? [];
  const [orgUnitId, setOrgUnitId] = useState(
    () =>
      departments.find((d) => personCategories(d).length > 0)?.org_unit_id ??
      departments[0]?.org_unit_id ??
      "",
  );
  const department =
    departments.find((d) => d.org_unit_id === orgUnitId) ?? null;

  const canManage =
    budget.viewer.can_allocate_department ||
    (department != null &&
      budget.viewer.managed_org_units.includes(department.org_unit_id));

  const categories = useMemo(
    () => (department ? personCategories(department) : []),
    [department],
  );

  const people = useMemo(() => {
    if (!department) return [];
    const byId = new Map<
      string,
      { person_id: string; display_name: string; allocation_yen: number }
    >();
    for (const member of department.members) {
      byId.set(member.person_id, {
        person_id: member.person_id,
        display_name: member.display_name,
        allocation_yen: member.allocation_yen,
      });
    }
    for (const person of department.candidate_people) {
      if (!byId.has(person.person_id)) {
        byId.set(person.person_id, {
          person_id: person.person_id,
          display_name: person.display_name,
          allocation_yen: 0,
        });
      }
    }
    return [...byId.values()].sort((a, b) =>
      a.display_name.localeCompare(b.display_name, "ja"),
    );
  }, [department]);

  const [personId, setPersonId] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [amount, setAmount] = useState("");

  const [coApproverByClaim, setCoApproverByClaim] = useState<
    Record<string, string>
  >({});
  const [paymentRefByClaim, setPaymentRefByClaim] = useState<
    Record<string, string>
  >({});
  const [settlementEvidenceByClaim, setSettlementEvidenceByClaim] = useState<
    Record<string, string>
  >({});
  const [bankStatementByClaim, setBankStatementByClaim] = useState<
    Record<string, string>
  >({});
  const [boardEventByClaim, setBoardEventByClaim] = useState<
    Record<string, string>
  >({});
  const [transferByClaim, setTransferByClaim] = useState<
    Record<string, { source: string; stakeholder: string; payee: string }>
  >({});
  const [claimTab, setClaimTab] = useState<ClaimDeskTab>("pending");
  const [rejectTarget, setRejectTarget] = useState<ExpenseClaimRow | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");
  const [receiptDetail, setReceiptDetail] = useState<{
    claimId: string;
    loading: boolean;
    error?: string;
    body?: Awaited<ReturnType<typeof fetchExpenseClaimReceipt>>;
  } | null>(null);
  const representatives = budget.expense_claim_representatives ?? [];
  const boardEvents = budget.expense_claim_board_events ?? [];
  const settlementCandidates =
    budget.expense_claim_settlement_candidates ?? {};

  useEffect(() => {
    if (!departments.some((d) => d.org_unit_id === orgUnitId)) {
      setOrgUnitId(departments[0]?.org_unit_id ?? "");
    }
  }, [departments, orgUnitId]);

  useEffect(() => {
    if (!department) {
      setPersonId("");
      setAccountCode("");
      return;
    }
    if (!people.some((p) => p.person_id === personId)) {
      setPersonId(people[0]?.person_id ?? "");
    }
    if (!categories.some((c) => c.account_code === accountCode)) {
      setAccountCode(categories[0]?.account_code ?? "");
    }
  }, [department, people, categories, personId, accountCode]);

  useEffect(() => {
    if (!department || !personId || !accountCode) {
      setAmount("");
      return;
    }
    const current = memberCategoryYen(department, personId, accountCode);
    setAmount(current > 0 ? formatYenInput(current) : "");
  }, [department, personId, accountCode]);

  const availableYen =
    department && accountCode
      ? categoryAvailableYen(department, accountCode, personId)
      : 0;
  const nextYen = amount === "" ? 0 : parseYenInput(amount);
  const overCap = amount !== "" && nextYen > availableYen;

  const companyPersonPool = (budget.company_categories ?? []).filter(
    (row) => row.person_allocatable,
  );

  function selectCell(nextPersonId: string, nextAccountCode: string) {
    setPersonId(nextPersonId);
    setAccountCode(nextAccountCode);
  }

  // Approval / reimbursement queues are company-wide for the people admin desk.
  // Do not filter by the personal-allocation department selector — that control
  // only scopes envelope edits, and hiding another dept's queue looks like data loss.
  const allClaims = budget.expense_claims ?? [];
  const pendingClaims = allClaims.filter(
    (claim) => claim.status === "pending_approval",
  );
  const reimbursementClaims = allClaims.filter(
    (claim) =>
      claim.status === "pending_reimbursement" || claim.status === "posted",
  );
  const doneClaims = allClaims.filter((claim) => claim.status === "reimbursed");
  const rejectedClaims = allClaims.filter(
    (claim) => claim.status === "rejected",
  );

  async function openReceiptDetail(claimId: string) {
    setReceiptDetail({ claimId, loading: true });
    try {
      const body = await fetchExpenseClaimReceipt(claimId);
      setReceiptDetail({ claimId, loading: false, body });
    } catch (err) {
      setReceiptDetail({
        claimId,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function gateLabel(gate: string | undefined): string {
    if (gate === "needs_manager") return "上長承認待ち";
    if (gate === "needs_rep_approval") return "代表者承認待ち（REG-004 A）";
    if (gate === "needs_late_exception") return "期限超過例外承認待ち";
    if (gate === "needs_ringi") return "稟議承認待ち（REG-004）";
    if (gate === "needs_board") return "取締役会証跡待ち（REG-004 C）";
    return gate ?? "needs_manager";
  }

  return (
    <div className="people-workspace">
      <section className="people-claim-queue" aria-label="経費精算デスク">
        <header>
          <h3>経費精算デスク</h3>
          <p className="people-desk-note muted">
            個人枠超過は上長承認（expense.claim.manager）。10万超は稟議（expense.claim.ringi
            ·
            REG-004、共同承認者必須）。自己承認は禁止です。部門枠不足の取込はここには出ません
            — 先に階層分配で枠を増やしてください。
          </p>
          <button
            type="button"
            className="quiet-button"
            onClick={() => onOpenHierarchy(orgUnitId)}
          >
            階層分配へ（部門枠不足時）
          </button>
        </header>
        <nav className="receipt-claim-tabs" aria-label="精算ステータス">
          {(
            [
              {
                id: "pending" as const,
                label: `承認待ち (${pendingClaims.length})`,
              },
              {
                id: "reimbursement" as const,
                label: `弁済待ち (${reimbursementClaims.length})`,
              },
              {
                id: "done" as const,
                label: `完了 (${doneClaims.length})`,
              },
              {
                id: "rejected" as const,
                label: `却下 (${rejectedClaims.length})`,
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                claimTab === item.id
                  ? "receipt-claim-tab is-active"
                  : "receipt-claim-tab"
              }
              onClick={() => setClaimTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

      {claimTab === "pending" && (
        <>
          {pendingClaims.length === 0 ? (
            <p className="muted">承認待ちはありません。</p>
          ) : (
          <ul className="people-claim-list">
            {pendingClaims.map((claim) => (
              <li key={claim.claim_id}>
                <div>
                  <strong>{claim.claim_id}</strong> · {claim.person_id} ·{" "}
                  {claim.account_code} · {yen(claim.amount_yen)}
                  <br />
                  <span className="muted">
                    {gateLabel(claim.gate)} · {claim.receipt_id}
                    {claim.approval_id ? ` · ${claim.approval_id}` : ""}
                    {claim.deadline_status === "late"
                      ? ` · ${claim.days_after_transaction}日後提出`
                      : ""}
                    {claim.invoice_verification
                      ? ` · T番号:${claim.invoice_verification.status}`
                      : ""}
                    {claim.notes?.includes(":sent:")
                      ? " · Wire送信済"
                      : claim.notes?.includes(":failed:")
                        ? " · Wire失敗（精算継続）"
                        : ""}
                  </span>
                </div>
                <div className="people-claim-actions">
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => void openReceiptDetail(claim.claim_id)}
                  >
                    領収書詳細
                  </button>
                  {claim.gate === "needs_ringi" ? (
                    <label className="people-claim-co-approver">
                      共同承認者
                      <select
                        aria-label="共同承認者"
                        value={coApproverByClaim[claim.claim_id] ?? ""}
                        disabled={busy || !canManage}
                        onChange={(event) =>
                          setCoApproverByClaim((prev) => ({
                            ...prev,
                            [claim.claim_id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">選択してください</option>
                        {representatives.map((row) => (
                          <option key={row.id} value={row.display_name}>
                            {row.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {claim.gate === "needs_board" ? (
                    <label className="people-claim-co-approver">
                      取締役会イベント
                      <select
                        aria-label="取締役会イベント"
                        value={boardEventByClaim[claim.claim_id] ?? ""}
                        disabled={busy || !canManage}
                        onChange={(event) =>
                          setBoardEventByClaim((prev) => ({
                            ...prev,
                            [claim.claim_id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">選択してください</option>
                        {boardEvents.map((event) => (
                          <option key={event.event_id} value={event.event_id}>
                            {event.event_id} · {event.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="primary-button"
                    disabled={
                      busy ||
                      !canManage ||
                      (claim.gate === "needs_ringi" &&
                        !(coApproverByClaim[claim.claim_id] ?? "").trim()) ||
                      (claim.gate === "needs_board" &&
                        !(boardEventByClaim[claim.claim_id] ?? "").trim())
                    }
                    onClick={() => {
                      const co =
                        claim.gate === "needs_ringi"
                          ? (coApproverByClaim[claim.claim_id] ?? "").trim()
                          : "";
                      const board =
                        claim.gate === "needs_board"
                          ? (boardEventByClaim[claim.claim_id] ?? "").trim()
                          : "";
                      if (
                        !window.confirm(
                          [
                            `${claim.claim_id} を承認しますか？`,
                            `金額: ${yen(claim.amount_yen)}`,
                            `gate: ${gateLabel(claim.gate)}`,
                            co ? `共同承認者: ${co}` : null,
                            board ? `取締役会: ${board}` : null,
                            "自己承認は禁止です。",
                          ]
                            .filter(Boolean)
                            .join("\n"),
                        )
                      ) {
                        return;
                      }
                      void onRun(
                        () =>
                          approveExpenseClaimApi({
                            claim_id: claim.claim_id,
                            fy: budget.fiscal_year,
                            expected_claim_revision: claimRevisionToken(
                              claim.claim_id,
                              claim.claim_revision,
                            ),
                            co_approver_id: co || undefined,
                            board_event_id: board || undefined,
                          }),
                        `精算 ${claim.claim_id} を承認しました`,
                      );
                    }}
                  >
                    承認
                  </button>
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy || !canManage}
                    onClick={() => {
                      setRejectTarget(claim);
                      setRejectReason("");
                    }}
                  >
                    却下
                  </button>
                </div>
              </li>
            ))}
          </ul>
          )}
        </>
      )}

      {claimTab === "reimbursement" && reimbursementClaims.length > 0 && (
        <section className="people-claim-queue" aria-label="立替弁済待ち">
          <header>
            <h3>立替弁済待ち</h3>
            <p className="people-desk-note muted">
              月次実績へ計上済み。会社から立替者への弁済（REG-005
              第3条）を記録します。
            </p>
          </header>
          <ul className="people-claim-list">
            {reimbursementClaims.map((claim) => (
              <li key={`reimburse-${claim.claim_id}`}>
                <div>
                  <strong>{claim.claim_id}</strong> · {claim.person_id} ·{" "}
                  {claim.account_code} · {yen(claim.amount_yen)}
                  <br />
                  <span className="muted">
                    弁済待ち · {claim.receipt_id}
                    {claim.monthly_ref?.month
                      ? ` · monthly ${claim.monthly_ref.month}`
                      : ""}
                    {claim.reimbursement?.broker_evidence_ref
                      ? ` · 送金準備済 ${claim.reimbursement.broker_evidence_ref}`
                      : " · 送金未準備"}
                  </span>
                </div>
                <div className="people-claim-actions">
                  {!claim.reimbursement?.broker_evidence_ref ? (
                    <>
                      {(["source", "stakeholder", "payee"] as const).map(
                        (key) => (
                          <label key={key} className="people-claim-co-approver">
                            {key === "source"
                              ? "出金口座ID"
                              : key === "stakeholder"
                                ? "支払先ID"
                                : "支払先表示名"}
                            <input
                              type="text"
                              value={
                                transferByClaim[claim.claim_id]?.[key] ?? ""
                              }
                              disabled={busy || !canManage}
                              onChange={(event) =>
                                setTransferByClaim((prev) => ({
                                  ...prev,
                                  [claim.claim_id]: {
                                    source: prev[claim.claim_id]?.source ?? "",
                                    stakeholder:
                                      prev[claim.claim_id]?.stakeholder ?? "",
                                    payee: prev[claim.claim_id]?.payee ?? "",
                                    [key]: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        ),
                      )}
                      <button
                        type="button"
                        className="quiet-button"
                        disabled={
                          busy ||
                          !canManage ||
                          !transferByClaim[claim.claim_id]?.source.trim() ||
                          !transferByClaim[
                            claim.claim_id
                          ]?.stakeholder.trim() ||
                          !transferByClaim[claim.claim_id]?.payee.trim()
                        }
                        onClick={() => {
                          const transfer = transferByClaim[claim.claim_id]!;
                          void onRun(
                            () =>
                              prepareExpenseClaimTransferApi({
                                claim_id: claim.claim_id,
                                expected_claim_revision: claimRevisionToken(
                                  claim.claim_id,
                                  claim.claim_revision,
                                ),
                                fy: budget.fiscal_year,
                                source_bank_account_id: transfer.source.trim(),
                                stakeholder_id: transfer.stakeholder.trim(),
                                payee: transfer.payee.trim(),
                              }),
                            `精算 ${claim.claim_id} の送金指示を準備しました（DRY-RUN）`,
                          );
                        }}
                      >
                        送金を準備
                      </button>
                    </>
                  ) : null}
                  <label className="people-claim-co-approver">
                    支払参照
                    <input
                      type="text"
                      value={paymentRefByClaim[claim.claim_id] ?? ""}
                      disabled={busy || !canManage}
                      placeholder="振込指示ID"
                      onChange={(event) =>
                        setPaymentRefByClaim((prev) => ({
                          ...prev,
                          [claim.claim_id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="people-claim-co-approver">
                    銀行明細
                    <select
                      aria-label="銀行明細"
                      value={bankStatementByClaim[claim.claim_id] ?? ""}
                      disabled={busy || !canManage}
                      onChange={(event) =>
                        setBankStatementByClaim((prev) => ({
                          ...prev,
                          [claim.claim_id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">未選択（外部証跡を使う）</option>
                      {(settlementCandidates[claim.claim_id] ?? []).map(
                        (row) => (
                          <option
                            key={row.bank_statement_id}
                            value={row.bank_statement_id}
                          >
                            {row.bank_statement_id} · {yen(row.amount)} ·{" "}
                            {row.date}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="people-claim-co-approver">
                    外部決済証跡
                    <input
                      type="text"
                      value={settlementEvidenceByClaim[claim.claim_id] ?? ""}
                      disabled={
                        busy ||
                        !canManage ||
                        Boolean(bankStatementByClaim[claim.claim_id])
                      }
                      placeholder="銀行明細がない場合の決済証跡参照ID"
                      onChange={(event) =>
                        setSettlementEvidenceByClaim((prev) => ({
                          ...prev,
                          [claim.claim_id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={
                      busy ||
                      !canManage ||
                      !claim.reimbursement?.broker_evidence_ref ||
                      !(paymentRefByClaim[claim.claim_id] ?? "").trim() ||
                      (!(bankStatementByClaim[claim.claim_id] ?? "").trim() &&
                        !(
                          settlementEvidenceByClaim[claim.claim_id] ?? ""
                        ).trim())
                    }
                    onClick={() =>
                      void onRun(
                        () =>
                          reimburseExpenseClaimApi({
                            claim_id: claim.claim_id,
                            expected_claim_revision: claimRevisionToken(
                              claim.claim_id,
                              claim.claim_revision,
                            ),
                            fy: budget.fiscal_year,
                            payment_ref: (
                              paymentRefByClaim[claim.claim_id] ?? ""
                            ).trim(),
                            bank_statement_ref:
                              (
                                bankStatementByClaim[claim.claim_id] ?? ""
                              ).trim() || undefined,
                            settlement_evidence_ref:
                              (
                                settlementEvidenceByClaim[claim.claim_id] ?? ""
                              ).trim() || undefined,
                          }),
                        `精算 ${claim.claim_id} を弁済済にしました`,
                      )
                    }
                  >
                    弁済済にする
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {claimTab === "reimbursement" && reimbursementClaims.length === 0 && (
        <p className="muted">弁済待ちはありません。</p>
      )}

      {claimTab === "done" && (
        <>
          {doneClaims.length === 0 ? (
            <p className="muted">完了案件はありません。</p>
          ) : (
            <ul className="people-claim-list">
              {doneClaims.map((claim) => (
                <li key={`done-${claim.claim_id}`}>
                  <div>
                    <strong>{claim.claim_id}</strong> · {claim.person_id} ·{" "}
                    {yen(claim.amount_yen)}
                    <br />
                    <span className="muted">
                      弁済済 · {claim.receipt_id}
                      {claim.reimbursement?.paid_at
                        ? ` · ${claim.reimbursement.paid_at}`
                        : ""}
                      {claim.reimbursement?.payment_ref
                        ? ` · ${claim.reimbursement.payment_ref}`
                        : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => void openReceiptDetail(claim.claim_id)}
                  >
                    領収書詳細
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {claimTab === "rejected" && (
        <>
          {rejectedClaims.length === 0 ? (
            <p className="muted">却下案件はありません。</p>
          ) : (
            <ul className="people-claim-list">
              {rejectedClaims.map((claim) => (
                <li key={`rejected-${claim.claim_id}`}>
                  <div>
                    <strong>{claim.claim_id}</strong> · {claim.person_id} ·{" "}
                    {yen(claim.amount_yen)}
                    <br />
                    <span className="muted">
                      却下 · {claim.receipt_id}
                      {claim.reject_reason ? ` · ${claim.reject_reason}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => void openReceiptDetail(claim.claim_id)}
                  >
                    領収書詳細
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      </section>

      {rejectTarget && (
        <div className="receipt-claim-modal" role="dialog" aria-modal="true">
          <div className="receipt-claim-modal-card">
            <h2>精算を却下</h2>
            <p>
              {rejectTarget.claim_id} · {yen(rejectTarget.amount_yen)}
            </p>
            <label>
              却下理由
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="例: 証憑不備 / 費目不一致"
              />
            </label>
            <div className="receipt-issue-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setRejectTarget(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy || !rejectReason.trim()}
                onClick={() => {
                  const claim = rejectTarget;
                  const reason = rejectReason.trim();
                  setRejectTarget(null);
                  void onRun(
                    () =>
                      rejectExpenseClaimApi({
                        claim_id: claim.claim_id,
                        fy: budget.fiscal_year,
                        expected_claim_revision: claimRevisionToken(
                          claim.claim_id,
                          claim.claim_revision,
                        ),
                        reason,
                      }),
                    `精算 ${claim.claim_id} を却下しました`,
                  );
                }}
              >
                却下する
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptDetail && (
        <div className="receipt-claim-modal" role="dialog" aria-modal="true">
          <div className="receipt-claim-modal-card">
            <h2>領収書詳細 · {receiptDetail.claimId}</h2>
            {receiptDetail.loading && <p>読み込み中…</p>}
            {receiptDetail.error && (
              <p className="error-banner">{receiptDetail.error}</p>
            )}
            {receiptDetail.body?.receipt && (
              <>
                <p>
                  {receiptDetail.body.receipt.issuer.name} ·{" "}
                  {receiptDetail.body.receipt.issuer.invoice_registration_number}
                </p>
                <p className="muted">
                  取引日 {receiptDetail.body.receipt.transaction_date} · digest{" "}
                  {(receiptDetail.body.digest ?? "").slice(0, 16)}…
                  {receiptDetail.body.signature_ok ? " · 署名OK" : ""}
                </p>
                <ul>
                  {receiptDetail.body.receipt.lines.map((line, i) => (
                    <li key={i}>
                      {line.description} · {yen(line.amount_including_tax)}（
                      {line.tax_rate}%）
                    </li>
                  ))}
                </ul>
                <p>
                  合計 {yen(receiptDetail.body.receipt.total_amount)}
                </p>
              </>
            )}
            {!receiptDetail.loading &&
              !receiptDetail.error &&
              !receiptDetail.body?.receipt && (
                <p className="muted">スナップショットがありません。</p>
              )}
            <button
              type="button"
              className="quiet-button"
              onClick={() => setReceiptDetail(null)}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {companyPersonPool.length > 0 && (
        <section
          className="people-pool-strip"
          aria-label="全社の個人配布可能費目"
        >
          <header>
            <h3>個人配布可能な費目</h3>
            <button
              type="button"
              className="quiet-button"
              onClick={() => onOpenHierarchy()}
            >
              階層分配へ
            </button>
          </header>
          <div className="people-pool-grid">
            {companyPersonPool.map((row) => (
              <article key={row.account_code}>
                <strong>{row.account_name}</strong>
                <em>{yen(row.allocation_yen)}</em>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="people-desk" aria-label="個人枠の編集">
        <header className="people-desk-head">
          <div>
            <h3>個人経費枠</h3>
            <p className="people-desk-note muted">
              建て替え・裁量経費のみ（人件費は別レーン）。
            </p>
          </div>
          <label className="people-dept-select">
            部門
            <select
              value={orgUnitId}
              disabled={busy || departments.length === 0}
              onChange={(event) => setOrgUnitId(event.target.value)}
            >
              {departments.map((dept) => (
                <option key={dept.org_unit_id} value={dept.org_unit_id}>
                  {dept.org_unit_label}
                </option>
              ))}
            </select>
          </label>
        </header>

        {!department ? (
          <p className="empty-copy">部門がありません。</p>
        ) : categories.length === 0 ? (
          <div className="people-empty">
            <p>
              この部門に個人配布可能な費目がありません。先に階層分配で部門費目へ枠を落としてください。
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onOpenHierarchy(department.org_unit_id)}
            >
              {department.org_unit_label}の階層分配を開く
            </button>
          </div>
        ) : (
          <>
            <div className="people-capacity">
              {categories.map((row) => {
                const remaining = categoryAvailableYen(
                  department,
                  row.account_code,
                );
                return (
                  <button
                    key={row.account_code}
                    type="button"
                    className={
                      accountCode === row.account_code
                        ? "people-capacity-chip is-active"
                        : "people-capacity-chip"
                    }
                    onClick={() => setAccountCode(row.account_code)}
                  >
                    <span>{row.account_name}</span>
                    <strong>{yen(Math.max(0, remaining))}</strong>
                  </button>
                );
              })}
            </div>

            <div className="people-matrix-wrap">
              <table className="people-matrix">
                <thead>
                  <tr>
                    <th>人員</th>
                    {categories.map((row) => (
                      <th key={row.account_code}>{row.account_name}</th>
                    ))}
                    <th>合計</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => {
                    const total = categories.reduce(
                      (sum, row) =>
                        sum +
                        memberCategoryYen(
                          department,
                          person.person_id,
                          row.account_code,
                        ),
                      0,
                    );
                    return (
                      <tr
                        key={person.person_id}
                        className={
                          person.person_id === personId ? "is-selected" : ""
                        }
                      >
                        <th scope="row">
                          <button
                            type="button"
                            className="people-name-btn"
                            onClick={() => setPersonId(person.person_id)}
                          >
                            {person.display_name}
                          </button>
                        </th>
                        {categories.map((row) => {
                          const cellYen = memberCategoryYen(
                            department,
                            person.person_id,
                            row.account_code,
                          );
                          const selected =
                            person.person_id === personId &&
                            row.account_code === accountCode;
                          return (
                            <td key={row.account_code}>
                              <button
                                type="button"
                                className={
                                  selected
                                    ? "people-cell is-selected"
                                    : "people-cell"
                                }
                                disabled={!canManage}
                                onClick={() =>
                                  selectCell(person.person_id, row.account_code)
                                }
                              >
                                {cellYen > 0 ? yen(cellYen) : "—"}
                              </button>
                            </td>
                          );
                        })}
                        <td className="people-total">{yen(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canManage ? (
              <form
                className="people-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    busy ||
                    !personId ||
                    !accountCode ||
                    amount === "" ||
                    overCap
                  ) {
                    return;
                  }
                  void onRun(
                    () =>
                      allocateOrgPersonCategoryBudget({
                        org_unit_id: department.org_unit_id,
                        person_id: personId,
                        account_code: accountCode,
                        amount_yen: nextYen,
                        expected_revision:
                          (budgetLiveRef.current ?? budget).revision,
                      }),
                    "個人枠を更新しました",
                  );
                }}
              >
                <div className="people-editor-fields">
                  <label>
                    人員
                    <select
                      value={personId}
                      disabled={busy}
                      onChange={(event) => setPersonId(event.target.value)}
                    >
                      {people.map((person) => (
                        <option key={person.person_id} value={person.person_id}>
                          {person.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    費目
                    <select
                      value={accountCode}
                      disabled={busy}
                      onChange={(event) => setAccountCode(event.target.value)}
                    >
                      {categories.map((row) => (
                        <option key={row.account_code} value={row.account_code}>
                          {row.account_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    金額
                    <CurrencyInput
                      label="個人の費目別分配額（円）"
                      value={amount}
                      disabled={busy}
                      onChange={setAmount}
                    />
                  </label>
                </div>
                <div className="people-editor-meta">
                  <p>
                    上限 <strong>{yen(Math.max(0, availableYen))}</strong>
                    {overCap && (
                      <span className="negative"> · 部門枠を超えています</span>
                    )}
                  </p>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={
                      busy ||
                      !personId ||
                      !accountCode ||
                      amount === "" ||
                      overCap
                    }
                  >
                    {busy ? "反映中…" : "更新"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="empty-copy">
                この部門の個人配布を変更する権限がありません（部門長または
                CEO）。
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
