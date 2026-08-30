import type { IncomingMessage, ServerResponse } from "node:http";
import { buildTodayContext, formatTodayContextMarkdown } from "../today-context.js";
import { operatorPolicyExcerpt } from "../../operator-policy.js";
import { runOperatorAsk, runOperatorAskStream } from "../../operator-runtime/ask.js";
import { loadQueueEvents } from "../../queue-db.js";
import { getTenantId } from "../../tenant.js";
import {
  chatApprovalRequestSchema,
  chatMessageRequestSchema,
  chatFeedbackRequestSchema,
  chatSettingsUpdateSchema,
  chatAgentIdSchema,
} from "../../../../schemas/steward-chat.js";
import {
  appendChatTurn,
  appendChatUserMessage,
  getChatSettings,
  historyForOperator,
  latestAssistantTurnId,
  loadChatThread,
  loadOrMigrateAgentThread,
  pruneAllChatThreadsToCurrentLimit,
  setChatHistoryMaxTurns,
  threadIdFromSessionToken,
  type ChatHistoryMaxTurns,
} from "../chat-thread.js";
import {
  chatMetaFromLlmResult,
  formatAnswerMemoryBlock,
  recentUserQueryHashes,
  rememberAnswer,
  retrieveAnswerMemory,
} from "../answer-memory.js";
import { recordChatFeedback } from "../chat-feedback.js";
import { buildFaqIndex, tryServeFaqAnswer } from "../faq-index.js";
import { touchChatActivityForFaq } from "../faq-idle.js";
import {
  approveFromStewardChat,
  flushWireDeliveryFromChat,
  loadSchedulingCorrespondencePreview,
  loadTenantConfigApprovalPreview,
  rejectTenantConfigFromStewardChat,
} from "../wire-approve.js";
import {
  handleSettlementApi,
  settlementStepUpResponse,
} from "./settlement-api.js";
import { SettlementStepUpRequiredError } from "../../org/settlement-stepup.js";
import { findOrgApproval } from "../../org/approval/approve.js";
import { proposeOrgApproval } from "../../org/approval/propose.js";
import { findOperatorById } from "../../org/operators.js";
import { settlementAssuranceRequired } from "../../org/settlement-stepup.js";
import {
  listPendingCeoInlineQuestions,
  findCeoInlineQuestion,
  answerCeoInline,
  applyCeoInlineAnswerSideEffects,
} from "../../correspondence/ceo-inline-question.js";
import {
  flushWitnessPendingFromChat,
  registerWitnessFromChat,
  verifyWitnessFromChat,
} from "../wire-witness.js";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { appendChatAudit, auditChatMessage } from "../audit.js";
import { buildOperatorStats } from "../operator-stats.js";
import {
  handleSchedulingChatMessage,
} from "../../scheduling-coordination/chat-intent.js";
import { runValidateReport } from "../../../commands/validate.js";
import { handleCashflowChatMessage } from "../../jp-bank-corporate/cashflow-chat-intent.js";
import { handleOrgBudgetApi } from "./org-budget-api.js";
import { handleOrgChartApi } from "./org-chart-api.js";
import { handlePlatformApi } from "./platform-api.js";
import { handleEsignApi } from "./esign-api.js";
import { handleAnalyticsApi } from "./analytics-api.js";
import { handleMedicalDeviceApi } from "./medical-device-api.js";
import { handleLedgerApi } from "./ledger-api.js";
import { handleProductApi } from "./product-api.js";
import { handleCustomersApi } from "./customers-api.js";
import { handleTaxApi } from "./tax-api.js";
import { handleDomainOpsApi } from "./domain-ops-api.js";
import { handleOrchestrationApi } from "./orchestration-api.js";
import { handleReceiptApi } from "./receipt-api.js";
import { handleLlmApi } from "./llm-api.js";
import { handleCommandApi } from "./command-api.js";
import { handleTowerApi } from "./tower-api.js";
import { handleTowerChatMessage } from "../../dispatch-tower/chat-handler.js";
import { handleAgentInboxApi } from "./agent-inbox-api.js";
import { buildExecutiveHome } from "../../executive-home/build-home.js";
import { handleCorrespondenceApi } from "./correspondence-api.js";
import { handleIntegrationsApi } from "./integrations-api.js";
import { handleBrokerApi } from "./broker-api.js";
import { handleEventsApi } from "./events-api.js";
import { handleAgentModulesApi } from "./agent-modules-api.js";
import {
  buildAgentInbox,
  formatAgentInboxMarkdown,
} from "../../agent-inbox.js";
import { formatChatGroundingBlock } from "../chat-grounding.js";
import { formatCeoReplyStyleBlock } from "../ceo-reply-style.js";
import {
  applyFactRefusalGuard,
  buildFactStructuredPayload,
  handleFactChatMessage,
} from "../../operator-facts/index.js";
import { handleTenantConfigProposeChatMessage } from "../tenant-config-intent.js";
import { handleStewardOrchestrateChatMessage } from "../steward-orchestrate-intent.js";
import { handleChatCommandMessage } from "../../operator-commands/index.js";
import {
  resolveOperatorFromSessionUser,
  resolveOperatorPermissions,
} from "../../console-auth/operator-rbac.js";
import { readAgentDefinition } from "../../agent-capability.js";
import { formatOwnerDeskChatRules } from "../../agent-owner-desks.js";
import type { AgentId } from "../../../../schemas/classification.js";
import type { LlmRouteHint } from "../../../../schemas/llm-workers.js";

