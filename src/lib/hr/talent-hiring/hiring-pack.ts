import type {
  EngagementKind,
  HiringPack,
  JobPosting,
} from "../../../../schemas/talent-hiring.js";

const EXIT_NAME: Record<EngagementKind, string> = {
  contractor: "委託契約の終了",
  fixed_term: "期間満了・更新しない",
  regular: "解雇",
};

export function buildHiringPack(input: {
  posting: JobPosting;
  engagement: EngagementKind;
  director: string;
}): HiringPack {
  const checks = input.posting.checks.map((check) => `- ${check}`).join("\n");
  const internal_job_summary = [
    `# 社内職務概要: ${input.posting.title}`,
    "",
    input.posting.duties,
    "",
    `指示者: ${input.director}`,
    "",
    "## 確認すること",
    checks,
  ].join("\n");

  const notes: string[] = [];
  if (input.engagement === "regular") {
    notes.push("実演5条件の未達は事実の記録であり、解雇の実行ではない。");
  }
  if (input.engagement === "fixed_term") {
    notes.push("反復更新を続けると雇止めが難しくなることがある。");
  }
  if (input.engagement === "contractor") {
    notes.push("会社が指揮命令すると形態が合わない。");
  }

  return {
    engagement: input.engagement,
    internal_job_summary,
    exit_name: EXIT_NAME[input.engagement],
    notes,
  };
}
