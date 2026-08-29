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
import { useCopy } from "@ops-shared/define-copy";
import { PEOPLE_COPY } from "./org-budget-people-copy";

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
  const copy = useCopy(PEOPLE_COPY);
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
      <span>{copy.yen}</span>
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
  const copy = useCopy(PEOPLE_COPY);
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
    if (gate === "needs_manager") return copy.gateManager;
    if (gate === "needs_rep_approval") return copy.gateRep;
    if (gate === "needs_late_exception") return copy.gateLate;
    if (gate === "needs_ringi") return copy.gateRingi;
    if (gate === "needs_board") return copy.gateBoard;
    return gate ?? "needs_manager";
  }

  return (
    <div className="people-workspace">
      <section className="people-claim-queue" aria-label={copy.desk}>
        <header>
          <h3>{copy.desk}</h3>
          <p className="people-desk-note muted">
            {copy.deskLead}
          </p>
          <button
            type="button"
            className="quiet-button"
            onClick={() => onOpenHierarchy(orgUnitId)}
          >
            {copy.toHierarchyWhenShort}
          </button>
        </header>
        <nav className="receipt-claim-tabs" aria-label={copy.claimStatus}>
          {(
            [
              {
                id: "pending" as const,
                label: copy.tabPending(pendingClaims.length),
              },
              {
                id: "reimbursement" as const,
                label: copy.tabReimburse(reimbursementClaims.length),
              },
              {
                id: "done" as const,
                label: copy.tabDone(doneClaims.length),
              },
              {
                id: "rejected" as const,
                label: copy.tabRejected(rejectedClaims.length),
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
            <p className="muted">{copy.emptyPending}</p>
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
                      ? copy.lateSubmit(claim.days_after_transaction ?? 0)
                      : ""}
                    {claim.invoice_verification
                      ? `${copy.invoicePrefix}${claim.invoice_verification.status}`
                      : ""}
                    {claim.notes?.includes(":sent:")
                      ? copy.wireSent
                      : claim.notes?.includes(":failed:")
                        ? copy.wireFailed
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
                    {copy.receiptDetail}
                  </button>
                  {claim.gate === "needs_ringi" ? (
                    <label className="people-claim-co-approver">
                      {copy.coApprover}
                      <select
                        aria-label={copy.coApprover}
                        value={coApproverByClaim[claim.claim_id] ?? ""}
                        disabled={busy || !canManage}
                        onChange={(event) =>
                          setCoApproverByClaim((prev) => ({
                            ...prev,
                            [claim.claim_id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">{copy.selectPlease}</option>
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
                      {copy.boardEvent}
                      <select
                        aria-label={copy.boardEvent}
                        value={boardEventByClaim[claim.claim_id] ?? ""}
                        disabled={busy || !canManage}
                        onChange={(event) =>
                          setBoardEventByClaim((prev) => ({
                            ...prev,
                            [claim.claim_id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">{copy.selectPlease}</option>
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
                            copy.confirmApprove(claim.claim_id),
                            copy.confirmAmount(yen(claim.amount_yen)),
                            copy.confirmGate(gateLabel(claim.gate)),
                            co ? copy.confirmCo(co) : null,
                            board ? copy.confirmBoard(board) : null,
                            copy.noSelfApprove,
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
                        copy.approved(claim.claim_id),
                      );
                    }}
                  >
                    {copy.approve}
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
                    {copy.reject}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          )}
        </>
      )}

      {claimTab === "reimbursement" && reimbursementClaims.length > 0 && (
        <section className="people-claim-queue" aria-label={copy.reimburseQueue}>
          <header>
            <h3>{copy.reimburseQueue}</h3>
            <p className="people-desk-note muted">
              {copy.reimburseLead}
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
                    {copy.pendingReimburse} · {claim.receipt_id}
                    {claim.monthly_ref?.month
                      ? ` · monthly ${claim.monthly_ref.month}`
                      : ""}
                    {claim.reimbursement?.broker_evidence_ref
                      ? copy.transferReady(claim.reimbursement.broker_evidence_ref)
                      : copy.transferNotReady}
                  </span>
                </div>
                <div className="people-claim-actions">
                  {!claim.reimbursement?.broker_evidence_ref ? (
                    <>
                      {(["source", "stakeholder", "payee"] as const).map(
                        (key) => (
                          <label key={key} className="people-claim-co-approver">
                            {key === "source"
                              ? copy.sourceAccount
                              : key === "stakeholder"
                                ? copy.payeeId
                                : copy.payeeName}
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
                            copy.transferPrepared(claim.claim_id),
                          );
                        }}
                      >
                        {copy.prepareTransfer}
                      </button>
                    </>
                  ) : null}
                  <label className="people-claim-co-approver">
                    {copy.paymentRef}
                    <input
                      type="text"
                      value={paymentRefByClaim[claim.claim_id] ?? ""}
                      disabled={busy || !canManage}
                      placeholder={copy.paymentRefPh}
                      onChange={(event) =>
                        setPaymentRefByClaim((prev) => ({
                          ...prev,
                          [claim.claim_id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="people-claim-co-approver">
                    {copy.bankLine}
                    <select
                      aria-label={copy.bankLine}
                      value={bankStatementByClaim[claim.claim_id] ?? ""}
                      disabled={busy || !canManage}
                      onChange={(event) =>
                        setBankStatementByClaim((prev) => ({
                          ...prev,
                          [claim.claim_id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">{copy.bankLineNone}</option>
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
                    {copy.externalEvidence}
                    <input
                      type="text"
                      value={settlementEvidenceByClaim[claim.claim_id] ?? ""}
                      disabled={
                        busy ||
                        !canManage ||
                        Boolean(bankStatementByClaim[claim.claim_id])
                      }
                      placeholder={copy.externalEvidencePh}
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
                        copy.reimbursed(claim.claim_id),
                      )
                    }
                  >
                    {copy.markReimbursed}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {claimTab === "reimbursement" && reimbursementClaims.length === 0 && (
        <p className="muted">{copy.emptyReimburse}</p>
      )}

      {claimTab === "done" && (
        <>
          {doneClaims.length === 0 ? (
            <p className="muted">{copy.emptyDone}</p>
          ) : (
            <ul className="people-claim-list">
              {doneClaims.map((claim) => (
                <li key={`done-${claim.claim_id}`}>
                  <div>
                    <strong>{claim.claim_id}</strong> · {claim.person_id} ·{" "}
                    {yen(claim.amount_yen)}
                    <br />
                    <span className="muted">
                      {copy.reimbursedLabel} · {claim.receipt_id}
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
                    {copy.receiptDetail}
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
            <p className="muted">{copy.emptyRejected}</p>
          ) : (
            <ul className="people-claim-list">
              {rejectedClaims.map((claim) => (
                <li key={`rejected-${claim.claim_id}`}>
                  <div>
                    <strong>{claim.claim_id}</strong> · {claim.person_id} ·{" "}
                    {yen(claim.amount_yen)}
                    <br />
                    <span className="muted">
                      {copy.rejectedLabel} · {claim.receipt_id}
                      {claim.reject_reason ? ` · ${claim.reject_reason}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => void openReceiptDetail(claim.claim_id)}
                  >
                    {copy.receiptDetail}
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
            <h2>{copy.rejectTitle}</h2>
            <p>
              {rejectTarget.claim_id} · {yen(rejectTarget.amount_yen)}
            </p>
            <label>
              {copy.rejectReason}
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder={copy.rejectReasonPh}
              />
            </label>
            <div className="receipt-issue-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setRejectTarget(null)}
              >
                {copy.cancel}
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
                    copy.rejectedMsg(claim.claim_id),
                  );
                }}
              >
                {copy.doReject}
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptDetail && (
        <div className="receipt-claim-modal" role="dialog" aria-modal="true">
          <div className="receipt-claim-modal-card">
            <h2>{copy.receiptDetailTitle(receiptDetail.claimId)}</h2>
            {receiptDetail.loading && <p>{copy.loading}</p>}
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
                  {copy.txnDate(receiptDetail.body.receipt.transaction_date)} · digest{" "}
                  {(receiptDetail.body.digest ?? "").slice(0, 16)}…
                  {receiptDetail.body.signature_ok ? copy.sigOk : ""}
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
                  {copy.total(yen(receiptDetail.body.receipt.total_amount))}
                </p>
              </>
            )}
            {!receiptDetail.loading &&
              !receiptDetail.error &&
              !receiptDetail.body?.receipt && (
                <p className="muted">{copy.noSnapshot}</p>
              )}
            <button
              type="button"
              className="quiet-button"
              onClick={() => setReceiptDetail(null)}
            >
              {copy.close}
            </button>
          </div>
        </div>
      )}

      {companyPersonPool.length > 0 && (
        <section
          className="people-pool-strip"
          aria-label={copy.companyPersonPool}
        >
          <header>
            <h3>{copy.personAllocatableCats}</h3>
            <button
              type="button"
              className="quiet-button"
              onClick={() => onOpenHierarchy()}
            >
              {copy.toHierarchy}
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

      <section className="people-desk" aria-label={copy.editEnvelopes}>
        <header className="people-desk-head">
          <div>
            <h3>{copy.personalEnvelope}</h3>
            <p className="people-desk-note muted">
              {copy.personalEnvelopeNote}
            </p>
          </div>
          <label className="people-dept-select">
            {copy.department}
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
          <p className="empty-copy">{copy.noDepartments}</p>
        ) : categories.length === 0 ? (
          <div className="people-empty">
            <p>
              {copy.noDeptPersonCats}
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onOpenHierarchy(department.org_unit_id)}
            >
              {copy.openDeptHierarchy(department.org_unit_label)}
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
                    <th>{copy.colPerson}</th>
                    {categories.map((row) => (
                      <th key={row.account_code}>{row.account_name}</th>
                    ))}
                    <th>{copy.colTotal}</th>
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
                    copy.updatedEnvelope,
                  );
                }}
              >
                <div className="people-editor-fields">
                  <label>
                    {copy.colPerson}
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
                    {copy.category}
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
                    {copy.amount}
                    <CurrencyInput
                      label={copy.personCategoryYen}
                      value={amount}
                      disabled={busy}
                      onChange={setAmount}
                    />
                  </label>
                </div>
                <div className="people-editor-meta">
                  <p>
                    {copy.cap} <strong>{yen(Math.max(0, availableYen))}</strong>
                    {overCap && (
                      <span className="negative">{copy.overDept}</span>
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
                    {busy ? copy.applying : copy.update}
                  </button>
                </div>
              </form>
            ) : (
              <p className="empty-copy">
                {copy.noPermission}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
