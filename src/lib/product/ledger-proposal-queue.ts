/**
 * Persisted AI / MCP journal proposals — Workbench approves; MCP never posts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir } from "../utils.js";
import { getClock } from "../runtime-context.js";
import { postManualJournalEntry } from "./ledger-manual-entry.js";

const proposalSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  source: z.enum(["mcp", "chat", "ui"]),
  created_at: z.string(),
  description: z.string(),
  debit_account: z.string(),
  credit_account: z.string(),
  amount_yen: z.number().positive(),
  occurred_at: z.string().optional(),
  note: z.string().optional(),
});

const queueFileSchema = z.object({
  version: z.literal(1),
  proposals: z.array(proposalSchema),
});

export type LedgerJournalProposal = z.infer<typeof proposalSchema>;

function queuePath(): string {
  return join(getDataDir(), "product", "ledger-proposals.yaml");
}

function loadQueue(): z.infer<typeof queueFileSchema> {
  const path = queuePath();
  if (!existsSync(path)) {
    return { version: 1, proposals: [] };
  }
  return queueFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

function saveQueue(file: z.infer<typeof queueFileSchema>): void {
  mkdirSync(join(getDataDir(), "product"), { recursive: true });
  writeFileSync(queuePath(), YAML.stringify(file), "utf-8");
}

export function enqueueManualJournalProposal(input: {
  description: string;
  debitAccount: string;
  creditAccount: string;
  amountYen: number;
  occurredAt?: string;
  source?: "mcp" | "chat" | "ui";
  note?: string;
}): LedgerJournalProposal {
  const amount = input.amountYen;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount_yen must be positive");
  }
  const description = input.description.trim();
  const debit = input.debitAccount.trim();
  const credit = input.creditAccount.trim();
  if (!description || !debit || !credit) {
    throw new Error("description, debit_account, and credit_account are required");
  }
  const file = loadQueue();
  const stamp = getClock().now().toISOString().slice(0, 10).replace(/-/g, "");
  const proposal: LedgerJournalProposal = {
    id: `PROP-${stamp}-${String(Date.now()).slice(-8)}`,
    status: "pending",
    source: input.source ?? "mcp",
    created_at: getClock().now().toISOString(),
    description,
    debit_account: debit,
    credit_account: credit,
    amount_yen: amount,
    occurred_at: input.occurredAt,
    note: input.note,
  };
  file.proposals.unshift(proposal);
  // Keep last 50
  file.proposals = file.proposals.slice(0, 50);
  saveQueue(file);
  return proposal;
}

export function listPendingJournalProposals(): LedgerJournalProposal[] {
  return loadQueue().proposals.filter((p) => p.status === "pending");
}

export function listJournalProposals(limit = 20): LedgerJournalProposal[] {
  return loadQueue().proposals.slice(0, limit);
}

export function approveJournalProposal(input: {
  proposalId: string;
  authorizedBy: string;
}): { entry_id: string; proposal: LedgerJournalProposal } {
  const file = loadQueue();
  const idx = file.proposals.findIndex((p) => p.id === input.proposalId);
  if (idx < 0) throw new Error(`proposal not found: ${input.proposalId}`);
  const proposal = file.proposals[idx]!;
  if (proposal.status !== "pending") {
    throw new Error(`proposal is ${proposal.status}`);
  }
  const posted = postManualJournalEntry({
    description: proposal.description,
    debitAccount: proposal.debit_account,
    creditAccount: proposal.credit_account,
    amountYen: proposal.amount_yen,
    occurredAt: proposal.occurred_at,
    authorizedBy: input.authorizedBy,
  });
  const updated: LedgerJournalProposal = { ...proposal, status: "approved" };
  file.proposals[idx] = updated;
  saveQueue(file);
  return { entry_id: posted.entry_id, proposal: updated };
}

export function rejectJournalProposal(proposalId: string): LedgerJournalProposal {
  const file = loadQueue();
  const idx = file.proposals.findIndex((p) => p.id === proposalId);
  if (idx < 0) throw new Error(`proposal not found: ${proposalId}`);
  const proposal = file.proposals[idx]!;
  if (proposal.status !== "pending") {
    throw new Error(`proposal is ${proposal.status}`);
  }
  const updated: LedgerJournalProposal = { ...proposal, status: "rejected" };
  file.proposals[idx] = updated;
  saveQueue(file);
  return updated;
}
