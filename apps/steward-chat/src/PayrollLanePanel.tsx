import type { OrgBudgetPayload } from "./api";

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

function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

function kindLabel(kind: PersonPayroll["kind"] | undefined): string {
  if (kind === "officer") return "役員報酬";
  if (kind === "employee") return "給与";
  return "対象外";
}

export function PayrollLanePanel(props: Props) {
  if (props.mode === "company") {
    const payroll = props.payroll;
    if (!payroll) {
      return (
        <div className="payroll-lane payroll-lane--empty">
          <p className="muted">人件費データがありません。</p>
        </div>
      );
    }
    const tone =
      payroll.actual_months === 0 ? "muted" : payroll.ok ? "ok" : "warn";
    const status =
      payroll.actual_months === 0 ? "未計上" : payroll.ok ? "一致" : "要確認";
    const timeline = (payroll.months ?? []).filter((m) => m.basis === "actual");
    return (
      <div className="payroll-lane">
        <header className="payroll-lane__hero">
          <div>
            <h3 className="payroll-lane__title">人件費（全社）</h3>
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
        <div className="payroll-lane__formula" aria-label="突合">
          <div className="payroll-lane__formula-item">
            <span className="payroll-lane__formula-label">期待</span>
            <strong>{yen(payroll.actual_expected_yen)}</strong>
          </div>
          <span className="payroll-lane__formula-op" aria-hidden>
            −
          </span>
          <div className="payroll-lane__formula-item">
            <span className="payroll-lane__formula-label">計上</span>
            <strong>{yen(payroll.actual_booked_yen)}</strong>
          </div>
          <span className="payroll-lane__formula-op" aria-hidden>
            =
          </span>
          <div
            className={`payroll-lane__formula-item payroll-lane__formula-item--result${
              payroll.actual_variance_yen === 0 ? "" : " is-warn"
            }`}
          >
            <span className="payroll-lane__formula-label">差額</span>
            <strong>{yen(payroll.actual_variance_yen)}</strong>
          </div>
        </div>
        <div className="payroll-lane__monthly-split">
          <div className="payroll-lane__split-pill">
            <span>役員（月）</span>
            <strong>{yen(payroll.officer_monthly_yen)}</strong>
          </div>
          <div className="payroll-lane__split-pill">
            <span>従業員（月）</span>
            <strong>{yen(payroll.employee_monthly_yen)}</strong>
          </div>
        </div>
        {(payroll.officers?.length ?? 0) > 0 && (
          <section className="payroll-lane__group">
            <h4 className="payroll-lane__group-title">役員</h4>
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
                      {yen(row.monthly_yen)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {timeline.length > 0 && (
          <section className="payroll-lane__months">
            <h4 className="payroll-lane__group-title">月次</h4>
            <MonthTrack months={timeline} />
          </section>
        )}
      </div>
    );
  }

  const payroll = props.payroll;
  if (!payroll || payroll.kind === "none") {
    return (
      <div className="payroll-lane payroll-lane--empty">
        <p className="muted">
          {props.personLabel ? `${props.personLabel}に` : ""}
          人件費の割当はありません。
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
    ? "一致"
    : payroll.actual_months === 0
      ? "未計上"
      : payroll.ok
        ? "一致"
        : "要確認";
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
      <div className="payroll-lane__formula payroll-lane__formula--person" aria-label="突合">
        <div className="payroll-lane__formula-item">
          <span className="payroll-lane__formula-label">月額</span>
          <strong>{yen(payroll.expected_monthly_yen)}</strong>
        </div>
        <div className="payroll-lane__formula-item">
          <span className="payroll-lane__formula-label">期待累計</span>
          <strong>{yen(payroll.actual_expected_yen)}</strong>
        </div>
        <div className="payroll-lane__formula-item">
          <span className="payroll-lane__formula-label">計上累計</span>
          <strong>{yen(payroll.actual_booked_yen)}</strong>
        </div>
        <div
          className={`payroll-lane__formula-item payroll-lane__formula-item--result${
            payroll.actual_variance_yen === 0 ? "" : " is-warn"
          }`}
        >
          <span className="payroll-lane__formula-label">差額</span>
          <strong>{yen(payroll.actual_variance_yen)}</strong>
        </div>
      </div>
      {timeline.length > 0 && (
        <section className="payroll-lane__months">
          <h4 className="payroll-lane__group-title">月次</h4>
          <MonthTrack months={timeline} />
        </section>
      )}
    </div>
  );
}

function MonthTrack({
  months,
}: {
  months: Array<{
    month: string;
    booked_yen: number;
    variance_yen: number;
  }>;
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
              {empty ? "—" : yen(m.booked_yen)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
