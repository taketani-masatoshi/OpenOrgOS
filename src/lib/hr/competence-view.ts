import type { CompetenceFile, TrainingFile } from "../../../schemas/hr.js";
import { loadCompetence, loadEmployees, loadTraining } from "../data.js";
import {
  assessTrainingCoverage,
  buildCompetenceMatrix,
  COMPETENCE_LEVEL_LABELS,
  type CompetenceMatrix,
} from "./competence.js";

const METHOD_LABELS: Record<string, string> = {
  self_study: "自習",
  ojt: "OJT",
  workshop: "集合研修",
  external: "外部研修",
  drill: "実地訓練",
};

const RESULT_LABELS: Record<string, string> = {
  effective: "有効",
  partial: "一部",
  not_effective: "不十分",
};

function levelCell(current: number, required: number): string {
  const mark = current >= required ? "" : " ⚠";
  return `${current} / ${required}${mark}`;
}

/** 力量マップ — roles down the side, people across, gaps marked. */
export function formatCompetenceMapMarkdown(
  file: CompetenceFile = loadCompetence(),
  matrix: CompetenceMatrix = buildCompetenceMatrix(file),
): string {
  const employees = loadEmployees().employees;
  const members = file.roles.flatMap((r) =>
    r.members.map((id) => ({
      id,
      role: r,
      name: employees.find((e) => e.id === id)?.name ?? id,
    })),
  );

  const out: string[] = [];
  out.push("# 力量マップ — 株式会社MAL");
  out.push("");
  out.push(
    `**規格:** ${file.standard ?? "—"} 7.2（力量）　**評価基準日:** ${file.as_of}　**対象:** 亀沢旅館（PROP-002）`,
  );
  out.push("");
  out.push(
    "> 本表は `data/hr/competence.yaml` から `orgos hr competence map` で生成する。直接編集しない。",
  );
  out.push("");
  out.push("## レベル定義");
  out.push("");
  out.push("| レベル | 意味 |");
  out.push("|---|---|");
  for (const [lv, label] of Object.entries(COMPETENCE_LEVEL_LABELS)) {
    out.push(`| ${lv} | ${label} |`);
  }
  out.push("");
  out.push("## 役割");
  out.push("");
  out.push("| 役割 | 名称 | 該当者 |");
  out.push("|---|---|---|");
  for (const r of file.roles) {
    const names = r.members
      .map((id) => employees.find((e) => e.id === id)?.name ?? id)
      .join(" · ");
    out.push(`| ${r.id} | ${r.title} | ${names} |`);
  }
  out.push("");
  out.push("## 力量マップ（現状 / 要求）");
  out.push("");
  out.push(
    `| 力量 | 法定 | 根拠 | ${members.map((m) => m.name).join(" | ")} |`,
  );
  out.push(`|---|---|---|${members.map(() => "---").join("|")}|`);
  for (const comp of file.competences) {
    const cols = members.map((m) => {
      const cell = matrix.cells.find(
        (c) => c.employee_id === m.id && c.competence_id === comp.id,
      );
      return cell ? levelCell(cell.current, cell.required) : "—";
    });
    const basis = [comp.iso_clause ? `${comp.iso_clause}` : "", ...comp.reg_refs]
      .filter(Boolean)
      .join(" · ");
    out.push(
      `| **${comp.id}** ${comp.title} | ${comp.statutory ? "○" : ""} | ${basis} | ${cols.join(" | ")} |`,
    );
  }
  out.push("");
  out.push("「—」は当該役割に要求のない力量。⚠ は要求レベル未達。");
  out.push("");

  out.push("## ギャップ（要求未達）");
  out.push("");
  if (matrix.gaps.length === 0) {
    out.push("要求レベル未達はない。");
  } else {
    out.push("| 対象者 | 力量 | 現状 | 要求 | 差 | 法定 | 現状の根拠 |");
    out.push("|---|---|---|---|---|---|---|");
    for (const g of matrix.gaps) {
      out.push(
        `| ${g.employee_name} | ${g.competence_id} ${g.competence_title} | ${g.current} | ${g.required} | ${g.gap} | ${g.statutory ? "○" : ""} | ${g.basis ?? "評価なし"} |`,
      );
    }
    out.push("");
    const statutory = matrix.gaps.filter((g) => g.statutory).length;
    out.push(
      `未達 ${matrix.gaps.length} 件（うち法定要求 ${statutory} 件）。法定項目は開業日 2026-09-18 までに解消する。`,
    );
  }
  out.push("");

  if (matrix.issues.length > 0) {
    out.push("## 整合性の警告");
    out.push("");
    for (const i of matrix.issues) out.push(`- ${i}`);
    out.push("");
  }

  out.push("## 関連");
  out.push("");
  out.push("- [研修計画 FY2026](研修計画-fy2026.md)");
  out.push("- [研修実施記録](研修実施記録.md)");
  out.push("- [REG-012 宿泊運営・サステナビリティ規程](../../../../company/regulations/shukuhaku-unyo-kisoku.md)");
  return out.join("\n") + "\n";
}

