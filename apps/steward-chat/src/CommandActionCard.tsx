import { useMemo, useState, type FormEvent } from "react";
import {
  previewCommand,
  runCommand,
  type CommandPlan,
  type CommandRunResult,
} from "./api";

type Props = {
  plan: CommandPlan;
  onUpdated?: (plan: CommandPlan, run?: CommandRunResult) => void;
};

export function CommandActionCard({ plan: initial, onUpdated }: Props) {
  const [plan, setPlan] = useState(initial);
  const [args, setArgs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(initial.args ?? {})) {
      if (v === null || v === undefined) continue;
      init[k] = String(v);
    }
    for (const name of initial.missing_args ?? []) {
      if (!(name in init)) init[name] = "";
    }
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  const showConfirm =
    plan.status === "needs_confirmation" ||
    plan.status === "needs_args" ||
    plan.status === "ready";

  const parsedArgs = useMemo(() => {
    const out: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(args)) {
      if (v === "") {
        out[k] = null;
        continue;
      }
      if (/^\d+$/.test(v)) out[k] = Number(v);
      else if (v === "true" || v === "false") out[k] = v === "true";
      else out[k] = v;
    }
    return out;
  }, [args]);

  async function onRun(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { result, plan: nextPlan } = await runCommand(plan.plan_id, {
        args: parsedArgs,
        confirmed: true,
      });
      if (nextPlan) setPlan(nextPlan);
      if (result.ok) {
        setOutput(result.output ?? "(empty)");
        onUpdated?.(nextPlan ?? plan, result);
      } else {
        setError(result.error ?? "実行に失敗しました");
        onUpdated?.(nextPlan ?? plan, result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onChoose(skillId: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await previewCommand({
        message: plan.message ?? skillId,
        skill_id: skillId,
        args: parsedArgs,
      });
      setPlan(next);
      onUpdated?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="command-card">
      <div className="command-card-head">
        <strong>{plan.label ?? plan.skill_id ?? "コマンド"}</strong>
        <span className="command-card-status">{plan.status}</span>
      </div>
      {plan.cli_display && (
        <code className="command-card-cli">{plan.cli_display}</code>
      )}
      {plan.status === "ambiguous" && (plan.candidates?.length ?? 0) > 0 && (
        <ul className="command-card-candidates">
          {plan.candidates!.map((c) => (
            <li key={c.skill_id}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => void onChoose(c.skill_id)}
              >
                {c.label}
              </button>
              <code>{c.cli_display}</code>
            </li>
          ))}
        </ul>
      )}
      {plan.status === "approval_gate" && (
        <p className="command-card-hint">
          人間ゲートです。Wire / 振込 / 承認 UI から実行してください。
        </p>
      )}
      {(plan.missing_args?.length ?? 0) > 0 && (
        <form className="command-card-args" onSubmit={(e) => void onRun(e)}>
          {plan.missing_args!.map((name) => (
            <label key={name} className="command-card-field">
              <span>{name}</span>
              <input
                value={args[name] ?? ""}
                disabled={busy}
                onChange={(e) =>
                  setArgs((prev) => ({ ...prev, [name]: e.target.value }))
                }
              />
            </label>
          ))}
        </form>
      )}
      {showConfirm && plan.status !== "approval_gate" && (
        <div className="command-card-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void onRun()}
          >
            {plan.kind === "write" || plan.status === "needs_confirmation"
              ? "実行する"
              : "再実行"}
          </button>
        </div>
      )}
      {error && (
        <p className="command-card-error" role="alert">
          {error}
        </p>
      )}
      {output && <pre className="command-card-output">{output}</pre>}
    </div>
  );
}
