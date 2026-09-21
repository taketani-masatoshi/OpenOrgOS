export type BantProposal = {
  budget?: string;
  authority?: string;
  need?: string;
  timing?: string;
  proposedStage: "qualify" | "propose" | "stay";
  apply: "human";
  invoked: false;
};

export function extractBant(transcript: string): BantProposal {
  const budget = transcript.match(/予算[:：]\s*([^\n]+)/)?.[1]?.trim();
  const authority = transcript.match(/決裁[:：]\s*([^\n]+)/)?.[1]?.trim();
  const need = transcript.match(/ニーズ[:：]\s*([^\n]+)/)?.[1]?.trim();
  const timing = transcript.match(/時期[:：]\s*([^\n]+)/)?.[1]?.trim();
  const filled = [budget, authority, need, timing].filter(Boolean).length;
  const proposedStage = filled >= 3 ? "propose" : filled >= 1 ? "qualify" : "stay";
  return {
    budget,
    authority,
    need,
    timing,
    proposedStage,
    apply: "human",
    invoked: false,
  };
}