export interface ChatApiContext {
  user: WireConsoleUser;
  sessionToken?: string;
}

type ChatAgentId = "secretary" | "executive_steward";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sseWrite(res: ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function resolveThreadId(ctx: ChatApiContext, agentId?: ChatAgentId): string {
  // When chat auth is off, keep a stable thread so history survives reloads
  // even if a leftover session cookie is present.
  const base =
    process.env.STEWARD_CHAT_AUTH === "0"
      ? "local"
      : threadIdFromSessionToken(ctx.sessionToken);
  return agentId ? `${base}:${agentId}` : base;
}

function preferAgentRoleSections(definition: string, maxChars = 12_000): string {
  if (definition.length <= maxChars) return definition;
  const headings = [
    /primary\s*folders/i,
    /skills?\b/i,
    /\bcli\b/i,
    /delegation|委譲/i,
    /role\b|役割/i,
    /boundaries|境界/i,
  ];
  const sections = definition.split(/(?=^#{1,3}\s+)/m);
  const preferred: string[] = [];
  const rest: string[] = [];
  for (const section of sections) {
    const head = section.split("\n", 1)[0] ?? "";
    if (headings.some((re) => re.test(head))) preferred.push(section);
    else rest.push(section);
  }
  let out = [...preferred, ...rest].join("").trim();
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}\n\n…(truncated)`;
  return out;
}

function agentRoleBlock(agentId: ChatAgentId | undefined): string {
  if (!agentId) return "";
  const definition = readAgentDefinition(agentId as AgentId);
  if (!definition.trim()) {
    return [
      "",
      `## Agent role (${agentId})`,
      `Path: steward/core/agents/${agentId}_agent.md`,
      "(definition file not found — stay within Operator Policy bounds)",
      formatOwnerDeskChatRules(agentId),
    ].join("\n");
  }
  const clipped = preferAgentRoleSections(definition, 12_000);
  return [
    "",
    `## Agent role — ${agentId}`,
    `Path: steward/core/agents/${agentId}_agent.md`,
    "Stay inside Primary Folders and L0–L1 output rules for this agent.",
    formatOwnerDeskChatRules(agentId),
    "",
    clipped,
  ].join("\n");
}

/** Inject AgentMission inbox digest into the system prompt (no LLM tools). */
function agentInboxBlock(agentId?: ChatAgentId): string {
  if (process.env.ORGOS_CHAT_INBOX_CONTEXT === "0") return "";
  try {
    const scope = agentId === "secretary" ? "secretary" : "executive_steward";
    const snapshot = buildAgentInbox({ for: scope, limit: 20 });
    const md = formatAgentInboxMarkdown(snapshot, { limit: 8, summaryMaxChars: 400 });
    return md.trim() ? `\n${md}` : "";
  } catch {
    return "";
  }
}

function buildChatSystem(threadId: string, agentId?: ChatAgentId, userMessage?: string) {
  const ctx = buildTodayContext();
  const thread = loadOrMigrateAgentThread(threadId, getTenantId(), agentId);
  const historyBlock =
    thread.messages.length > 0
      ? ["", "## Conversation history (recent)", formatHistoryMarkdown(thread)].join("\n")
      : "";
  const memoryHits = userMessage
    ? retrieveAnswerMemory(userMessage, {
        agentId,
        excludeQueryHashes: recentUserQueryHashes(thread),
      })
    : [];
  const memoryBlock = formatAnswerMemoryBlock(memoryHits);
  return {
    ctx,
    thread,
    history: historyForOperator(thread),
    memoryHits,
    system: [
      operatorPolicyExcerpt(35),
      agentRoleBlock(agentId),
      formatCeoReplyStyleBlock(),
      formatChatGroundingBlock(),
      memoryBlock,
      "",
      "## Today context",
      formatTodayContextMarkdown(ctx),
      agentInboxBlock(agentId),
      historyBlock,
    ].join("\n"),
  };
}

