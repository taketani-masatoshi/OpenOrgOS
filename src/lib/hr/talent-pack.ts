import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EngagementKind, HiringPack, JobPosting } from "../../../schemas/talent-hiring.js";
import { buildHiringPack } from "./talent-hiring/hiring-pack.js";

export function runTalentPack(input: {
  posting: JobPosting;
  engagement: EngagementKind;
  director: string;
  writeDir?: string;
}): HiringPack & { written_path?: string } {
  const pack = buildHiringPack(input);
  if (!input.writeDir) return pack;
  mkdirSync(input.writeDir, { recursive: true });
  const written_path = join(input.writeDir, `hiring-pack-${input.engagement}.md`);
  writeFileSync(
    written_path,
    [
      pack.internal_job_summary,
      "",
      `出口: ${pack.exit_name}`,
      "",
      ...pack.notes.map((note) => `- ${note}`),
      "",
    ].join("\n"),
    "utf8",
  );
  return { ...pack, written_path };
}
