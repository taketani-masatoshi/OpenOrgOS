import { useState, type ReactNode } from "react";
import type { ExecutiveStaticReportSlot } from "./api";
import { StaticReportPanel } from "./StaticReportPanel";

export type DigestPeriodTab = "weekly" | "monthly";

export type StaticDigestSlots = {
  weekly: ExecutiveStaticReportSlot;
  monthly: ExecutiveStaticReportSlot;
};

type StaticDigestHeaderProps = {
  title: string;
  slots: StaticDigestSlots;
  weeklyEmptyLabel: string;
  monthlyEmptyLabel: string;
  weeklyTabLabel?: string;
  monthlyTabLabel?: string;
  defaultTab?: DigestPeriodTab;
  /** Extra content under the report (e.g. analytics snapshot tables). */
  children?: ReactNode;
  className?: string;
  headingId?: string;
};

/**
 * Weekly / monthly CLI→MD primary surface shared across Console scope-A pages.
 */
export function StaticDigestHeader({
  title,
  slots,
  weeklyEmptyLabel,
  monthlyEmptyLabel,
  weeklyTabLabel = "週次",
  monthlyTabLabel = "月次",
  defaultTab = "weekly",
  children,
  className,
  headingId = "static-digest-heading",
}: StaticDigestHeaderProps) {
  const [tab, setTab] = useState<DigestPeriodTab>(defaultTab);
  const slot = tab === "weekly" ? slots.weekly : slots.monthly;
  const emptyLabel = tab === "weekly" ? weeklyEmptyLabel : monthlyEmptyLabel;

  return (
    <section
      className={["outlook-panel", "ops-card", className].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="section-title">
        {title}
      </h2>
      <nav className="view-tabs" aria-label={title}>
        {(
          [
            ["weekly", weeklyTabLabel],
            ["monthly", monthlyTabLabel],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <StaticReportPanel slot={slot} emptyLabel={emptyLabel} />
      {children}
    </section>
  );
}