function persistLlmChatTurn(
  threadId: string,
  agentId: ChatAgentId | undefined,
  userMessage: string,
  assistantReply: string,
  result: { runtime: string; model?: string; tier?: "local" | "cloud"; worker_id?: string },
  sourceOverride?: "faq"
): string | undefined {
  const meta =
    sourceOverride === "faq"
      ? { source: "faq" as const }
      : chatMetaFromLlmResult(result);
  const saved = appendChatTurn(threadId, getTenantId(), userMessage, assistantReply, meta);
  if (meta.source && meta.source !== "deterministic") {
    rememberAnswer({
      query: userMessage,
      answer: assistantReply,
      agentId,
      source: meta.source,
      model: meta.model,
      worker_id: meta.worker_id,
    });
  }
  touchChatActivityForFaq();
  return latestAssistantTurnId(saved);
}

/** Deterministic pre-handler replies — still get turn_id so Good/Bad UI works. */
function persistDeterministicTurn(
  threadId: string,
  userMessage: string,
  assistantReply: string,
): string | undefined {
  const saved = appendChatTurn(threadId, getTenantId(), userMessage, assistantReply, {
    source: "deterministic",
  });
  touchChatActivityForFaq();
  return latestAssistantTurnId(saved);
}

function respondChatDone(
  res: ServerResponse,
  stream: boolean,
  threadId: string,
  payload: Record<string, unknown>,
): void {
  if (stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseWrite(res, { type: "connected", thread_id: threadId });
    sseWrite(res, { type: "done", ...payload, thread_id: threadId });
    res.end();
  } else {
    json(res, 200, { ...payload, thread_id: threadId });
  }
}

async function respondFaqHit(
  parsed: { message: string; agent_id?: ChatAgentId },
  res: ServerResponse,
  stream: boolean,
  ctx: ChatApiContext,
  threadId: string,
  agentId: ChatAgentId | undefined,
  reply: string
): Promise<boolean> {
  const assistantTurnId = persistLlmChatTurn(
    threadId,
    agentId,
    parsed.message,
    reply,
    { runtime: "llm-api" },
    "faq"
  );
  appendChatAudit({
    action: "message",
    operator_id: ctx.user.operator_id,
    approver_id: ctx.user.approver_id,
    ok: true,
    path: stream ? "/chat/v1/message/stream" : "/chat/v1/message",
    detail: "faq_served",
  });
  const body = {
    ok: true,
    reply,
    runtime: "faq-index",
    faq_served: true,
    assistant_turn_id: assistantTurnId,
  };
  respondChatDone(res, stream, threadId, body);
  return true;
}

function formatHistoryMarkdown(thread: ReturnType<typeof loadChatThread>): string {
  return thread.messages
    .map((m) => `- **${m.role}**: ${m.content.slice(0, 500)}`)
    .join("\n");
}

