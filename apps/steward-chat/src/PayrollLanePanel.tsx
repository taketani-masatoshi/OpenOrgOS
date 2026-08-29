import { useCopy } from "@ops-shared/define-copy";
import { useUiLocale } from "@ops-shared/useUiLocale";
import { dateTimeLocale } from "@ops-shared/locale";
import { useState } from "react";
import type { OrgBudgetPayload } from "./api";
import { postTaxPayrollCalc } from "./api";
import { STEWARD_COPY } from "./steward-copy";

type CompanyPayroll = NonNullable<OrgBudgetPayload["payroll_reference"]>;
type PersonPayroll = NonNullable<
  OrgBudgetPayload["payroll_by_person"]
>[string];

type Props =
  | {
      mode: "company";
      payroll: CompanyPayroll | null | undefined;
    }
  | {
      mode: "person";
      payroll: PersonPayroll | null | undefined;
      personLabel?: string;
    };

function yen(n: number, locale: "ja" | "en"): string {
  return `¥${Math.round(n).toLocaleString(dateTimeLocale(locale))}`;
}

export function PayrollLanePanel(props: Props) {
  const copy = useCopy(STEWARD_COPY);
  const locale = useUiLocale();

  function kindLabel(kind: PersonPayroll["kind"] | undefined): string {
    if (kind === "officer") return copy.payrollKindOfficer;
    if (kind === "employee") return copy.payrollKindEmployee;
    return copy.payrollKindNone;
  }

  if (props.mode === "company") {
    const payroll = props.payroll;
    if (!payroll) {
      return (
        <div className="payroll-lane payroll-lane--empty">
          <p className="muted">{copy.payrollEmpty}</p>
        </div>
      );
    }
    const tone =
      payroll.actual_months === 0 ? "muted" : payroll.ok ? "ok" : "warn";
    const status =
      payroll.actual_months === 0
        ? copy.payrollUnbooked
        : payroll.ok
          ? copy.payrollMatch
          : copy.payrollCheck;
    const timeline = (payroll.months ?? []).filter((m) => m.basis === "actual");
    return (
      <div className="payroll-lane">
        <header className="payroll-lane__hero">
          <div>
            <h3 className="payroll-lane__title">{copy.payrollCompanyTitle}</h3>
            {payroll.period_from ? (
              <p className="payroll-lane__role">
                {payroll.fiscal_year} · {payroll.period_from}〜{payroll.period_to}
              </p>
            ) : null}
          </div>
          <div className={`payroll-lane__badge payroll-lane__badge--${tone}`}>
            <span className="payroll-lane__badge-dot" aria-hidden />
            {status}
          </div>
        </header>
        <div className="payroll-lane__formula" aria-label={copy.payrollReconcile}>
          <div className="payroll-lane__formula-item">
            <span className="payroll-lane__formula-label">{copy.payrollExpected}</span>
            <strong>{yen(payroll.actual_expected_yen, locale)}</strong>
          </div>
          <span className="payroll-lane__formula-op" aria-hidden>
            −
          </span>
          <div className="payroll-lane__formula-item">
            <span className="payroll-lane__formula-label">{copy.payrollBooked}</span>
            <strong>{yen(payroll.actual_booked_yen, locale)}</strong>
          </div>
          <span className="payroll-lane__formula-op" aria-hidden>
            =
          </span>
          <div
            className={`payroll-lane__formula-item payroll-lane__formula-item--result${
              payroll.actual_variance_yen === 0 ? "" : " is-warn"
            }`}
          >
            <span className="payroll-lane__formula-label">{copy.payrollVariance}</span>
            <strong>{yen(payroll.actual_variance_yen, locale)}</strong>
          </div>
        </div>
        <div className="payroll-lane__monthly-split">
          <div className="payroll-lane__split-pill">
            <span>{copy.payrollOfficerMonthly}</span>
            <strong>{yen(payroll.officer_monthly_yen, locale)}</strong>
          </div>
          <div className="payroll-lane__split-pill">
            <span>{copy.payrollEmployeeMonthly}</span>
            <strong>{yen(payroll.employee_monthly_yen, locale)}</strong>
          </div>
        </div>
        {(payroll.officers?.length ?? 0) > 0 && (
          <section className="payroll-lane__group">
            <h4 className="payroll-lane__group-title">{copy.payrollOfficers}</h4>
            <ul className="payroll-lane__rows">
              {payroll.officers.map((row) => (
                <li key={`${row.name}-${row.employee_id ?? ""}`}>
                  <div className="payroll-lane__row is-static">
                    <span className="payroll-lane__row-name">
                      {row.name}
                      {row.role ? (
                        <span className="payroll-lane__row-role">{row.role}</span>
                      ) : null}
                    </span>
                    <span className="payroll-lane__row-var">
                      {yen(row.monthly_yen, locale)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {timeline.length > 0 && (
          <section className="payroll-lane__months">
            <h4 className="payroll-lane__group-title">{copy.payrollMonthly}</h4>
            <MonthTrack months={timeline} locale={locale} />
          </section>
        )}
        <PayrollCalcForm
          defaultGross={payroll.employee_monthly_yen || payroll.officer_monthly_yen}
        />
      </div>
    );
  }

  const payroll = props.payroll;
  if (!payroll || payroll.kind === "none") {
    return (
      <div className="payroll-lane payroll-lane--empty">
        <p className="muted">
          {props.personLabel
            ? copy.payrollNonePerson(props.personLabel)
            : copy.payrollNoneGeneric}
        </p>
      </div>
    );
  }

  const zeroPlan =
    payroll.expected_monthly_yen === 0 && payroll.actual_booked_yen === 0;
  const tone = zeroPlan
    ? "ok"
    : payroll.actual_months === 0
      ? "muted"
      : payroll.ok
        ? "ok"
        : "warn";
  const status = zeroPlan
    ? copy.payrollMatch
    : payroll.actual_months === 0
      ? copy.payrollUnbooked
      : payroll.ok
        ? copy.payrollMatch
        : copy.payrollCheck;
  const timeline = (payroll.months ?? []).filter((m) => m.basis === "actual");

  return (
    <div className="payroll-lane">
      <header className="payroll-lane__hero">
        <div>
          <h3 className="payroll-lane__title">
            {payroll.display_name}
            <span className="payroll-lane__kind">{kindLabel(payroll.kind)}</span>
          </h3>
          {payroll.role ? (
            <p className="payroll-lane__role">{payroll.role}</p>
          ) : null}
          {payroll.period_from ? (
            <p className="payroll-lane__role">
              {payroll.fiscal_year} · {payroll.period_from}〜{payroll.period_to}
            </p>
          ) : null}
        </div>
        <div className={`payroll-lane__badge payroll-lane__badge--${tone}`}>
          <span className="payroll-lane__badge-dot" aria-hidden />
          {status}
        </div>
      </header>
      <div className="payroll-lane__formula payroll-lane__formula--person" aria-label={copy.payrollReconcile}>
        <div className="payroll-lane__formula-item">
          <span className="payroll-lane__formula-label">{copy.payrollMonthlyAmount}</span>
          <strong>{yen(payroll.expected_monthly_yen, locale)}</strong>
        </div>
        <div className="payroll-lane__formula-item">
          <span className="payroll-lane__formula-label">{copy.payrollExpectedCum}</span>
          <strong>{yen(payroll.actual_expected_yen, locale)}</strong>
        </div>
        <div className="payroll-lane__formula-item">
          <span className="payroll-lane__formula-label">{copy.payrollBookedCum}</span>
          <strong>{yen(payroll.actual_booked_yen, locale)}</strong>
        </div>
        <div
          className={`payroll-lane__formula-item payroll-lane__formula-item--result${
            payroll.actual_variance_yen === 0 ? "" : " is-warn"
          }`}
        >
          <span className="payroll-lane__formula-label">{copy.payrollVariance}</span>
          <strong>{yen(payroll.actual_variance_yen, locale)}</strong>
        </div>
      </div>
      {timeline.length > 0 && (
        <section className="payroll-lane__months">
          <h4 className="payroll-lane__group-title">{copy.payrollMonthly}</h4>
          <MonthTrack months={timeline} locale={locale} />
        </section>
      )}
      <PayrollCalcForm defaultGross={payroll.expected_monthly_yen} />
    </div>
  );
}

function PayrollCalcForm({ defaultGross }: { defaultGross: number }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [gross, setGross] = useState(String(Math.round(defaultGross || 0)));
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="payroll-lane__calc"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void postTaxPayrollCalc({
          month,
          gross_yen: Number(gross),
        })
          .then((r) => {
            setResult(
              `手取り ${r.run.net_pay_yen.toLocaleString("ja-JP")} · 源泉 ${r.run.withholding_yen.toLocaleString("ja-JP")}`,
            );
          })
          .catch((err) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => setBusy(false));
      }}
    >
      <h4 className="payroll-lane__group-title">給与計算</h4>
      <label className="wallet-field">
        対象月
        <input value={month} onChange={(e) => setMonth(e.target.value)} />
      </label>
      <label className="wallet-field">
        総支給（円）
        <input
          type="number"
          value={gross}
          onChange={(e) => setGross(e.target.value)}
        />
      </label>
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
        計算
      </button>
      {result ? <p className="muted">{result}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}
    </form>
  );
}

function MonthTrack({
  months,
  locale,
}: {
  months: Array<{
    month: string;
    booked_yen: number;
    variance_yen: number;
  }>;
  locale: "ja" | "en";
}) {
  return (
    <div className="payroll-lane__month-track" role="list">
      {months.map((m) => {
        const empty = m.booked_yen === 0;
        const warn = !empty && m.variance_yen !== 0;
        return (
          <div
            key={m.month}
            role="listitem"
            className={`payroll-lane__month${empty ? " is-empty" : ""}${
              warn ? " is-warn" : ""
            }`}
          >
            <span className="payroll-lane__month-label">{m.month.slice(5)}</span>
            <span className="payroll-lane__month-val">
              {empty ? "—" : yen(m.booked_yen, locale)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
