import {
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  allocateOrgDepartmentBudget,
  allocateOrgDepartmentCategoryBudget,
  allocateOrgPersonCategoryBudget,
  setOrgCompanyBudget,
  setOrgCompanyCategoryBudget,
  type OrgBudgetCategoryRow,
  type OrgBudgetDepartment,
  type OrgBudgetPayload,
  type OrgBudgetReferenceCategory,
} from "./api";
import { useCopy } from "@ops-shared/define-copy";
import { ALLOC_COPY } from "./org-budget-alloc-copy";
import { isBlockedIncrease } from "./webGuards";

/** Prefer increases_locked; fall back to legacy adjustments_locked. */
function planIncreasesLocked(planning: OrgBudgetPayload["planning"]): boolean {
  return planning.increases_locked ?? planning.adjustments_locked;
}

type AllocFocus =
  | { level: "company" }
  | { level: "department"; orgUnitId: string }
  | { level: "person"; orgUnitId: string; personId: string };

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

function pct(value: number | null | undefined): string {
  return value == null ? "—" : `${value.toLocaleString("ja-JP")}%`;
}

function formatYenInput(value: string | number): string {
  const digits = String(value).replace(/[^0-9]/g, "");
  return digits ? Number(digits).toLocaleString("ja-JP") : "";
}

function parseYenInput(value: string): number {
  return Number(value.replaceAll(",", ""));
}

function InfoTip({ label }: { label: string }) {
  return (
    <span
      className="info-tip"
      tabIndex={0}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <span className="info-tip-mark" aria-hidden="true">
        i
      </span>
      <span className="info-tip-pop" role="tooltip">
        {label}
      </span>
    </span>
  );
}