async function handleChatMessage(
  parsed: { message: string; agent_id?: ChatAgentId; llm_route?: LlmRouteHint },
  res: ServerResponse,
  stream: boolean,
  ctx: ChatApiContext
): Promise<boolean> {
  const agentId = parsed.agent_id;
  const threadId = resolveThreadId(ctx, agentId);
  // Persist 依頼 before long LLM work so switching agent pages cannot lose it.
  appendChatUserMessage(threadId, getTenantId(), parsed.message);

  const scheduling = handleSchedulingChatMessage(threadId, parsed.message);
  if (scheduling.handled && scheduling.reply) {
    const reply = scheduling.reply;
    const assistantTurnId = persistDeterministicTurn(threadId, parsed.message, reply);
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: true,
      path: stream ? "/chat/v1/message/stream" : "/chat/v1/message",
      detail: scheduling.caseRow
        ? `scheduling_case:${scheduling.caseRow.id}`
        : `scheduling_draft:${threadId}`,
    });
    respondChatDone(res, stream, threadId, {
      ok: true,
      reply,
      assistant_turn_id: assistantTurnId,
      structured: {
        scheduling_case_id: scheduling.caseRow?.id,
        scheduling_draft_status: scheduling.draft?.status,
        missing_information: scheduling.caseRow ? false : true,
      },
    });
    return true;
  }

  const tower = await handleTowerChatMessage(parsed.message, {
    fromAgent: agentId === "secretary" ? "secretary" : "executive_steward",
    operatorId: ctx.user.operator_id,
    approverId: ctx.user.approver_id,
    permissions: resolveOperatorFromSessionUser(ctx.user)
      ? resolveOperatorPermissions(resolveOperatorFromSessionUser(ctx.user)!)
      : undefined,
    toolCtx: {
      operatorId: ctx.user.operator_id,
      approverId: ctx.user.approver_id,
    },
  });
  if (tower.handled && tower.reply) {
    const assistantTurnId = persistDeterministicTurn(threadId, parsed.message, tower.reply);
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: tower.ok !== false,
      path: stream ? "/chat/v1/message/stream" : "/chat/v1/message",
      detail: `tower:${tower.classification?.kind ?? "n/a"}`,
    });
    respondChatDone(res, stream, threadId, {
      ok: tower.ok !== false,
      reply: tower.reply,
      assistant_turn_id: assistantTurnId,
      structured: {
        tower_plan: tower.tower_plan,
        ...tower.structured,
      },
    });
    return true;
  }

  // Deterministic fact providers (HR / finance / contract) before cashflow + LLM.
  const factReply = handleFactChatMessage(parsed.message, {
    fromAgent: agentId === "secretary" ? "secretary" : "executive_steward",
  });
  if (factReply.handled && factReply.reply) {
    const assistantTurnId = persistDeterministicTurn(threadId, parsed.message, factReply.reply);
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: factReply.ok !== false,
      path: stream ? "/chat/v1/message/stream" : "/chat/v1/message",
      detail: `facts:${factReply.providerId ?? "unknown"}:${factReply.coverage ?? "n/a"}`,
    });
    respondChatDone(res, stream, threadId, {
      ok: factReply.ok !== false,
      reply: factReply.reply,
      assistant_turn_id: assistantTurnId,
      structured: buildFactStructuredPayload(factReply),
    });
    return true;
  }

  const configPropose = handleTenantConfigProposeChatMessage(parsed.message, {
    proposedBy: ctx.user.operator_id,
    fromAgent: agentId === "secretary" ? "secretary" : "executive_steward",
  });
  if (configPropose.handled && configPropose.reply) {
    const assistantTurnId = persistDeterministicTurn(threadId, parsed.message, configPropose.reply);
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: configPropose.ok !== false,
      path: stream ? "/chat/v1/message/stream" : "/chat/v1/message",
      detail: `tenant-config:${configPropose.approval_id ?? "err"}`,
    });
    respondChatDone(res, stream, threadId, {
      ok: configPropose.ok !== false,
      reply: configPropose.reply,
      assistant_turn_id: assistantTurnId,
      structured: {
        tenant_config: {
          change_id: configPropose.change_id,
          approval_id: configPropose.approval_id,
        },
      },
    });
    return true;
  }

  if (agentId !== "secretary") {
    const cashflow = await handleCashflowChatMessage(parsed.message, {
      operatorId: ctx.user.operator_id,
      approverId: ctx.user.approver_id,
    });
    if (cashflow.handled && cashflow.reply) {
      let assistantTurnId: string | undefined;
      if (cashflow.ok) {
        assistantTurnId = persistDeterministicTurn(threadId, parsed.message, cashflow.reply);
      }
      appendChatAudit({
        action: "message",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: cashflow.ok === true,
        path: stream ? "/chat/v1/message/stream" : "/chat/v1/message",
        detail: `cashflow:${cashflow.structured?.cashflow_wrote ? "write" : "preview"}`,
      });
      respondChatDone(res, stream, threadId, {
        ok: cashflow.ok === true,
        reply: cashflow.reply,
        assistant_turn_id: assistantTurnId,
        structured: cashflow.structured,
      });
      return true;
    }
  }

  const orchestrate = handleStewardOrchestrateChatMessage(parsed.message, {
    fromAgent: agentId === "secretary" ? "secretary" : "executive_steward",
  });
  if (orchestrate.handled && orchestrate.reply) {
    const assistantTurnId = persistDeterministicTurn(threadId, parsed.message, orchestrate.reply);
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: orchestrate.ok === true,
      path: stream ? "/chat/v1/message/stream" : "/chat/v1/message",
      detail: `orchestrate:${(orchestrate.work_order_ids ?? []).join(",") || "none"}`,
    });
    respondChatDone(res, stream, threadId, {
      ok: orchestrate.ok === true,
      reply: orchestrate.reply,
      assistant_turn_id: assistantTurnId,
      structured: { work_order_ids: orchestrate.work_order_ids },
    });
    return true;
  }

  const operatorRecord = resolveOperatorFromSessionUser(ctx.user);
  const commandResult = await handleChatCommandMessage({
    message: parsed.message,
    operatorId: ctx.user.operator_id,
    permissions: operatorRecord ? resolveOperatorPermissions(operatorRecord) : undefined,
    fromAgent: agentId === "secretary" ? "secretary" : "executive_steward",
  });
  if (commandResult.handled && commandResult.reply) {
    const assistantTurnId = persistDeterministicTurn(
      threadId,
      parsed.message,
      commandResult.reply,
    );
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: commandResult.run?.ok !== false,
      path: stream ? "/chat/v1/message/stream" : "/chat/v1/message",
      detail: `commands:${commandResult.plan?.status ?? "n/a"}:${commandResult.plan?.skill_id ?? "none"}`,
    });
    respondChatDone(res, stream, threadId, {
      ok: commandResult.run?.ok !== false,
      reply: commandResult.reply,
      assistant_turn_id: assistantTurnId,
      structured: {
        command_plan: commandResult.plan,
        command_run: commandResult.run,
      },
    });
    return true;
  }

  const faqHit = tryServeFaqAnswer(parsed.message, { agentId });
  if (faqHit) {
    return respondFaqHit(parsed, res, stream, ctx, threadId, agentId, faqHit.answer);
  }

  const { system, history } = buildChatSystem(threadId, agentId, parsed.message);

  const buildGuardedStructured = (
    guarded: ReturnType<typeof applyFactRefusalGuard>,
    fallback: unknown
  ) => {
    if (!guarded.guarded) return fallback;
    const structured: Record<string, unknown> = {};
    if (guarded.finance_metrics) structured.finance_metrics = guarded.finance_metrics;
    if (guarded.contract_status) structured.contract_status = guarded.contract_status;
    if (guarded.hr_headcount) structured.hr_headcount = guarded.hr_headcount;
    if (guarded.work_order_ids) structured.work_order_ids = guarded.work_order_ids;
    if (guarded.providerId) {
      structured.facts = { id: guarded.providerId, view: guarded.view };
    }
    return Object.keys(structured).length > 0 ? structured : fallback;
  };

  if (!stream) {
    const result = await runOperatorAsk(parsed.message, system, {
      history,
      operatorId: ctx.user.operator_id,
      approverId: ctx.user.approver_id,
      llmRoute: parsed.llm_route,
    });
    const guarded = applyFactRefusalGuard(parsed.message, result.reply, {
      fromAgent: agentId === "secretary" ? "secretary" : "executive_steward",
    });
    const finalReply = guarded.reply;
    let assistantTurnId: string | undefined;
    if (result.ok && finalReply) {
      assistantTurnId = persistLlmChatTurn(threadId, agentId, parsed.message, finalReply, result);
    }
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: result.ok,
      path: "/chat/v1/message",
      detail: [
        agentId ? `agent:${agentId}` : null,
        guarded.guarded ? `${guarded.guard_kind ?? "fact"}_guard` : null,
        auditChatMessage(parsed.message),
      ]
        .filter(Boolean)
        .join(" "),
    });
    json(res, 200, {
      ok: result.ok,
      reply: finalReply,
      runtime: result.runtime,
      model: result.model,
      setup_required: result.setup_required,
      local_error: result.local_error === true,
      structured: buildGuardedStructured(guarded, result.structured),
      telemetry: result.telemetry,
      thread_id: threadId,
      assistant_turn_id: assistantTurnId,
      stdout: result.stdout.slice(0, 4000),
      stderr: result.stderr.slice(0, 2000),
    });
    return true;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  sseWrite(res, { type: "connected", thread_id: threadId });

  try {
    const gen = runOperatorAskStream(parsed.message, system, {
      history,
      operatorId: ctx.user.operator_id,
      approverId: ctx.user.approver_id,
      llmRoute: parsed.llm_route,
    });
    let step = await gen.next();
    while (!step.done) {
      sseWrite(res, step.value);
      step = await gen.next();
    }
    const result = step.value;
    const guarded = applyFactRefusalGuard(parsed.message, result.reply, {
      fromAgent: agentId === "secretary" ? "secretary" : "executive_steward",
    });
    const finalReply = guarded.reply;
    let assistantTurnId: string | undefined;
    if (result.ok && finalReply) {
      assistantTurnId = persistLlmChatTurn(threadId, agentId, parsed.message, finalReply, result);
    }
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: result.ok,
      path: "/chat/v1/message/stream",
      detail: [
        agentId ? `agent:${agentId}` : null,
        guarded.guarded ? `${guarded.guard_kind ?? "fact"}_guard` : null,
        auditChatMessage(parsed.message),
      ]
        .filter(Boolean)
        .join(" "),
    });
    sseWrite(res, {
      type: "done",
      ok: result.ok,
      reply: finalReply,
      runtime: result.runtime,
      model: result.model,
      setup_required: result.setup_required,
      local_error: result.local_error === true,
      structured: buildGuardedStructured(guarded, result.structured),
      telemetry: result.telemetry,
      thread_id: threadId,
      assistant_turn_id: assistantTurnId,
    });
  } catch (err) {
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: false,
      path: "/chat/v1/message/stream",
      detail: err instanceof Error ? err.message : String(err),
    });
    sseWrite(res, {
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  res.end();
  return true;
}


export async function handleChatApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  ctx: ChatApiContext
): Promise<boolean> {
  if (
    await handleSettlementApi(req, res, pathname, method, {
      user: ctx.user,
      readBody,
      hostFallback: req.headers.host,
    })
  ) {
    return true;
  }
  if (await handleOrgBudgetApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleOrgChartApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handlePlatformApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleEsignApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleAnalyticsApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleMedicalDeviceApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleLedgerApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleTaxApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleDomainOpsApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleProductApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleCustomersApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleOrchestrationApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleReceiptApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleLlmApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleTowerApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleCorrespondenceApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleIntegrationsApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleBrokerApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleEventsApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleCommandApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleAgentInboxApi(req, res, pathname, method, ctx.user))
    return true;
  if (await handleAgentModulesApi(req, res, pathname, method, ctx.user))
    return true;

  if (pathname === "/chat/v1/today" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    const today = buildTodayContext();
    json(res, 200, today);
    return true;
  }

  if (pathname === "/chat/v1/executive/home" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    try {
      json(res, 200, buildExecutiveHome());
    } catch (err) {
      json(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/today.md" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    const today = buildTodayContext();
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
    res.end(formatTodayContextMarkdown(today));
    return true;
  }

  if (pathname === "/chat/v1/validate" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    json(res, 200, runValidateReport());
    return true;
  }

  if (pathname === "/chat/v1/operator/stats" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    json(res, 200, { ok: true, ...buildOperatorStats() });
    return true;
  }

  if (pathname === "/chat/v1/approvals" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    const today = buildTodayContext();
    json(res, 200, { approvals: today.approvals });
    return true;
  }

  if (pathname === "/chat/v1/approvals/propose" && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:ask", res)) return true;
    try {
      const body = JSON.parse((await readBody(req)) || "{}") as Record<string, unknown>;
      const subjectType = String(body.subject_type ?? "").trim();
      if (!subjectType) {
        json(res, 422, { ok: false, error: "subject_type is required" });
        return true;
      }
      const op = findOperatorById(ctx.user.operator_id);
      const proposedBy =
        op?.display_name?.trim() || ctx.user.approver_id || ctx.user.operator_id;
      const amountNum = Number(body.amount);
      const amount =
        Number.isFinite(amountNum) && amountNum > 0
          ? {
              value: amountNum,
              currency: String(body.currency ?? "JPY").toUpperCase().slice(0, 3) || "JPY",
            }
          : undefined;
      const subjectRef =
        typeof body.subject_ref === "string" && body.subject_ref.trim()
          ? body.subject_ref.trim()
          : undefined;
      const message =
        typeof body.message === "string" && body.message.trim()
          ? body.message.trim()
          : undefined;
      const approval = proposeOrgApproval({
        scope: "internal",
        subjectType,
        subjectRef,
        proposedBy,
        message,
        amount,
      });
      appendChatAudit({
        action: "propose",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
        detail: approval.approval_id,
      });
      json(res, 200, { ok: true, approval });
    } catch (err) {
      json(res, 422, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  const approvalPreviewMatch = pathname.match(
    /^\/chat\/v1\/approvals\/([^/]+)\/scheduling-preview$/
  );
  if (approvalPreviewMatch && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:approve", res)) return true;
    const approvalId = decodeURIComponent(approvalPreviewMatch[1]!);
    try {
      json(res, 200, { ok: true, ...loadSchedulingCorrespondencePreview(approvalId) });
    } catch (err) {
      json(res, 400, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  const configPreviewMatch = pathname.match(
    /^\/chat\/v1\/approvals\/([^/]+)\/config-preview$/
  );
  if (configPreviewMatch && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:approve", res)) return true;
    const approvalId = decodeURIComponent(configPreviewMatch[1]!);
    try {
      json(res, 200, { ok: true, ...loadTenantConfigApprovalPreview(approvalId) });
    } catch (err) {
      json(res, 400, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  const rejectMatch = pathname.match(/^\/chat\/v1\/approvals\/([^/]+)\/reject$/);
  if (rejectMatch && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:approve", res)) return true;
    const approvalId = decodeURIComponent(rejectMatch[1]!);
    const body = await readBody(req);
    let reason: string | undefined;
    try {
      const parsed = JSON.parse(body || "{}") as { reason?: string };
      reason = typeof parsed.reason === "string" ? parsed.reason : undefined;
    } catch {
      /* empty */
    }
    try {
      const result = rejectTenantConfigFromStewardChat(approvalId, ctx.user, reason);
      appendChatAudit({
        action: "reject",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
        detail: approvalId,
      });
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "reject",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  const approveMatch = pathname.match(/^\/chat\/v1\/approvals\/([^/]+)\/approve$/);
  if (approveMatch && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:approve", res)) return true;
    const approvalId = decodeURIComponent(approveMatch[1]!);
    const body = await readBody(req);
    let flush = true;
    let reviewed = false;
    let settlementAssertion:
      | {
          challenge_id: string;
          token: string;
          credential_id: string;
          challenge: string;
          client_data_json: string;
          authenticator_data_base64?: string;
          signature_base64?: string;
        }
      | undefined;
    let coApproverId: string | undefined;
    try {
      const parsed = JSON.parse(body || "{}") as Record<string, unknown>;
      const gated = chatApprovalRequestSchema.parse(parsed);
      if (gated.flush === false) flush = false;
      reviewed = gated.reviewed === true;
      if (typeof parsed.co_approver_id === "string") coApproverId = parsed.co_approver_id;
      if (
        parsed.settlement &&
        typeof parsed.settlement === "object" &&
        parsed.settlement !== null
      ) {
        const s = parsed.settlement as Record<string, string>;
        if (s.challenge_id && s.token && s.credential_id && s.challenge && s.client_data_json) {
          settlementAssertion = {
            challenge_id: s.challenge_id,
            token: s.token,
            credential_id: s.credential_id,
            challenge: s.challenge,
            client_data_json: s.client_data_json,
            authenticator_data_base64: s.authenticator_data_base64,
            signature_base64: s.signature_base64,
          };
        }
      }
    } catch {
      /* default flush */
    }

    const pending = findOrgApproval(approvalId);
    if (pending && settlementAssuranceRequired(pending) && !settlementAssertion) {
      const { resolveApprovalAssuranceTier } = await import(
        "../../org/settlement-stepup.js"
      );
      json(
        res,
        409,
        settlementStepUpResponse(
          new SettlementStepUpRequiredError(
            approvalId,
            resolveApprovalAssuranceTier(pending)
          )
        )
      );
      return true;
    }

    try {
      const result = await approveFromStewardChat(approvalId, ctx.user, {
        flush,
        reviewed,
        settlementAssertion,
        coApproverId,
      });
      appendChatAudit({
        action: "approve",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
        detail: approvalId,
      });
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      if (err instanceof SettlementStepUpRequiredError) {
        json(res, 409, settlementStepUpResponse(err));
        return true;
      }
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "approve",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/wire/flush" && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:wire", res)) return true;
    try {
      const result = await flushWireDeliveryFromChat();
      appendChatAudit({
        action: "wire_flush",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
      });
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "wire_flush",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/wire/witness/register" && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:wire", res)) return true;
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body || "{}") as { event_id?: string; side?: string };
      if (!parsed.event_id || (parsed.side !== "sent" && parsed.side !== "received")) {
        json(res, 422, { ok: false, error: "event_id and side (sent|received) required" });
        return true;
      }
      const result = await registerWitnessFromChat(parsed.event_id, parsed.side);
      appendChatAudit({
        action: "witness_register",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
        detail: parsed.event_id,
      });
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "witness_register",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/wire/witness/verify" && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:wire", res)) return true;
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body || "{}") as { event_id?: string };
      if (!parsed.event_id) {
        json(res, 422, { ok: false, error: "event_id required" });
        return true;
      }
      const result = await verifyWitnessFromChat(parsed.event_id);
      appendChatAudit({
        action: "witness_verify",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
        detail: parsed.event_id,
      });
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "witness_verify",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/wire/witness/flush" && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:wire", res)) return true;
    try {
      const result = await flushWitnessPendingFromChat();
      appendChatAudit({
        action: "witness_flush",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
      });
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "witness_flush",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/ceo-questions" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    const questions = listPendingCeoInlineQuestions();
    json(res, 200, { ok: true, questions });
    return true;
  }

  const ceoShowMatch = pathname.match(/^\/chat\/v1\/ceo-questions\/([^/]+)$/);
  if (ceoShowMatch && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    const questionId = decodeURIComponent(ceoShowMatch[1]!);
    const question = findCeoInlineQuestion(questionId);
    if (!question) {
      json(res, 404, { ok: false, error: `CEO question not found: ${questionId}` });
      return true;
    }
    json(res, 200, { ok: true, question });
    return true;
  }

  const ceoAnswerMatch = pathname.match(/^\/chat\/v1\/ceo-questions\/([^/]+)\/answer$/);
  if (ceoAnswerMatch && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:approve", res)) return true;
    const questionId = decodeURIComponent(ceoAnswerMatch[1]!);
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body || "{}") as { fields?: Record<string, string> };
      if (!parsed.fields || typeof parsed.fields !== "object") {
        json(res, 422, { ok: false, error: "fields object required" });
        return true;
      }
      const question = findCeoInlineQuestion(questionId);
      if (!question) {
        json(res, 404, { ok: false, error: `CEO question not found: ${questionId}` });
        return true;
      }
      if (question.status !== "pending") {
        json(res, 400, { ok: false, error: `Question ${questionId} is already ${question.status}` });
        return true;
      }
      const answered = answerCeoInline(
        questionId,
        parsed.fields,
        ctx.user.approver_id ?? ctx.user.operator_id
      );
      await applyCeoInlineAnswerSideEffects(answered);
      appendChatAudit({
        action: "ceo_answer",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
        detail: questionId,
      });
      json(res, 200, { ok: true, question: answered });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "ceo_answer",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (
    (pathname === "/chat/v1/message" && method === "POST") ||
    (pathname === "/chat/v1/message/stream" && method === "POST")
  ) {
    if (!requireChatPermission(ctx.user, "chat:ask", res)) return true;
    const raw = await readBody(req);
    let parsed: {
      message: string;
      refresh?: boolean;
      agent_id?: ChatAgentId;
      llm_route?: LlmRouteHint;
    };
    try {
      parsed = chatMessageRequestSchema.parse(JSON.parse(raw));
    } catch {
      json(res, 400, { error: "invalid body" });
      return true;
    }

    const stream = pathname.endsWith("/stream");
    return handleChatMessage(parsed, res, stream, ctx);
  }

  if (pathname === "/chat/v1/thread" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    const agentRaw = new URL(req.url ?? "/", "http://local").searchParams.get("agent_id");
    let agentId: ChatAgentId | undefined;
    if (agentRaw) {
      const parsed = chatAgentIdSchema.safeParse(agentRaw);
      if (!parsed.success) {
        json(res, 400, { ok: false, error: "invalid agent_id" });
        return true;
      }
      agentId = parsed.data;
    }
    const threadId = resolveThreadId(ctx, agentId);
    const thread = loadOrMigrateAgentThread(threadId, getTenantId(), agentId);
    const settings = getChatSettings();
    json(res, 200, {
      ok: true,
      thread_id: thread.thread_id,
      messages: thread.messages,
      settings,
    });
    return true;
  }

  if (pathname === "/chat/v1/settings" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    json(res, 200, { ok: true, settings: getChatSettings() });
    return true;
  }

  if (pathname === "/chat/v1/settings" && method === "PUT") {
    if (!requireChatPermission(ctx.user, "chat:ask", res)) return true;
    const raw = await readBody(req);
    let maxTurns: ChatHistoryMaxTurns;
    try {
      maxTurns = chatSettingsUpdateSchema.parse(JSON.parse(raw)).max_turns;
    } catch {
      json(res, 400, { ok: false, error: "invalid body" });
      return true;
    }
    const settings = setChatHistoryMaxTurns(maxTurns);
    const pruned = pruneAllChatThreadsToCurrentLimit(getTenantId());
    json(res, 200, { ok: true, settings, pruned_threads: pruned });
    return true;
  }

  if (pathname === "/chat/v1/feedback" && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:ask", res)) return true;
    const raw = await readBody(req);
    let body;
    try {
      body = chatFeedbackRequestSchema.parse(JSON.parse(raw));
    } catch {
      json(res, 400, { ok: false, error: "invalid body" });
      return true;
    }
    const threadId = resolveThreadId(ctx, body.agent_id);
    const result = recordChatFeedback({
      threadId,
      tenant: getTenantId(),
      turnId: body.turn_id,
      rating: body.rating,
      agentId: body.agent_id,
    });
    if (!result.ok) {
      json(res, 404, { ok: false, error: result.error });
      return true;
    }
    json(res, 200, { ok: true, rating: result.rating });
    return true;
  }

  if (pathname === "/chat/v1/faq/build" && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:ask", res)) return true;
    const built = buildFaqIndex();
    json(res, 200, { ok: true, ...built });
    return true;
  }

  if (pathname === "/chat/v1/events/stream" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    const recent = loadQueueEvents().filter((e) => e.type === "pipeline_daily_complete").slice(-1);
    if (recent[0]) {
      res.write(`data: ${JSON.stringify({ type: "pipeline_daily_complete", event: recent[0] })}\n\n`);
    }

    const interval = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 30000);

    req.on("close", () => clearInterval(interval));
    return true;
  }

  return false;
}