/** 研修計画 — one row per planned session, plus coverage against the map. */
export function formatTrainingPlanMarkdown(
  training: TrainingFile = loadTraining(),
  matrix: CompetenceMatrix = buildCompetenceMatrix(),
): string {
  const employees = loadEmployees().employees;
  const name = (id: string) =>
    employees.find((e) => e.id === id)?.name ?? id;
  const coverage = assessTrainingCoverage(matrix, training);

  const out: string[] = [];
  out.push("# 研修計画 — 株式会社MAL FY2026");
  out.push("");
  out.push(
    "**規格:** ISO 21401:2018 7.2 c/d　**対象:** 亀沢旅館（PROP-002）　**開業日:** 2026-09-18",
  );
  out.push("");
  out.push(
    "> 本表は `data/hr/training.yaml` から `orgos hr competence plan` で生成する。直接編集しない。",
  );
  out.push("");
  out.push("## 計画");
  out.push("");
  out.push("| ID | 実施予定 | 研修 | 対象力量 | 形式 | 時間 | 受講者 |");
  out.push("|---|---|---|---|---|---|---|");
  for (const s of [...training.sessions].sort((a, b) =>
    a.planned_on.localeCompare(b.planned_on),
  )) {
    out.push(
      `| ${s.id} | ${s.planned_on} | ${s.title} | ${s.competence_ids.join(" ")} | ${METHOD_LABELS[s.method] ?? s.method} | ${s.duration_min}分 | ${s.audience.map(name).join(" · ")} |`,
    );
  }
  out.push("");
  out.push("## 有効性の判定基準（7.2 d）");
  out.push("");
  out.push("| ID | 判定基準 | 教材 |");
  out.push("|---|---|---|");
  for (const s of training.sessions) {
    const material = s.material
      ? `[${s.material.split("/").pop()}](materials/${s.material.split("/").pop()})`
      : "外部機関の教材";
    out.push(`| ${s.id} | ${s.evaluation} | ${material} |`);
  }
  out.push("");
  out.push("## ギャップ充足状況");
  out.push("");
  if (coverage.uncovered.length === 0) {
    out.push("力量マップ上のギャップは、すべていずれかの研修で計画に含まれている。");
  } else {
    out.push("以下のギャップは計画に含まれていない。計画の追加が必要。");
    out.push("");
    out.push("| 対象者 | 力量 |");
    out.push("|---|---|");
    for (const u of coverage.uncovered) {
      out.push(`| ${u.employee_name} | ${u.competence_id} ${u.competence_title} |`);
    }
  }
  out.push("");
  out.push("## 関連");
  out.push("");
  out.push("- [力量マップ](力量マップ.md)");
  out.push("- [研修実施記録](研修実施記録.md)");
  return out.join("\n") + "\n";
}

/** 研修実施記録 — held sessions with the effectiveness outcome. */
export function formatTrainingRecordsMarkdown(
  training: TrainingFile = loadTraining(),
  matrix: CompetenceMatrix = buildCompetenceMatrix(),
): string {
  const employees = loadEmployees().employees;
  const name = (id: string) =>
    employees.find((e) => e.id === id)?.name ?? id;
  const coverage = assessTrainingCoverage(matrix, training);
  const sessions = new Map(training.sessions.map((s) => [s.id, s]));

  const out: string[] = [];
  out.push("# 研修実施記録 — 株式会社MAL FY2026");
  out.push("");
  out.push(
    "**規格:** ISO 21401:2018 7.2 d（有効性の評価）· 7.5（文書化した情報）",
  );
  out.push("");
  out.push(
    "> 本表は `data/hr/training.yaml` の records から `orgos hr competence records` で生成する。直接編集しない。",
  );
  out.push("");
  out.push(
    "記録は出席簿ではなく、判定基準に照らした **有効性の確認結果** を残す。REG-007 に従い確定後は追記しない。",
  );
  out.push("");
  out.push("## 実施済み");
  out.push("");
  if (training.records.length === 0) {
    out.push("実施記録はまだない。");
  } else {
    out.push("| 実施日 | 研修 | 受講者 | 結果 | 到達 | 所見 |");
    out.push("|---|---|---|---|---|---|");
    for (const r of [...training.records].sort(
      (a, b) => a.held_on.localeCompare(b.held_on) || a.employee_id.localeCompare(b.employee_id),
    )) {
      const s = sessions.get(r.session_id);
      out.push(
        `| ${r.held_on} | ${r.session_id} ${s?.title ?? ""} | ${name(r.employee_id)} | ${RESULT_LABELS[r.result] ?? r.result} | ${r.assessed_level ?? "—"} | ${r.notes ?? ""} |`,
      );
    }
  }
  out.push("");
  out.push("## 未実施（計画済み）");
  out.push("");
  const held = new Set(training.records.map((r) => `${r.session_id}/${r.employee_id}`));
  const pending = training.sessions.flatMap((s) =>
    s.audience
      .filter((emp) => !held.has(`${s.id}/${emp}`))
      .map((emp) => ({ s, emp })),
  );
  if (pending.length === 0) {
    out.push("計画された研修はすべて実施済み。");
  } else {
    out.push("| 実施予定 | 研修 | 受講者 |");
    out.push("|---|---|---|");
    for (const p of pending.sort((a, b) =>
      a.s.planned_on.localeCompare(b.s.planned_on),
    )) {
      out.push(`| ${p.s.planned_on} | ${p.s.id} ${p.s.title} | ${name(p.emp)} |`);
    }
  }
  out.push("");
  out.push("## 追加措置が必要なもの");
  out.push("");
  if (coverage.follow_up.length === 0) {
    out.push("有効性が確認できなかった受講者はいない。");
  } else {
    out.push("| 研修 | 受講者 | 結果 | 措置 |");
    out.push("|---|---|---|---|");
    for (const f of coverage.follow_up) {
      const r = training.records.find(
        (x) => x.session_id === f.session_id && x.employee_id === f.employee_id,
      );
      out.push(
        `| ${f.session_id} | ${name(f.employee_id)} | ${RESULT_LABELS[f.result] ?? f.result} | ${r?.notes ?? "再実施を計画する"} |`,
      );
    }
  }
  out.push("");
  out.push("## 関連");
  out.push("");
  out.push("- [力量マップ](力量マップ.md)");
  out.push("- [研修計画 FY2026](研修計画-fy2026.md)");
  return out.join("\n") + "\n";
}
