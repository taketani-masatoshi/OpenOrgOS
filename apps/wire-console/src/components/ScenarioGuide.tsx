import type { MailFolder, WireConsoleScenario } from "../api";

interface Props {
  scenario: WireConsoleScenario;
  activeFolder: MailFolder;
}

const FOLDER_HINT_KEY: Record<string, keyof WireConsoleScenario["mail_hints"]> = {
  inbox: "inbox",
  outbox: "outbox",
  pending: "pending",
  witness: "witness",
  threads: "threads",
};

export function ScenarioGuide({ scenario, activeFolder }: Props) {
  const hintKey = FOLDER_HINT_KEY[activeFolder];
  const folderHint = hintKey ? scenario.mail_hints[hintKey] : undefined;

  return (
    <section className="scenario-guide panel">
      <div className="scenario-header">
        <span className="badge ok">{scenario.org_role_ja}</span>
        <h3>{scenario.title}</h3>
      </div>
      <p className="hint">
        相手方: {scenario.counterparty_label}
        {scenario.contract_id ? ` · 契約 ${scenario.contract_id}` : ""}
      </p>
      <ol className="scenario-flow">
        {scenario.flow_steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {folderHint ? (
        <p className="scenario-folder-hint">
          <strong>このフォルダ:</strong> {folderHint}
        </p>
      ) : null}
      {scenario.witness ? (
        <p className="hint scenario-witness">{scenario.witness.note}</p>
      ) : null}
    </section>
  );
}
