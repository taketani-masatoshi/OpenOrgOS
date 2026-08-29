import type { ReactNode } from "react";

export const SETTINGS_ACCORDION_GROUP = "operator-settings";

export type SettingsAccordionItemProps = {
  id: string;
  title: string;
  status?: string;
  children: ReactNode;
  groupName?: string;
};

/**
 * One collapsed settings row. Native exclusive accordion via `details[name]`.
 */
export function SettingsAccordionItem({
  id,
  title,
  status,
  children,
  groupName = SETTINGS_ACCORDION_GROUP,
}: SettingsAccordionItemProps) {
  const headingId = `${id}-heading`;
  return (
    <details className="settings-accordion-item" name={groupName}>
      <summary className="settings-accordion-summary">
        <span className="settings-accordion-chevron" aria-hidden="true">
          ›
        </span>
        <h2 className="settings-accordion-title" id={headingId}>
          {title}
        </h2>
        {status ? <span className="settings-accordion-status">{status}</span> : null}
      </summary>
      <div className="settings-accordion-body" role="region" aria-labelledby={headingId}>
        {children}
      </div>
    </details>
  );
}