function WithTip({
  children,
  tip,
  className = "heading-with-info",
}: {
  children: ReactNode;
  tip: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {children}
      <InfoTip label={tip} />
    </span>
  );
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
  const copy = useCopy(ALLOC_COPY);
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

function DistributionBar({
  total,
  segments,
  unallocatedLabel,
  onSelect,
  selectedId,
}: {
  total: number;
  segments: Array<{ id: string; label: string; amount: number }>;
  unallocatedLabel?: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  const copy = useCopy(ALLOC_COPY);
  if (total <= 0) return null;
  const positive = segments.filter((segment) => segment.amount > 0);
  const allocated = positive.reduce((sum, segment) => sum + segment.amount, 0);
  const unallocated = Math.max(0, total - allocated);
  const all = [
    ...positive,
    ...(unallocated > 0
      ? [
          {
            id: "unallocated",
            label: unallocatedLabel ?? copy.unallocated,
            amount: unallocated,
          },
        ]
      : []),
  ];
  return (
    <div className="distribution" aria-label={copy.distribution}>
      <div className="distribution-bar">
        {all.map((segment, index) => (
          <button
            key={segment.id}
            type="button"
            className={`distribution-segment tone-${index % 6} ${
              segment.id === "unallocated" ? "unallocated" : ""
            } ${selectedId === segment.id ? "selected" : ""}`}
            style={{ width: `${(segment.amount / total) * 100}%` }}
            title={`${segment.label} ${yen(segment.amount)}`}
            disabled={!onSelect || segment.id === "unallocated"}
            onClick={() => onSelect?.(segment.id)}
          />
        ))}
      </div>
      <div className="distribution-legend">
        {all.map((segment, index) => (
          <span
            key={segment.id}
            className={segment.id === "unallocated" ? "unallocated" : ""}
          >
            <i className={`tone-${index % 6}`} />
            {segment.label}
            <strong>
              {pct(Math.round((segment.amount / total) * 1000) / 10)}
            </strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function CategoryTable({
  rows,
  emptyCopy,
  onSelect,
  selectedCode,
}: {
  rows: OrgBudgetCategoryRow[];
  emptyCopy?: string;
  onSelect?: (accountCode: string) => void;
  selectedCode?: string;
}) {
  const copy = useCopy(ALLOC_COPY);
  if (!rows.length) {
    return <p className="empty-copy">{emptyCopy ?? copy.none}</p>;
  }
  return (
    <div className="category-table">
      <div className="category-table-head">
        <span>{copy.colCategory}</span>
        <span>{copy.colBudget}</span>
        <span>{copy.colActual}</span>
        <span>{copy.colRemaining}</span>
      </div>
      {rows.map((row) => {
        const interactive = Boolean(onSelect);
        const className = `category-table-row scope-${row.budget_delegation}${
          selectedCode === row.account_code ? " is-selected" : ""
        }${interactive ? " is-interactive" : ""}`;
        if (interactive) {
          return (
            <button
              type="button"
              className={className}
              key={row.account_code}
              onClick={() => onSelect?.(row.account_code)}
            >
              <span>
                <strong>{row.account_name}</strong>
              </span>
              <span>{yen(row.allocation_yen)}</span>
              <span>{yen(row.actual_yen)}</span>
              <span className={row.variance_yen < 0 ? "negative" : ""}>
                {yen(row.variance_yen)}
              </span>
            </button>
          );
        }
        return (
          <div className={className} key={row.account_code}>
            <span>
              <strong>{row.account_name}</strong>
            </span>
            <span>{yen(row.allocation_yen)}</span>
            <span>{yen(row.actual_yen)}</span>
            <span className={row.variance_yen < 0 ? "negative" : ""}>
              {yen(row.variance_yen)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ReferenceCategoryTable({
  rows,
}: {
  rows: OrgBudgetReferenceCategory[];
}) {
  const copy = useCopy(ALLOC_COPY);
  if (!rows.length) return null;
  return (
    <details className="alloc-footnote">
      <summary>
        <WithTip tip={copy.refCategoriesTip}>
          {copy.refCategories}
        </WithTip>
      </summary>
      <div className="category-table reference-category-table">
        <div className="category-table-head">
          <span>{copy.colCategory}</span>
          <span>{copy.colAmount}</span>
        </div>
        {rows.map((row) => (
          <div className="category-table-row scope-company" key={row.account_code}>
            <span>
              <strong>{row.account_name}</strong>
            </span>
            <span>
              {row.reference_yen == null ? "—" : yen(row.reference_yen)}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

/** Reallocate inside a fixed envelope (does not change parent total). */
function CategoryPoolEditor({
  rows,
  options,
  unallocatedYen,
  busy,
  onSave,
}: {
  rows: OrgBudgetCategoryRow[];
  options: Array<{ account_code: string; account_name: string }>;
  unallocatedYen: number;
  busy: boolean;
  onSave: (accountCode: string, amountYen: number) => Promise<void>;
}) {
  const copy = useCopy(ALLOC_COPY);
  const [accountCode, setAccountCode] = useState(
    options[0]?.account_code ?? "",
  );
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!options.some((option) => option.account_code === accountCode)) {
      setAccountCode(options[0]?.account_code ?? "");
    }
  }, [accountCode, options]);

  useEffect(() => {
    const current =
      rows.find((row) => row.account_code === accountCode)?.allocation_yen ?? 0;
    setAmount(current > 0 ? formatYenInput(current) : "");
  }, [accountCode, rows]);

  if (!options.length) {
    return <p className="empty-copy">{copy.noAllocatableCategories}</p>;
  }

  const currentYen =
    rows.find((row) => row.account_code === accountCode)?.allocation_yen ?? 0;
  const roomYen = unallocatedYen + currentYen;

  return (
    <div className="alloc-pool">
      <p className="alloc-pool-status">
        <WithTip
          tip={copy.poolTip(
            yen(unallocatedYen),
            unallocatedYen < 0 ? copy.over : "",
            yen(Math.max(0, roomYen)),
          )}
        >
          <span>
            {copy.unallocated} <strong>{yen(unallocatedYen)}</strong>
            {unallocatedYen < 0 ? copy.over : ""}
          </span>
        </WithTip>
      </p>
      <CategoryTable
        rows={rows}
        emptyCopy={copy.emptyCategoryAlloc}
        selectedCode={accountCode}
        onSelect={setAccountCode}
      />
      <div className="category-editor-fields alloc-pool-fields">
        <label>
          {copy.colCategory}
          <select
            value={accountCode}
            disabled={busy}
            onChange={(event) => setAccountCode(event.target.value)}
          >
            {options.map((option) => (
              <option key={option.account_code} value={option.account_code}>
                {option.account_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.allocationAmount}
          <CurrencyInput
            label={copy.categoryAllocYen}
            value={amount}
            disabled={busy}
            onChange={setAmount}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !accountCode || amount === ""}
          onClick={() => void onSave(accountCode, parseYenInput(amount))}
        >
          {copy.update}
        </button>
      </div>
    </div>
  );
}

function EnvelopeSizeEditor({
  label,
  amount,
  onAmountChange,
  reference,
  onReferenceChange,
  increaseBlocked,
  requireReference,
  busy,
  disabled,
  pendingNote,
  onSubmit,
  hint,
}: {
  label: string;
  amount: string;
  onAmountChange: (value: string) => void;
  reference: string;
  onReferenceChange: (value: string) => void;
  increaseBlocked: boolean;
  requireReference: boolean;
  busy: boolean;
  disabled?: boolean;
  pendingNote?: string | null;
  onSubmit: () => void;
  hint: string;
}) {
  const copy = useCopy(ALLOC_COPY);
  const submitBlocked =
    busy ||
    disabled ||
    increaseBlocked ||
    parseYenInput(amount) <= 0 ||
    (requireReference && !reference.trim());

  return (
    <details className="alloc-advanced">
      <summary>
        <WithTip tip={hint}>{copy.changeEnvelope}</WithTip>
      </summary>
      {pendingNote && <p className="budget-lock-note">{pendingNote}</p>}
      {increaseBlocked && (
        <p className="budget-lock-note">
          {copy.increaseBlocked}
        </p>
      )}
      <div className="form-row">
        <label>
          {label}
          <CurrencyInput
            label={copy.yenOf(label)}
            value={amount}
            disabled={busy || disabled}
            onChange={onAmountChange}
          />
        </label>
        <label className="reference-field">
          {copy.reason}
          <input
            type="text"
            value={reference}
            disabled={busy || disabled}
            placeholder={copy.decisionRef}
            onChange={(event) => onReferenceChange(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="primary-button"
          disabled={submitBlocked}
          onClick={onSubmit}
        >
          {copy.requestChange}
        </button>
      </div>
    </details>
  );
}

function SliceList({
  total,
  rows,
  unallocatedYen,
  unallocatedLabel,
  selectedId,
  onOpen,
  onSelectForEdit,
  editingId,
  editSlot,
}: {
  total: number;
  rows: Array<{
    id: string;
    label: string;
    meta?: string;
    amount: number;
  }>;
  unallocatedYen: number;
  unallocatedLabel: string;
  selectedId?: string | null;
  onOpen: (id: string) => void;
  onSelectForEdit?: (id: string) => void;
  editingId?: string | null;
  editSlot?: ReactNode;
}) {
  const copy = useCopy(ALLOC_COPY);
  return (
    <div className="alloc-slice-list" role="list">
      {rows.map((row) => (
        <div
          key={row.id}
          className={`alloc-slice-row ${selectedId === row.id ? "is-selected" : ""}`}
          role="listitem"
        >
          <button
            type="button"
            className="alloc-slice-main"
            onClick={() => onOpen(row.id)}
          >
            <span className="alloc-slice-label">
              <strong>{row.label}</strong>
              {row.meta && <span className="muted">{row.meta}</span>}
            </span>
            <span className="alloc-slice-amount">{yen(row.amount)}</span>
            <span className="alloc-slice-pct">
              {total > 0
                ? pct(Math.round((row.amount / total) * 1000) / 10)
                : "—"}
            </span>
            <span className="alloc-slice-open">{copy.open}</span>
          </button>
          {onSelectForEdit && (
            <button
              type="button"
              className="alloc-slice-edit"
              onClick={() => onSelectForEdit(row.id)}
            >
              {editingId === row.id ? copy.close : copy.allocationAmount}
            </button>
          )}
          {editingId === row.id && editSlot}
        </div>
      ))}
      <div className="alloc-slice-row is-unallocated" role="listitem">
        <div className="alloc-slice-main static">
          <span className="alloc-slice-label">
            <strong>{unallocatedLabel}</strong>
          </span>
          <span className="alloc-slice-amount">{yen(unallocatedYen)}</span>
          <span className="alloc-slice-pct">
            {total > 0
              ? pct(Math.round((unallocatedYen / total) * 1000) / 10)
              : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

function DepartmentEnvelopeEditor({
  department,
  budget,
  budgetLiveRef,
  busy,
  onRun,
}: {
  department: OrgBudgetDepartment;
  budget: OrgBudgetPayload;
  budgetLiveRef: MutableRefObject<OrgBudgetPayload | null>;
  busy: boolean;
  onRun: RunAction;
}) {
  const copy = useCopy(ALLOC_COPY);
  const revisionToken = () =>
    (budgetLiveRef.current ?? budget).revision;
  const [amount, setAmount] = useState(
    formatYenInput(department.allocation_yen),
  );
  const [reference, setReference] = useState("");
  const pending = (budget.pending_changes ?? []).find(
    (change) =>
      change.kind === "department_total" &&
      change.org_unit_id === department.org_unit_id,
  );
  const room =
    (budget.summary?.company_unallocated_yen ?? 0) + department.allocation_yen;
  const nextYen = parseYenInput(amount);
  const increasesLocked = planIncreasesLocked(budget.planning);
  const increaseBlocked = isBlockedIncrease(
    increasesLocked,
    department.allocation_yen,
    nextYen,
  );

  useEffect(() => {
    setAmount(formatYenInput(department.allocation_yen));
  }, [department.allocation_yen, department.org_unit_id]);

  const submitBlocked =
    busy ||
    increaseBlocked ||
    nextYen <= 0 ||
    (budget.planning.require_adjustment_reference && !reference.trim());

  return (
    <div className="alloc-inline-edit">
      <p className="alloc-pool-status">
        <WithTip tip={copy.deptAllocTip(yen(Math.max(0, room)))}>
          <span>{copy.deptAllocAmount}</span>
        </WithTip>
      </p>
      {pending && (
        <p className="budget-lock-note">
          {copy.pendingApproval(pending.approval_id, yen(pending.amount_yen))}
        </p>
      )}
      {increaseBlocked && (
        <p className="budget-lock-note">
          {copy.deptIncreaseBlocked}
        </p>
      )}
      <div className="form-row">
        <label>
          {copy.allocationAmount}
          <CurrencyInput
            label={copy.deptAllocYen(department.org_unit_label)}
            value={amount}
            disabled={busy}
            onChange={setAmount}
          />
        </label>
        <label className="reference-field">
          {copy.reason}
          <input
            type="text"
            value={reference}
            disabled={busy}
            placeholder={copy.decisionRef}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="primary-button"
          disabled={submitBlocked}
          onClick={() =>
            void onRun(
              () =>
                allocateOrgDepartmentBudget({
                  org_unit_id: department.org_unit_id,
                  amount_yen: nextYen,
                  reference: reference.trim(),
                  expected_revision: revisionToken(),
                }),
              copy.deptChangeSubmitted(department.org_unit_label),
            )
          }
        >
          {copy.requestChange}
        </button>
      </div>
    </div>
  );
}

function PersonCategoryEditor({
  department,
  personId,
  getExpectedRevision,
  busy,
  onRun,
  onPersonChange,
}: {
  department: OrgBudgetDepartment;
  personId: string;
  getExpectedRevision: () => string | undefined;
  busy: boolean;
  onRun: RunAction;
  onPersonChange: (personId: string) => void;
}) {
  const copy = useCopy(ALLOC_COPY);
  const candidates = useMemo(() => {
    const byId = new Map<
      string,
      { person_id: string; display_name: string }
    >();
    for (const person of department.candidate_people) {
      byId.set(person.person_id, person);
    }
    for (const member of department.members) {
      byId.set(member.person_id, {
        person_id: member.person_id,
        display_name: member.display_name,
      });
    }
    return [...byId.values()];
  }, [department.candidate_people, department.members]);

  const personCategoryOptions = useMemo(
    () =>
      department.categories.filter((category) => category.person_allocatable),
    [department.categories],
  );
  const [category, setCategory] = useState(
    personCategoryOptions[0]?.account_code ?? "",
  );
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!personCategoryOptions.some((row) => row.account_code === category)) {
      setCategory(personCategoryOptions[0]?.account_code ?? "");
    }
  }, [category, personCategoryOptions]);

  const selectedCategory = personCategoryOptions.find(
    (row) => row.account_code === category,
  );
  const otherUsed = department.members
    .filter((member) => member.person_id !== personId)
    .reduce(
      (sum, member) =>
        sum +
        (member.categories.find((row) => row.account_code === category)
          ?.allocation_yen ?? 0),
      0,
    );
  const availableYen =
    (selectedCategory?.allocation_yen ?? 0) - otherUsed;
  const currentYen =
    department.members
      .find((member) => member.person_id === personId)
      ?.categories.find((row) => row.account_code === category)
      ?.allocation_yen ?? 0;

  useEffect(() => {
    setAmount(currentYen > 0 ? formatYenInput(currentYen) : "");
  }, [personId, category, currentYen]);

  if (personCategoryOptions.length === 0) {
    return (
      <p className="empty-copy">
        {copy.noPersonCategories}
      </p>
    );
  }

  return (
    <div className="alloc-pool">
      <p className="alloc-pool-status">
        <WithTip tip={copy.personPoolTip}>
          <span>
            {copy.allocatable} <strong>{yen(Math.max(0, availableYen))}</strong>
          </span>
        </WithTip>
      </p>
      <div className="person-editor-grid">
        <label>
          {copy.person}
          <select
            value={personId}
            disabled={busy}
            onChange={(event) => onPersonChange(event.target.value)}
          >
            {candidates.map((person) => (
              <option key={person.person_id} value={person.person_id}>
                {person.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.colCategory}
          <select
            value={category}
            disabled={busy}
            onChange={(event) => setCategory(event.target.value)}
          >
            {personCategoryOptions.map((row) => (
              <option key={row.account_code} value={row.account_code}>
                {row.account_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.allocationAmount}
          <CurrencyInput
            label={copy.personCategoryYen}
            value={amount}
            disabled={busy}
            onChange={setAmount}
          />
        </label>
      </div>
      <button
        type="button"
        className="secondary-button"
        disabled={
          busy ||
          !personId ||
          !category ||
          amount === "" ||
          parseYenInput(amount) > availableYen
        }
        onClick={() =>
          void onRun(
            () =>
              allocateOrgPersonCategoryBudget({
                org_unit_id: department.org_unit_id,
                person_id: personId,
                account_code: category,
                amount_yen: parseYenInput(amount),
                expected_revision: getExpectedRevision(),
              }),
            copy.allocatedToPerson,
          )
        }
      >
        {copy.update}
      </button>
    </div>
  );
}

export function OrgBudgetAllocation({
  budget,
  budgetLiveRef,
  busy,
  onRun,
  initialOrgUnitId = null,
  onInitialOrgUnitConsumed,
}: {
  budget: OrgBudgetPayload;
  /** Shared with Panel.applyBudget for same-tick 409 retry token freshness. */
  budgetLiveRef: MutableRefObject<OrgBudgetPayload | null>;
  busy: boolean;
  onRun: RunAction;
  /** Deep-link from 個人配布 tab into a department level. */
  initialOrgUnitId?: string | null;
  onInitialOrgUnitConsumed?: () => void;
}) {
  const copy = useCopy(ALLOC_COPY);
  const revisionToken = () => (budgetLiveRef.current ?? budget).revision;
  const summary = budget.summary!;
  const departments = budget.departments ?? [];
  const [focus, setFocus] = useState<AllocFocus>({ level: "company" });
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialOrgUnitId) return;
    const exists = departments.some((d) => d.org_unit_id === initialOrgUnitId);
    if (exists) {
      setFocus({ level: "department", orgUnitId: initialOrgUnitId });
      setEditingDeptId(null);
    }
    onInitialOrgUnitConsumed?.();
    // Intentionally keyed only by deep-link id (not departments list churn).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consume once per link
  }, [initialOrgUnitId]);
  const [companyAmount, setCompanyAmount] = useState(
    formatYenInput(summary.company_budget_yen),
  );
  const [companyReference, setCompanyReference] = useState("");
  const increasesLocked = planIncreasesLocked(budget.planning);
  const companyNextYen = parseYenInput(companyAmount);
  const companyIncreaseBlocked = isBlockedIncrease(
    increasesLocked,
    summary.company_budget_yen,
    companyNextYen,
  );

  useEffect(() => {
    setCompanyAmount(formatYenInput(summary.company_budget_yen));
  }, [summary.company_budget_yen]);

  useEffect(() => {
    if (focus.level === "department") {
      if (!departments.some((d) => d.org_unit_id === focus.orgUnitId)) {
        setFocus({ level: "company" });
      }
    }
    if (focus.level === "person") {
      const dept = departments.find((d) => d.org_unit_id === focus.orgUnitId);
      if (!dept) {
        setFocus({ level: "company" });
        return;
      }
      const known =
        dept.members.some((m) => m.person_id === focus.personId) ||
        dept.candidate_people.some((p) => p.person_id === focus.personId);
      if (!known) {
        setFocus({ level: "department", orgUnitId: focus.orgUnitId });
      }
    }
  }, [departments, focus]);

  const selectedDepartment =
    focus.level === "company"
      ? null
      : (departments.find((d) => d.org_unit_id === focus.orgUnitId) ?? null);

  const selectedPerson =
    focus.level === "person" && selectedDepartment
      ? (selectedDepartment.members.find(
          (m) => m.person_id === focus.personId,
        ) ?? null)
      : null;

  const companyCategoryUnallocated =
    summary.company_category_unallocated_yen ??
    summary.company_budget_yen -
      (budget.company_categories ?? []).reduce(
        (sum, row) => sum + row.allocation_yen,
        0,
      );

  const companyPending = (budget.pending_changes ?? []).find(
    (change) => change.kind === "company_total",
  );

  const canManagePeople =
    budget.viewer.can_allocate_department ||
    (selectedDepartment != null &&
      budget.viewer.managed_org_units.includes(
        selectedDepartment.org_unit_id,
      ));

  const departmentCategoryOptions = (budget.company_categories ?? [])
    .filter((category) => category.budget_delegation !== "company")
    .map((category) => ({
      account_code: category.account_code,
      account_name: category.account_name,
    }));

  const burn =
    summary.company_budget_yen > 0
      ? Math.round(
          ((budget.actuals?.actual_yen ?? 0) / summary.company_budget_yen) *
            1000,
        ) / 10
      : null;

  return (
    <div className="alloc-workspace">
      {increasesLocked && (
        <p className="budget-policy-banner is-locked" role="status">
          {copy.planLocked(budget.planning.business_plan_status)}
        </p>
      )}
      <section className="alloc-monitor" aria-label={copy.actualsSummary}>
        <div>
          <span>{copy.companyEnvelope}</span>
          <strong>{yen(summary.company_budget_yen)}</strong>
        </div>
        <div>
          <span>{copy.actual}</span>
          <strong>{yen(budget.actuals?.actual_yen ?? 0)}</strong>
        </div>
        <div>
          <span>{copy.remainingBurn(pct(burn))}</span>
          <strong>
            {yen(
              summary.company_budget_yen - (budget.actuals?.actual_yen ?? 0),
            )}
          </strong>
        </div>
      </section>

      <nav className="alloc-breadcrumb" aria-label={copy.allocHierarchy}>
        <button
          type="button"
          className={focus.level === "company" ? "active" : ""}
          onClick={() => {
            setFocus({ level: "company" });
            setEditingDeptId(null);
          }}
        >
          {copy.company}
        </button>
        {selectedDepartment && (
          <>
            <span aria-hidden="true">›</span>
            <button
              type="button"
              className={focus.level === "department" ? "active" : ""}
              onClick={() =>
                setFocus({
                  level: "department",
                  orgUnitId: selectedDepartment.org_unit_id,
                })
              }
            >
              {selectedDepartment.org_unit_label}
            </button>
          </>
        )}
        {focus.level === "person" && selectedDepartment && (
          <>
            <span aria-hidden="true">›</span>
            <button type="button" className="active">
              {selectedPerson?.display_name ??
                selectedDepartment.candidate_people.find(
                  (p) => p.person_id === focus.personId,
                )?.display_name ??
                copy.personFallback}
            </button>
          </>
        )}
      </nav>

      {focus.level === "company" && (
        <section className="alloc-level" aria-label={copy.companyAlloc}>
          <header className="alloc-envelope">
            <h2>
              <WithTip tip={copy.companyAllocTip}>
                {copy.company}
              </WithTip>
            </h2>
            <div className="alloc-envelope-stats">
              <div>
                <span>{copy.envelope}</span>
                <strong>{yen(summary.company_budget_yen)}</strong>
              </div>
              <div>
                <span>{copy.deptAllocated}</span>
                <strong>{yen(summary.department_allocated_yen)}</strong>
              </div>
              <div>
                <span>{copy.unallocated}</span>
                <strong
                  className={
                    summary.company_unallocated_yen < 0 ? "negative" : ""
                  }
                >
                  {yen(summary.company_unallocated_yen)}
                </strong>
              </div>
            </div>
          </header>

          <DistributionBar
            total={summary.company_budget_yen}
            selectedId={editingDeptId}
            segments={departments.map((department) => ({
              id: department.org_unit_id,
              label: department.org_unit_label,
              amount: department.allocation_yen,
            }))}
            onSelect={(id) =>
              setFocus({ level: "department", orgUnitId: id })
            }
          />

          <h3 className="alloc-section-title">
            <WithTip tip={copy.deptSlicesTip}>
              {copy.toDepartments}
            </WithTip>
          </h3>
          <SliceList
            total={summary.company_budget_yen}
            unallocatedYen={summary.company_unallocated_yen}
            unallocatedLabel={copy.unallocated}
            selectedId={editingDeptId}
            editingId={editingDeptId}
            rows={departments.map((department) => ({
              id: department.org_unit_id,
              label: department.org_unit_label,
              meta: copy.head(department.head_label),
              amount: department.allocation_yen,
            }))}
            onOpen={(id) => {
              setEditingDeptId(null);
              setFocus({ level: "department", orgUnitId: id });
            }}
            onSelectForEdit={
              budget.viewer.can_allocate_department
                ? (id) =>
                    setEditingDeptId((current) =>
                      current === id ? null : id,
                    )
                : undefined
            }
            editSlot={
              editingDeptId
                ? (() => {
                    const department = departments.find(
                      (row) => row.org_unit_id === editingDeptId,
                    );
                    if (!department) return null;
                    return (
                      <DepartmentEnvelopeEditor
                        department={department}
                        budget={budget}
                        budgetLiveRef={budgetLiveRef}
                        busy={busy}
                        onRun={onRun}
                      />
                    );
                  })()
                : null
            }
          />

          {budget.viewer.can_set_company && (
            <details className="alloc-inner">
              <summary>
                <WithTip tip={copy.companyCategoryTip}>
                  {copy.categoryAlloc}
                </WithTip>
                <span className="muted">{copy.unallocatedDot(yen(companyCategoryUnallocated))}</span>
              </summary>
              <CategoryPoolEditor
                rows={budget.company_categories ?? []}
                options={(budget.budget_categories ?? []).map((row) => ({
                  account_code: row.account_code,
                  account_name: row.account_name,
                }))}
                unallocatedYen={companyCategoryUnallocated}
                busy={busy}
                onSave={(accountCode, amountYen) =>
                  onRun(
                    () =>
                      setOrgCompanyCategoryBudget({
                        account_code: accountCode,
                        amount_yen: amountYen,
                        expected_revision: revisionToken(),
                      }),
                    copy.companyCategoryUpdated,
                  )
                }
              />
            </details>
          )}

          <ReferenceCategoryTable rows={budget.reference_categories ?? []} />

          {budget.viewer.can_set_company && (
            <EnvelopeSizeEditor
              label={copy.companyEnvelope}
              amount={companyAmount}
              onAmountChange={setCompanyAmount}
              reference={companyReference}
              onReferenceChange={setCompanyReference}
              increaseBlocked={companyIncreaseBlocked}
              requireReference={budget.planning.require_adjustment_reference}
              busy={busy}
              pendingNote={
                companyPending
                  ? copy.pendingApproval(
                      companyPending.approval_id,
                      yen(companyPending.amount_yen),
                    )
                  : null
              }
              hint={copy.companyEnvelopeHint}
              onSubmit={() =>
                void onRun(
                  () =>
                    setOrgCompanyBudget({
                      amount_yen: companyNextYen,
                      reference: companyReference.trim(),
                      expected_revision: revisionToken(),
                    }),
                  copy.companyEnvelopeSubmitted,
                )
              }
            />
          )}
        </section>
      )}

      {focus.level === "department" && selectedDepartment && (
        <section className="alloc-level" aria-label={copy.deptAllocLevel}>
          <header className="alloc-envelope">
            <h2>
              <WithTip tip={copy.deptToPeopleTip}>
                {selectedDepartment.org_unit_label}
              </WithTip>
            </h2>
            <div className="alloc-envelope-stats">
              <div>
                <span>{copy.envelope}</span>
                <strong>{yen(selectedDepartment.allocation_yen)}</strong>
              </div>
              <div>
                <span>{copy.peopleAllocated}</span>
                <strong>{yen(selectedDepartment.member_allocated_yen)}</strong>
              </div>
              <div>
                <span>{copy.unallocated}</span>
                <strong
                  className={
                    selectedDepartment.available_to_delegate_yen < 0
                      ? "negative"
                      : ""
                  }
                >
                  {yen(selectedDepartment.available_to_delegate_yen)}
                </strong>
              </div>
            </div>
          </header>

          <DistributionBar
            total={selectedDepartment.allocation_yen}
            segments={selectedDepartment.members.map((member) => ({
              id: member.person_id,
              label: member.display_name,
              amount: member.allocation_yen,
            }))}
            onSelect={(id) =>
              setFocus({
                level: "person",
                orgUnitId: selectedDepartment.org_unit_id,
                personId: id,
              })
            }
          />

          <h3 className="alloc-section-title">
              <WithTip tip={copy.toPeopleTip}>
              {copy.toPeople}
            </WithTip>
          </h3>
          <SliceList
            total={selectedDepartment.allocation_yen}
            unallocatedYen={selectedDepartment.available_to_delegate_yen}
            unallocatedLabel={copy.unallocated}
            rows={[
              ...selectedDepartment.members.map((member) => ({
                id: member.person_id,
                label: member.display_name,
                meta:
                  member.allocation_status === "over_budget"
                    ? copy.overBudget
                    : undefined,
                amount: member.allocation_yen,
              })),
              ...selectedDepartment.candidate_people
                .filter(
                  (person) =>
                    !selectedDepartment.members.some(
                      (member) => member.person_id === person.person_id,
                    ),
                )
                .map((person) => ({
                  id: person.person_id,
                  label: person.display_name,
                  meta: copy.unallocated,
                  amount: 0,
                })),
            ]}
            onOpen={(id) =>
              setFocus({
                level: "person",
                orgUnitId: selectedDepartment.org_unit_id,
                personId: id,
              })
            }
          />

          {(budget.viewer.can_allocate_department || canManagePeople) && (
            <details className="alloc-inner" open>
              <summary>
                <WithTip tip={copy.deptCategoryTip}>
                  {copy.categoryAlloc}
                </WithTip>
                <span className="muted">
                  {copy.unallocatedPrefix}
                  {yen(
                    selectedDepartment.allocation_yen -
                      selectedDepartment.categories.reduce(
                        (sum, row) => sum + row.allocation_yen,
                        0,
                      ),
                  )}
                </span>
              </summary>
              {budget.viewer.can_allocate_department ? (
                <CategoryPoolEditor
                  rows={selectedDepartment.categories}
                  options={departmentCategoryOptions}
                  unallocatedYen={
                    selectedDepartment.allocation_yen -
                    selectedDepartment.categories.reduce(
                      (sum, row) => sum + row.allocation_yen,
                      0,
                    )
                  }
                  busy={busy}
                  onSave={(accountCode, amountYen) =>
                    onRun(
                      () =>
                        allocateOrgDepartmentCategoryBudget({
                          org_unit_id: selectedDepartment.org_unit_id,
                          account_code: accountCode,
                          amount_yen: amountYen,
                          expected_revision: revisionToken(),
                        }),
                      copy.deptCategoryUpdated,
                    )
                  }
                />
              ) : (
                <CategoryTable rows={selectedDepartment.categories} />
              )}
            </details>
          )}

          {budget.viewer.can_allocate_department && (
            <details className="alloc-advanced">
              <summary>
                <WithTip tip={copy.deptEnvelopeChangeTip}>
                  {copy.deptEnvelopeChange}
                </WithTip>
              </summary>
              <DepartmentEnvelopeEditor
                department={selectedDepartment}
                budget={budget}
                budgetLiveRef={budgetLiveRef}
                busy={busy}
                onRun={onRun}
              />
            </details>
          )}
        </section>
      )}

      {focus.level === "person" && selectedDepartment && (
        <section className="alloc-level" aria-label={copy.personAlloc}>
          <header className="alloc-envelope">
            <h2>
              <WithTip
                tip={copy.personAllocTip(selectedDepartment.org_unit_label)}
              >
                {selectedPerson?.display_name ??
                  selectedDepartment.candidate_people.find(
                    (p) => p.person_id === focus.personId,
                  )?.display_name ??
                  copy.personFallback}
              </WithTip>
            </h2>
            <div className="alloc-envelope-stats">
              <div>
                <span>{copy.allocated}</span>
                <strong>{yen(selectedPerson?.allocation_yen ?? 0)}</strong>
              </div>
              <div>
                <span>{copy.expenseActual}</span>
                <strong>{yen(selectedPerson?.actual_yen ?? 0)}</strong>
              </div>
              <div>
                <span>{copy.balance}</span>
                <strong
                  className={
                    (selectedPerson?.variance_yen ?? 0) < 0 ? "negative" : ""
                  }
                >
                  {yen(selectedPerson?.variance_yen ?? 0)}
                </strong>
              </div>
            </div>
          </header>

          {selectedPerson && selectedPerson.categories.length > 0 && (
            <CategoryTable rows={selectedPerson.categories} />
          )}

          {canManagePeople ? (
            <PersonCategoryEditor
              department={selectedDepartment}
              personId={focus.personId}
              getExpectedRevision={revisionToken}
              busy={busy}
              onRun={onRun}
              onPersonChange={(personId) =>
                setFocus({
                  level: "person",
                  orgUnitId: selectedDepartment.org_unit_id,
                  personId,
                })
              }
            />
          ) : (
            <p className="empty-copy">{copy.noPersonAllocPermission}</p>
          )}
        </section>
      )}
    </div>
  );
}
