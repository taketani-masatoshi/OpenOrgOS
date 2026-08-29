import { useCopy } from "@ops-shared/define-copy";
import type { MailFolder, WireConsoleScenario } from "../api";
import { WIRE_COPY } from "../wire-copy";

interface Props {
  scenario: WireConsoleScenario;
  activeFolder: MailFolder;
}

/** ours/theirs → 既存 mail_hints（pending / outbox）へマップ */
const FOLDER_HINT_KEY: Record<MailFolder, keyof WireConsoleScenario["mail_hints"]> = {
  ours: "pending",
  theirs: "outbox",
};

export function ScenarioGuide({ scenario, activeFolder }: Props) {
  const copy = useCopy(WIRE_COPY);
  const hintKey = FOLDER_HINT_KEY[activeFolder];
  const folderHint = hintKey ? scenario.mail_hints[hintKey] : undefined;

  return (
    <details className="scenario-guide panel">
      <summary className="scenario-summary">
        <span className="badge ok">{scenario.org_role_ja}</span>
        <span className="scenario-summary-title">{scenario.title}</span>
      </summary>
      <div className="scenario-body">
        <p className="hint">
          {copy.counterparty(scenario.counterparty_label)}
          {scenario.contract_id ? copy.contract(scenario.contract_id) : ""}
        </p>
        <ol className="scenario-flow">
          {scenario.flow_steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {folderHint ? (
          <p className="scenario-folder-hint">
            <strong>{copy.thisFolder}</strong> {folderHint}
          </p>
        ) : null}
        {scenario.witness ? (
          <p className="hint scenario-witness">{scenario.witness.note}</p>
        ) : null}
      </div>
    </details>
  );
}
