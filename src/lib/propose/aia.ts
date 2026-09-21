/** One proposal list. Does not run a loop and does not execute. */
export function proposeAiaCycle(input: {
  followups: Array<{ id: string }>;
  bottlenecks: Array<{ id: string }>;
  dispatch: Array<{ jobId: string }>;
}): {
  proposals: Array<{ source: "followup" | "bottleneck" | "dispatch"; id: string; sent: false }>;
  executed: false;
  looping: false;
} {
  const proposals = [
    ...input.followups.map((item) => ({
      source: "followup" as const,
      id: item.id,
      sent: false as const,
    })),
    ...input.bottlenecks.map((item) => ({
      source: "bottleneck" as const,
      id: item.id,
      sent: false as const,
    })),
    ...input.dispatch.map((item) => ({
      source: "dispatch" as const,
      id: item.jobId,
      sent: false as const,
    })),
  ];
  return { proposals, executed: false, looping: false };
}
