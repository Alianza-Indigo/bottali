import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, knowledgeBases, messages, notifications, providerModels, providers, toolCallConfirmations, tools } from "@/db/schema";
import type { FullVersionConfig } from "@/lib/tools/repository";
import { canUserAccessTool } from "@/lib/tools/access";
import { loadVersionConfig } from "@/lib/tools/repository";
import { moderateForTool } from "@/lib/tools/provider-credentials";
import { estimateCostCents } from "@/lib/ai/usage/cost";
import type { GenerationMessage, GenerationResult, GenerationUsage, LLMProvider, ToolCall, ToolSpec } from "@/lib/ai/types";
import { INTERNAL_TOOLS, getInternalTool, listToolSpecsForLLM } from "@/lib/ai/tools/registry";
import { executeInternalTool } from "@/lib/ai/tools/execute";
import { buildExternalApiToolSpecs, executeExternalApiCall, isExternalApiToolName, type ExternalApiEndpoint } from "@/lib/ai/tools/external";
import { reconcileUsage, releaseReservation, reserveUsage } from "./limits";
import { recordMemoryTurn, retrieveMemory } from "./memory";
import { maybeGenerateTitle } from "./service";
import {
  claimConfirmationForExecution,
  claimConfirmationForRejection,
  clearConfirmationSnapshot,
  computeConfirmationExpiry,
  expirePendingConfirmationsForConversation,
  expireSingleConfirmation,
  getConfirmationById,
  markConfirmationApproved,
} from "./tool-confirmations";
import { retrieveRelevantChunks, buildKnowledgeContextBlock } from "@/lib/knowledge/retrieval";
import { attachFilesToMessage, persistGeneratedDocument } from "@/lib/files/service";
import { recordAuditEvent } from "@/lib/audit/log";
import { AppError, BudgetExceededError, ForbiddenError, NotFoundError, RateLimitError } from "@/lib/utils/errors";
import { wrapToolResultForModel } from "./tool-result";
import {
  getToolLLMProvider,
  toolHasProviderCredential,
} from "@/lib/tools/provider-credentials";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/organizations/constants";

/** A document produced by generate_text_document during a turn, collected so
 * finalizeGeneration can persist it (§17/§36) once the assistant message it belongs to
 * actually exists. */
interface GeneratedDocumentDraft {
  title: string;
  text: string;
  mimeType: string;
}

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; finishReason: string }
  | { type: "blocked"; reason: string }
  | { type: "error"; message: string }
  | { type: "confirmation_required"; confirmationId: string; toolName: string; arguments: string };

const HISTORY_MESSAGE_LIMIT = 20;
/** Bounds the §15 tool-calling loop: the model gets this many rounds to request an
 * internal tool before it's forced to answer in text (the last round omits `tools`
 * entirely, which guarantees termination instead of relying on the model's cooperation). */
const MAX_TOOL_ROUNDS = 4;

export interface SendMessageParams {
  conversationId: string;
  userId: string;
  organizationId?: string;
  content: string;
  signal: AbortSignal;
  /** File ids from a prior POST /files upload — gated by capabilities.files on the client;
   * re-validated server-side against ownership/status regardless (see attachFilesToMessage). */
  attachedFileIds?: string[];
}

interface ResolvedContext {
  conversation: typeof conversations.$inferSelect;
  tool: typeof tools.$inferSelect;
  config: FullVersionConfig & { behavior: NonNullable<FullVersionConfig["behavior"]> };
  model: typeof providerModels.$inferSelect;
  providerKey: string;
}

async function resolveGenerationContext(
  conversationId: string,
  userId: string,
  organizationId = DEFAULT_ORGANIZATION_ID,
): Promise<ResolvedContext> {
  const conversationRows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)))
    .limit(1);
  const conversation = conversationRows[0];
  if (!conversation || conversation.deletedAt) throw new NotFoundError("Conversación no encontrada.");
  if (conversation.userId !== userId) throw new ForbiddenError("No puedes acceder a esta conversación.");
  if (conversation.status !== "ACTIVE") throw new AppError("La conversación no admite nuevos mensajes.", "CONVERSATION_NOT_ACTIVE", 409);

  const toolRows = await db.select().from(tools).where(eq(tools.id, conversation.toolId)).limit(1);
  const tool = toolRows[0];
  if (!tool || tool.status !== "PUBLISHED") {
    throw new AppError("Esta herramienta no está disponible actualmente.", "TOOL_UNAVAILABLE", 409);
  }
  if (!(await canUserAccessTool(tool.id, userId, conversation.organizationId))) {
    throw new ForbiddenError("No tienes acceso a esta herramienta.");
  }

  const config = await loadVersionConfig(conversation.toolVersionId);
  if (!config.behavior || !config.models?.primaryModelId) {
    throw new AppError("La herramienta no está configurada correctamente.", "TOOL_MISCONFIGURED", 500);
  }

  const modelRows = await db.select().from(providerModels).where(eq(providerModels.id, config.models.primaryModelId)).limit(1);
  const model = modelRows[0];
  if (!model) throw new AppError("El modelo configurado ya no existe.", "MODEL_NOT_FOUND", 500);
  const providerRows = await db
    .select({ key: providers.key, enabled: providers.enabled })
    .from(providers)
    .where(eq(providers.id, model.providerId))
    .limit(1);
  const provider = providerRows[0];
  const hasToolCredential = provider
    ? await toolHasProviderCredential(tool.id, model.providerId)
    : false;
  if (!provider || (!provider.enabled && !hasToolCredential)) {
    throw new AppError("El proveedor configurado no está disponible.", "PROVIDER_UNAVAILABLE", 503);
  }

  return { conversation, tool, config: config as ResolvedContext["config"], model, providerKey: provider.key };
}

function resolveAllowedToolNames(config: ResolvedContext["config"]): string[] {
  if (!config.capabilities?.internalTools || !config.safetyPolicies) return [];
  return config.safetyPolicies.allowedInternalTools.filter((name) => {
    if (!(name in INTERNAL_TOOLS)) return false;
    // documentGeneration/forms are separate capability toggles layered on top of the general
    // internalTools/allowedInternalTools gate, same shape as how confirmationsRequired
    // layers onto individual tool names.
    if (name === "generate_text_document" && !config.capabilities?.documentGeneration) return false;
    if (name === "collect_form_input" && !config.capabilities?.forms) return false;
    return true;
  });
}

function resolveExternalApiEndpoints(config: ResolvedContext["config"]): ExternalApiEndpoint[] {
  if (!config.capabilities?.externalApis) return [];
  return config.capabilities.externalApiEndpoints ?? [];
}

/**
 * Executes a tool call unconditionally — confirmation gating happens in runToolRoundLoop
 * BEFORE this is ever called, so by the time this runs the call is already known-approved.
 * Never throws: a bad tool name, invalid/malformed JSON arguments, or an execution error all
 * become a `{"error": "..."}` result instead — the model sees the failure and can recover
 * (retry differently, or just answer without the tool) instead of the whole turn crashing.
 */
async function executeToolCallForPipeline(
  call: { name: string; arguments: string },
  context: { userId: string; conversationId: string; toolId: string },
  allowedToolNames: string[],
  externalApiEndpoints: ExternalApiEndpoint[],
  generatedDocuments: GeneratedDocumentDraft[],
): Promise<string> {
  let parsedInput: unknown;
  try {
    parsedInput = JSON.parse(call.arguments);
  } catch {
    return JSON.stringify({ error: "Los argumentos enviados para la herramienta no son JSON válido." });
  }

  if (isExternalApiToolName(call.name)) {
    const result = await executeExternalApiCall(call.name, parsedInput, externalApiEndpoints, context);
    return JSON.stringify(result);
  }

  const definition = getInternalTool(call.name);
  if (!definition) {
    return JSON.stringify({ error: `Herramienta interna desconocida: ${call.name}` });
  }

  try {
    const result = await executeInternalTool(call.name, parsedInput, context, allowedToolNames);
    if (call.name === "generate_text_document" && result.success && typeof result.output?.text === "string") {
      const rawTitle = (parsedInput as { title?: unknown } | null)?.title;
      generatedDocuments.push({
        title: typeof rawTitle === "string" ? rawTitle : "Documento",
        text: result.output.text,
        mimeType: typeof result.output.mimeType === "string" ? result.output.mimeType : "text/plain",
      });
    }
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : "La herramienta interna falló al ejecutarse." });
  }
}

function toolNeedsConfirmation(toolName: string, confirmationsRequired: string[]): boolean {
  if (isExternalApiToolName(toolName)) return true;
  const definition = getInternalTool(toolName);
  return Boolean(definition?.requiresConfirmation) || confirmationsRequired.includes(toolName);
}

async function moderateFinalText(
  toolId: string,
  text: string,
  outputModerationEnabled: boolean,
): Promise<{ blocked: boolean; moderationResult: unknown }> {
  if (!text || !outputModerationEnabled) return { blocked: false, moderationResult: null };
  const moderation = await moderateForTool(toolId, text);
  return { blocked: moderation.flagged, moderationResult: moderation };
}

type ToolRoundLoopOutcome =
  | {
      kind: "final";
      generationMessages: GenerationMessage[];
      accumulatedUsage: GenerationUsage;
      accumulatedLatencyMs: number;
      finalResult: GenerationResult | null;
      cancelled: boolean;
      generatedDocuments: GeneratedDocumentDraft[];
    }
  | {
      kind: "confirmation_required";
      generationMessages: GenerationMessage[];
      accumulatedUsage: GenerationUsage;
      accumulatedLatencyMs: number;
      round: number;
      call: ToolCall;
      /** Tool calls from the SAME round as `call`, positioned after it, not yet processed. */
      remainingCalls: ToolCall[];
      generatedDocuments: GeneratedDocumentDraft[];
    };

interface ToolRoundLoopParams {
  provider: LLMProvider;
  modelKey: string;
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  signal: AbortSignal;
  context: { userId: string; conversationId: string; toolId: string };
  allowedToolNames: string[];
  externalApiEndpoints: ExternalApiEndpoint[];
  confirmationsRequired: string[];
  toolSpecs: ToolSpec[];
  generationMessages: GenerationMessage[];
  round: number;
  accumulatedUsage: GenerationUsage;
  accumulatedLatencyMs: number;
  /** When resuming after a confirmation, the calls still owed from that same round. */
  pendingCalls?: ToolCall[];
  /** Documents generated earlier in this same turn (e.g. before an intervening
   * confirmation-requiring call) — mutated in place as further calls execute. */
  generatedDocuments: GeneratedDocumentDraft[];
}

/**
 * §15 core tool-calling loop: the model may request a tool, which is executed and fed back
 * as a "tool" message, repeating until it answers in text or MAX_TOOL_ROUNDS is exhausted
 * (the final round omits `tools`, forcing an answer). Pausable: if a requested tool needs
 * human confirmation, the loop stops mid-round and returns everything needed to resume it
 * later. This function has no side effects beyond the LLM/tool calls themselves — no DB
 * writes — so it's identically safe to run from a fresh start (round 0) or from a persisted
 * snapshot (resumeAfterToolConfirmation).
 */
async function runToolRoundLoop(p: ToolRoundLoopParams): Promise<ToolRoundLoopOutcome> {
  let generationMessages = p.generationMessages;
  const accumulatedUsage: GenerationUsage = { ...p.accumulatedUsage };
  let round = p.round;
  let pendingCalls = p.pendingCalls ?? null;
  const enteredAt = Date.now();

  const latencySoFar = () => p.accumulatedLatencyMs + (Date.now() - enteredAt);

  for (;;) {
    if (p.signal.aborted) {
      return {
        kind: "final",
        generationMessages,
        accumulatedUsage,
        accumulatedLatencyMs: latencySoFar(),
        finalResult: null,
        cancelled: true,
        generatedDocuments: p.generatedDocuments,
      };
    }

    let toolCallsToProcess: ToolCall[];
    if (pendingCalls) {
      toolCallsToProcess = pendingCalls;
      pendingCalls = null;
    } else {
      const isLastRound = round === MAX_TOOL_ROUNDS;
      const result = await p.provider.generate({
        model: p.modelKey,
        messages: generationMessages,
        temperature: p.temperature,
        topP: p.topP,
        maxOutputTokens: p.maxOutputTokens,
        tools: isLastRound ? undefined : p.toolSpecs,
        signal: p.signal,
      });
      accumulatedUsage.inputTokens += result.usage.inputTokens;
      accumulatedUsage.outputTokens += result.usage.outputTokens;

      if (!(result.finishReason === "tool_calls" && result.toolCalls?.length && !isLastRound)) {
        return {
          kind: "final",
          generationMessages,
          accumulatedUsage,
          accumulatedLatencyMs: latencySoFar(),
          finalResult: result,
          cancelled: false,
          generatedDocuments: p.generatedDocuments,
        };
      }

      generationMessages = [...generationMessages, { role: "assistant", content: result.content, toolCalls: result.toolCalls }];
      toolCallsToProcess = result.toolCalls;
    }

    for (let i = 0; i < toolCallsToProcess.length; i += 1) {
      const call = toolCallsToProcess[i]!;
      if (toolNeedsConfirmation(call.name, p.confirmationsRequired)) {
        return {
          kind: "confirmation_required",
          generationMessages,
          accumulatedUsage,
          accumulatedLatencyMs: latencySoFar(),
          round,
          call,
          remainingCalls: toolCallsToProcess.slice(i + 1),
          generatedDocuments: p.generatedDocuments,
        };
      }
      const toolResultContent = await executeToolCallForPipeline(
        call,
        p.context,
        p.allowedToolNames,
        p.externalApiEndpoints,
        p.generatedDocuments,
      );
      generationMessages = [...generationMessages, { role: "tool", content: wrapToolResultForModel(toolResultContent), toolCallId: call.id }];
    }

    round += 1;
  }
}

interface FinalizeParams {
  conversation: typeof conversations.$inferSelect;
  tool: typeof tools.$inferSelect;
  model: typeof providerModels.$inferSelect;
  config: ResolvedContext["config"];
  providerKey: string;
  userId: string;
  userMessageContent: string;
  reservationId: string;
  cancelled: boolean;
  fullText: string;
  finishReason: string;
  usage: GenerationUsage;
  latencyMs: number;
  moderationResult: unknown;
  blocked: boolean;
  generatedDocuments?: GeneratedDocumentDraft[];
}

/**
 * §12 steps 18–25: persists the final message, reconciles usage/cost, updates the
 * conversation, records memory/audit, and yields the terminal StreamEvent. Shared by every
 * path that can produce a final answer — fresh streaming turns, fresh tool-calling turns,
 * and turns resumed after a human confirmation — so they can never drift apart on how a
 * turn actually ends.
 */
async function* finalizeGeneration(p: FinalizeParams): AsyncGenerator<StreamEvent> {
  const { conversation, tool, model, config, providerKey, userId, userMessageContent, reservationId } = p;

  if (p.cancelled) {
    await releaseReservation(reservationId);
    const [cancelledMessage] = await db
      .insert(messages)
      .values({ conversationId: conversation.id, role: "assistant", content: p.fullText, status: "CANCELLED", finishReason: "cancelled" })
      .returning({ id: messages.id });
    yield { type: "done", messageId: cancelledMessage?.id ?? "", finishReason: "cancelled" };
    return;
  }

  const finalContent = p.blocked
    ? config.safetyPolicies?.contingencyMessage || "No es posible mostrar esta respuesta por políticas de seguridad."
    : p.fullText;
  const messageStatus: "COMPLETED" | "BLOCKED" = p.blocked ? "BLOCKED" : "COMPLETED";

  const costCents = estimateCostCents(p.usage, {
    inputCostPerMilleCents: Number(model.inputCostPerMilleCents),
    outputCostPerMilleCents: Number(model.outputCostPerMilleCents),
  });

  const [assistantMessage] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      role: "assistant",
      content: finalContent,
      status: messageStatus,
      provider: providerKey,
      model: model.modelKey,
      inputTokens: p.usage.inputTokens,
      outputTokens: p.usage.outputTokens,
      estimatedCostCents: String(costCents),
      latencyMs: p.latencyMs,
      finishReason: p.finishReason,
      moderationResult: p.moderationResult ? { ...(p.moderationResult as object) } : null,
    })
    .returning({ id: messages.id });
  if (!assistantMessage) throw new Error("No fue posible guardar la respuesta.");

  // Persist any documents generate_text_document produced during this turn (§17/§36) now
  // that the assistant message they belong to actually has an id. Skipped for a BLOCKED
  // reply — the file would otherwise let the user recover content output moderation hid.
  if (!p.blocked && p.generatedDocuments && p.generatedDocuments.length > 0) {
    const fileIds: string[] = [];
    for (const doc of p.generatedDocuments) {
      const file = await persistGeneratedDocument({
        userId,
        organizationId: conversation.organizationId,
        toolId: tool.id,
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        kind: "text_document",
        title: doc.title,
        text: doc.text,
        mimeType: doc.mimeType,
      });
      fileIds.push(file.id);
    }
    await db.update(messages).set({ generatedFileIds: fileIds }).where(eq(messages.id, assistantMessage.id));
  }

  await reconcileUsage({
    reservationId,
    userId,
    toolId: tool.id,
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    provider: providerKey,
    model: model.modelKey,
    inputTokens: p.usage.inputTokens,
    outputTokens: p.usage.outputTokens,
    costCents,
  });

  await db.update(conversations).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
  await maybeGenerateTitle(conversation.id, userMessageContent);

  if (config.capabilities?.memory && config.behavior.memoryMode !== "DISABLED") {
    await recordMemoryTurn({
      userId,
      toolId: tool.id,
      conversationId: conversation.id,
      mode: config.behavior.memoryMode,
      userMessage: userMessageContent,
    });
  }

  await recordAuditEvent({
    actorId: userId,
    action: "conversation.message.generate",
    resourceType: "conversation",
    resourceId: conversation.id,
    correlationId: randomUUID(),
    metadata: { toolId: tool.id, model: model.modelKey, inputTokens: p.usage.inputTokens, outputTokens: p.usage.outputTokens, latencyMs: p.latencyMs },
  });

  if (messageStatus === "COMPLETED" && config.capabilities?.notifications) {
    await db.insert(notifications).values({
      userId,
      kind: "conversation_reply",
      title: "Nueva respuesta disponible",
      body: finalContent.slice(0, 200),
      link: `/tools/${tool.slug}/chat`,
    });
  }

  if (messageStatus === "BLOCKED") {
    yield { type: "blocked", reason: finalContent };
    return;
  }
  yield { type: "done", messageId: assistantMessage.id, finishReason: p.finishReason };
}

interface GenerateReplyParams {
  ctx: ResolvedContext;
  userId: string;
  userMessageContent: string;
  signal: AbortSignal;
  /**
   * Identifies this specific generation attempt for `reserveUsage`'s dedup check. Must be
   * stable across retries of the SAME attempt (so a duplicate call never double-reserves
   * budget) but distinct across attempts that should each be billed separately — e.g. two
   * different regenerate clicks. Callers derive it from a row id that's unique per attempt
   * (the fresh user message for `sendMessage`, the specific message being regenerated for
   * `regenerateResponse`), never from randomness.
   */
  idempotencyKey: string;
  /** Excluded from the history sent to the model — used by regenerate to drop the old reply. */
  excludeMessageIds?: string[];
}

/**
 * §12 steps 10–25: builds context (history + memory + knowledge), streams the model's
 * reply with rolling output moderation, persists the final message, and records
 * usage/cost/latency/audit. Shared by both `sendMessage` (new user turn) and
 * `regenerateResponse` (same user turn, fresh reply) so the two never drift apart.
 */
async function* generateReply(params: GenerateReplyParams): AsyncGenerator<StreamEvent> {
  const { ctx, userId, userMessageContent, signal, idempotencyKey } = params;
  const { conversation, tool, config, model } = ctx;

  const estimatedCostCents = estimateCostCents(
    { inputTokens: Math.ceil(userMessageContent.length / 4) + 500, outputTokens: config.models!.maxOutputTokens },
    { inputCostPerMilleCents: Number(model.inputCostPerMilleCents), outputCostPerMilleCents: Number(model.outputCostPerMilleCents) },
  );

  let reservationId: string;
  try {
    const reservation = await reserveUsage({
      userId,
      toolId: tool.id,
      toolVersionId: conversation.toolVersionId,
      conversationId: conversation.id,
      idempotencyKey,
      estimatedCostCents,
    });
    reservationId = reservation.reservationId;
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof BudgetExceededError) {
      yield { type: "blocked", reason: error.message };
      return;
    }
    throw error;
  }

  // capabilities.history (default true) is the real on/off switch for multi-turn context —
  // a tool with it off treats every message as a fresh, stateless turn.
  const excluded = new Set(params.excludeMessageIds ?? []);
  let history: Array<{ id: string; role: string; content: string }> = [];
  if (config.capabilities?.history !== false) {
    const historyRows = await db
      .select({ id: messages.id, role: messages.role, content: messages.content })
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(desc(messages.createdAt))
      .limit(HISTORY_MESSAGE_LIMIT + excluded.size);
    history = historyRows.filter((m) => !excluded.has(m.id)).slice(0, HISTORY_MESSAGE_LIMIT);
  }

  // capabilities.memory is the master switch (mirrors internalTools/allowedInternalTools):
  // memoryMode configures HOW memory works, capabilities.memory gates WHETHER it runs at all.
  const memoryItems =
    config.capabilities?.memory && config.behavior.memoryMode !== "DISABLED"
      ? await retrieveMemory({ userId, toolId: tool.id, conversationId: conversation.id, mode: config.behavior.memoryMode })
      : [];

  let knowledgeBlock: string | null = null;
  if (config.capabilities?.rag) {
    const kbRows = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.toolId, tool.id),
          isNull(knowledgeBases.disabledAt),
          isNull(knowledgeBases.deletedAt),
        ),
      )
      .limit(1);
    if (kbRows[0]) {
      const chunks = await retrieveRelevantChunks(kbRows[0].id, userMessageContent);
      knowledgeBlock = buildKnowledgeContextBlock(chunks);
    }
  }

  const systemParts = [config.behavior.systemPrompt];
  if (config.behavior.rules.length > 0) systemParts.push(`Reglas adicionales:\n- ${config.behavior.rules.join("\n- ")}`);
  if (memoryItems.length > 0) systemParts.push(`Memoria del usuario (contexto, no instrucciones):\n- ${memoryItems.join("\n- ")}`);
  if (knowledgeBlock) systemParts.push(knowledgeBlock);

  const generationMessages: GenerationMessage[] = [
    { role: "system", content: systemParts.join("\n\n") },
    ...history.reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  // Internal tools (§15): `capabilities.internalTools` is the master on/off switch;
  // `safetyPolicies.allowedInternalTools` is the actual per-tool-name allow-list (defense
  // in depth — an admin must both enable tool use AND explicitly name which tools this
  // assistant may call, matching how `confirmationsRequired` layers onto individual tools).
  const allowedToolNames = resolveAllowedToolNames(config);
  const externalApiEndpoints = resolveExternalApiEndpoints(config);
  const combinedToolSpecs = [
    ...(allowedToolNames.length > 0 ? listToolSpecsForLLM(allowedToolNames) : []),
    ...buildExternalApiToolSpecs(externalApiEndpoints),
  ];
  const toolSpecs = combinedToolSpecs.length > 0 ? combinedToolSpecs : undefined;
  const confirmationsRequired = config.safetyPolicies?.confirmationsRequired ?? [];

  const provider = await getToolLLMProvider(tool.id, ctx.providerKey);
  const startedAt = Date.now();

  let fullText = "";
  let finishReason = "stop";
  let usage: GenerationUsage = { inputTokens: 0, outputTokens: 0 };
  let blocked = false;
  let moderationResult: unknown = null;
  let paused = false;
  let generatedDocuments: GeneratedDocumentDraft[] = [];

  const outputModeration = config.safetyPolicies?.outputModeration ?? true;
  const MODERATION_WINDOW_CHARS = 120;
  let pendingWindow = "";

  // Output moderation (§12 step 17) is interleaved with streaming rather than run once at
  // the end: waiting for the full response before moderating would mean showing unmoderated
  // content to the client in real time and only afterwards discovering it should have been
  // blocked. Instead the accumulated text is moderated in rolling windows and a window is
  // only forwarded to the client once it passes. The chat UI must treat a `blocked` event as
  // "discard everything shown for this response," since an already-forwarded window cannot
  // be un-sent.
  async function checkWindow(force: boolean): Promise<{ blocked: boolean; toForward: string }> {
    if (!pendingWindow) return { blocked: false, toForward: "" };
    if (!outputModeration) {
      const toForward = pendingWindow;
      pendingWindow = "";
      return { blocked: false, toForward };
    }
    if (!force && pendingWindow.length < MODERATION_WINDOW_CHARS) return { blocked: false, toForward: "" };
    const moderation = await moderateForTool(tool.id, fullText);
    moderationResult = moderation;
    if (moderation.flagged) return { blocked: true, toForward: "" };
    const toForward = pendingWindow;
    pendingWindow = "";
    return { blocked: false, toForward };
  }

  try {
    if (toolSpecs && toolSpecs.length > 0) {
      // Tool-calling turns (§15) run as a bounded sequence of non-streaming rounds — see
      // runToolRoundLoop. The trade-off is real and deliberate: a turn that uses a tool
      // loses live token-by-token streaming (moderated and delivered as one burst instead),
      // since tool-call JSON and visible prose can't safely share one wire.
      const outcome = await runToolRoundLoop({
        provider,
        modelKey: model.modelKey,
        temperature: Number(config.models!.temperature),
        topP: Number(config.models!.topP),
        maxOutputTokens: config.models!.maxOutputTokens,
        signal,
        context: { userId, conversationId: conversation.id, toolId: tool.id },
        allowedToolNames,
        externalApiEndpoints,
        confirmationsRequired,
        toolSpecs,
        generationMessages,
        round: 0,
        accumulatedUsage: { inputTokens: 0, outputTokens: 0 },
        accumulatedLatencyMs: 0,
        generatedDocuments: [],
      });

      if (outcome.kind === "confirmation_required") {
        const [row] = await db
          .insert(toolCallConfirmations)
          .values({
            conversationId: conversation.id,
            userId,
            toolId: tool.id,
            reservationId,
            toolCallId: outcome.call.id,
            toolName: outcome.call.name,
            argumentsJson: outcome.call.arguments,
            generationStateSnapshot: {
              generationMessages: outcome.generationMessages,
              round: outcome.round,
              accumulatedUsage: outcome.accumulatedUsage,
              accumulatedLatencyMs: outcome.accumulatedLatencyMs,
              userMessageContent,
              remainingCalls: outcome.remainingCalls,
              generatedDocuments: outcome.generatedDocuments,
            },
            expiresAt: computeConfirmationExpiry(),
          })
          .returning({ id: toolCallConfirmations.id });
        if (!row) throw new Error("No fue posible registrar la confirmación pendiente.");
        yield { type: "confirmation_required", confirmationId: row.id, toolName: outcome.call.name, arguments: outcome.call.arguments };
        paused = true;
      } else {
        usage = outcome.accumulatedUsage;
        generatedDocuments = outcome.generatedDocuments;
        if (outcome.cancelled) {
          finishReason = "cancelled";
        } else {
          if (outcome.finalResult) {
            fullText = outcome.finalResult.content;
            finishReason = outcome.finalResult.finishReason;
          }
          const modResult = await moderateFinalText(tool.id, fullText, outputModeration);
          blocked = modResult.blocked;
          moderationResult = modResult.moderationResult;
          if (!blocked && fullText) yield { type: "delta", text: fullText };
        }
      }
    } else {
      // capabilities.streaming (default true): off means the client gets the finished
      // reply as one burst instead of token-by-token. Moderation still windows internally
      // either way — only whether intermediate windows are forwarded to the client changes.
      const streamingEnabled = config.capabilities?.streaming !== false;
      for await (const chunk of provider.stream({
        model: model.modelKey,
        messages: generationMessages,
        temperature: Number(config.models!.temperature),
        topP: Number(config.models!.topP),
        maxOutputTokens: config.models!.maxOutputTokens,
        signal,
      })) {
        if (signal.aborted) {
          finishReason = "cancelled";
          break;
        }
        if (chunk.delta) {
          fullText += chunk.delta;
          pendingWindow += chunk.delta;
          const result = await checkWindow(false);
          if (result.blocked) {
            blocked = true;
            break;
          }
          if (streamingEnabled && result.toForward) yield { type: "delta", text: result.toForward };
        }
        if (chunk.done) {
          finishReason = chunk.finishReason ?? "stop";
          if (chunk.usage) usage = chunk.usage;
        }
      }
      if (!blocked) {
        const result = await checkWindow(true);
        if (result.blocked) blocked = true;
        else if (streamingEnabled && result.toForward) yield { type: "delta", text: result.toForward };
      }
      if (!blocked && !streamingEnabled && fullText) yield { type: "delta", text: fullText };
    }
  } catch (error) {
    await releaseReservation(reservationId);
    await db.insert(messages).values({ conversationId: conversation.id, role: "assistant", content: "", status: "FAILED", finishReason: "error" });
    yield { type: "error", message: error instanceof Error ? error.message : "Error al generar la respuesta." };
    return;
  }

  if (paused) return;

  const cancelled = signal.aborted || finishReason === "cancelled";

  yield* finalizeGeneration({
    conversation,
    tool,
    model,
    config,
    providerKey: provider.key,
    userId,
    userMessageContent,
    reservationId,
    cancelled,
    fullText,
    finishReason,
    usage,
    latencyMs: Date.now() - startedAt,
    moderationResult,
    blocked,
    generatedDocuments,
  });
}

/** §12 full pipeline for a new user turn: validate → moderate input → persist → generate. */
export async function* sendMessage(params: SendMessageParams): AsyncGenerator<StreamEvent> {
  const ctx = await resolveGenerationContext(params.conversationId, params.userId, params.organizationId);

  // Flexible-by-design (§15): a pending confirmation on this conversation never blocks the
  // user from sending a new message — but the conversation has moved on, so that old pending
  // call is no longer relevant to resume and its reservation is released now instead of
  // sitting HELD until the cron sweep or its own expiry.
  await expirePendingConfirmationsForConversation(params.conversationId);

  const inputModeration = ctx.config.safetyPolicies?.inputModeration ?? true;
  if (inputModeration) {
    const moderation = await moderateForTool(ctx.tool.id, params.content);
    if (moderation.flagged) {
      await db.insert(messages).values({
        conversationId: params.conversationId,
        role: "user",
        content: params.content,
        status: "BLOCKED",
        moderationResult: { ...moderation },
      });
      yield {
        type: "blocked",
        reason: ctx.config.safetyPolicies?.contingencyMessage || "Tu mensaje no pudo procesarse por políticas de seguridad.",
      };
      return;
    }
  }

  const [userMessage] = await db
    .insert(messages)
    .values({ conversationId: params.conversationId, role: "user", content: params.content, status: "COMPLETED" })
    .returning({ id: messages.id });
  if (!userMessage) throw new Error("No fue posible guardar el mensaje del usuario.");

  if (ctx.config.capabilities?.files && params.attachedFileIds?.length) {
    const attached = await attachFilesToMessage(
      params.attachedFileIds,
      params.userId,
      params.conversationId,
      userMessage.id,
      ctx.conversation.organizationId,
    );
    if (attached.length > 0) {
      await db
        .update(messages)
        .set({ attachedFileIds: attached.map((f) => f.id) })
        .where(eq(messages.id, userMessage.id));
    }
  }

  yield* generateReply({
    ctx,
    userId: params.userId,
    userMessageContent: params.content,
    signal: params.signal,
    // userMessage.id is freshly inserted above, unique to this call — stable across a retry
    // of this exact attempt, distinct from every other message.
    idempotencyKey: `message-generation:${userMessage.id}`,
  });
}

export interface RegenerateParams {
  assistantMessageId: string;
  userId: string;
  organizationId?: string;
  signal: AbortSignal;
}

/** §11/§27 "regenerar": produces a fresh reply to the same preceding user turn, leaving the
 * original reply in history (it is not deleted or mutated — messages are append-only). */
export async function* regenerateResponse(params: RegenerateParams): AsyncGenerator<StreamEvent> {
  const targetRows = await db.select().from(messages).where(eq(messages.id, params.assistantMessageId)).limit(1);
  const target = targetRows[0];
  if (!target || target.role !== "assistant") throw new NotFoundError("Mensaje no encontrado.");

  const ctx = await resolveGenerationContext(target.conversationId, params.userId, params.organizationId);

  const precedingRows = await db
    .select({ id: messages.id, content: messages.content, createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.conversationId, target.conversationId))
    .orderBy(desc(messages.createdAt));
  const anchor = precedingRows.find((m) => m.createdAt < target.createdAt);
  if (!anchor) throw new AppError("No hay un mensaje de usuario previo para regenerar.", "NO_PRECEDING_MESSAGE", 409);

  yield* generateReply({
    ctx,
    userId: params.userId,
    userMessageContent: anchor.content,
    signal: params.signal,
    // target.id identifies which specific assistant message the regenerate click targeted.
    // Two regenerate clicks always target different existing rows (the original, then
    // whichever reply that produced), so this stays distinct per attempt — while a duplicate
    // call for the SAME click (e.g. an accidental double-submit) collapses onto one reservation.
    idempotencyKey: `message-generation:${target.id}`,
    excludeMessageIds: [target.id],
  });
}

export interface ResolveToolConfirmationParams {
  confirmationId: string;
  userId: string;
  organizationId?: string;
  decision: "approve" | "reject";
  signal: AbortSignal;
  /** Only meaningful when the paused tool is collect_form_input (§ capacidad forms) and
   * decision is "approve": the user's submitted field values become the tool's result
   * directly — there is nothing else to "execute", the form answers ARE the output. */
  formAnswers?: Record<string, string>;
}

/**
 * §15 human-in-the-loop resume: approves or rejects a paused tool call and continues the
 * round loop exactly where it left off, reusing the persisted generationStateSnapshot. This
 * is deliberately a SEPARATE entry point from generateReply (not something sendMessage
 * routes into) since it can be invoked long after the original HTTP request that paused —
 * a human approving an action is a genuinely separate request, potentially minutes later.
 */
export async function* resumeAfterToolConfirmation(params: ResolveToolConfirmationParams): AsyncGenerator<StreamEvent> {
  const candidate = await getConfirmationById(params.confirmationId);
  if (!candidate) throw new NotFoundError("Confirmación no encontrada.");
  await resolveGenerationContext(candidate.conversationId, params.userId, params.organizationId);

  // Atomic claim (§15 concurrency fix): a plain read-then-check-then-write here would let
  // two concurrent approve requests both observe PENDING and both execute the tool. The
  // UPDATE...WHERE status='PENDING'...RETURNING is the actual mutual-exclusion boundary —
  // only the request that gets a row back may proceed; the loser (a genuine double-click,
  // a retried request, or a race against expiry) gets a clean "already resolved" error
  // below instead of a second real execution.
  const confirmation =
    params.decision === "approve"
      ? await claimConfirmationForExecution(params.confirmationId, params.userId)
      : await claimConfirmationForRejection(params.confirmationId, params.userId);

  if (!confirmation) {
    const existing = await getConfirmationById(params.confirmationId);
    if (!existing) throw new NotFoundError("Confirmación no encontrada.");
    if (existing.userId !== params.userId) throw new ForbiddenError("No puedes resolver esta confirmación.");
    if (existing.status !== "PENDING") {
      throw new AppError("Esta confirmación ya fue resuelta.", "CONFIRMATION_ALREADY_RESOLVED", 409);
    }
    await expireSingleConfirmation(existing.id, existing.reservationId);
    throw new AppError("Esta confirmación expiró; el turno ya no puede reanudarse.", "CONFIRMATION_EXPIRED", 409);
  }

  const ctx = await resolveGenerationContext(confirmation.conversationId, params.userId, params.organizationId);
  const { conversation, tool, config, model } = ctx;
  const provider = await getToolLLMProvider(tool.id, ctx.providerKey);
  const context = { userId: params.userId, conversationId: conversation.id, toolId: tool.id };
  const call: ToolCall = { id: confirmation.toolCallId, name: confirmation.toolName, arguments: confirmation.argumentsJson };

  const allowedToolNames = resolveAllowedToolNames(config);
  const externalApiEndpoints = resolveExternalApiEndpoints(config);
  const confirmationsRequired = config.safetyPolicies?.confirmationsRequired ?? [];
  const toolSpecs = [
    ...(allowedToolNames.length > 0 ? listToolSpecsForLLM(allowedToolNames) : []),
    ...buildExternalApiToolSpecs(externalApiEndpoints),
  ];

  // confirmation.generationStateSnapshot is the in-memory row from the claim above — reading
  // it here is unaffected by the DB writes just below, which target the same row but don't
  // retroactively change this already-fetched object.
  const snapshot = confirmation.generationStateSnapshot;
  if (!snapshot) throw new Error("La confirmación reclamada no tiene un snapshot de generación (invariante violada).");
  // Defaults to [] for a snapshot written before generatedDocuments existed in this jsonb shape.
  const generatedDocuments: GeneratedDocumentDraft[] = snapshot.generatedDocuments ?? [];

  let toolResultContent: string;
  if (params.decision !== "approve") {
    toolResultContent = JSON.stringify({ error: "El usuario rechazó la ejecución de esta herramienta." });
  } else if (confirmation.toolName === "collect_form_input") {
    // The form's answers ARE the result — there is no separate execution step to run.
    toolResultContent = JSON.stringify({ success: true, output: { answers: params.formAnswers ?? {} } });
  } else {
    toolResultContent = await executeToolCallForPipeline(call, context, allowedToolNames, externalApiEndpoints, generatedDocuments);
  }

  const generationMessages: GenerationMessage[] = [
    // Round-tripped through jsonb, so the stored shape is only structurally typed — trust it,
    // since nothing but runToolRoundLoop/this module ever writes a snapshot row.
    ...(snapshot.generationMessages as GenerationMessage[]),
    { role: "tool", content: wrapToolResultForModel(toolResultContent), toolCallId: call.id },
  ];

  // Only "approve" needs a follow-up write: this request already holds the exclusive
  // EXECUTING claim, so finalizing to APPROVED here is safe unconditionally (that write also
  // clears the snapshot). "reject" was already finalized to REJECTED by the atomic claim
  // itself — there was nothing to execute — so only the now-unneeded snapshot needs clearing.
  if (params.decision === "approve") {
    await markConfirmationApproved(confirmation.id);
  } else {
    await clearConfirmationSnapshot(confirmation.id);
  }

  const startedAt = Date.now();
  try {
    const outcome = await runToolRoundLoop({
      provider,
      modelKey: model.modelKey,
      temperature: Number(config.models!.temperature),
      topP: Number(config.models!.topP),
      maxOutputTokens: config.models!.maxOutputTokens,
      signal: params.signal,
      context,
      allowedToolNames,
      externalApiEndpoints,
      confirmationsRequired,
      toolSpecs,
      generationMessages,
      round: snapshot.round,
      accumulatedUsage: snapshot.accumulatedUsage,
      accumulatedLatencyMs: snapshot.accumulatedLatencyMs,
      pendingCalls: snapshot.remainingCalls,
      generatedDocuments,
    });

    if (outcome.kind === "confirmation_required") {
      const [row] = await db
        .insert(toolCallConfirmations)
        .values({
          conversationId: conversation.id,
          userId: params.userId,
          toolId: tool.id,
          reservationId: confirmation.reservationId,
          toolCallId: outcome.call.id,
          toolName: outcome.call.name,
          argumentsJson: outcome.call.arguments,
          generationStateSnapshot: {
            generationMessages: outcome.generationMessages,
            round: outcome.round,
            accumulatedUsage: outcome.accumulatedUsage,
            accumulatedLatencyMs: outcome.accumulatedLatencyMs,
            userMessageContent: snapshot.userMessageContent,
            remainingCalls: outcome.remainingCalls,
            generatedDocuments: outcome.generatedDocuments,
          },
          expiresAt: computeConfirmationExpiry(),
        })
        .returning({ id: toolCallConfirmations.id });
      if (!row) throw new Error("No fue posible registrar la confirmación pendiente.");
      yield { type: "confirmation_required", confirmationId: row.id, toolName: outcome.call.name, arguments: outcome.call.arguments };
      return;
    }

    let fullText = "";
    let finishReason = outcome.cancelled ? "cancelled" : "stop";
    let blocked = false;
    let moderationResult: unknown = null;
    const outputModeration = config.safetyPolicies?.outputModeration ?? true;

    if (!outcome.cancelled) {
      if (outcome.finalResult) {
        fullText = outcome.finalResult.content;
        finishReason = outcome.finalResult.finishReason;
      }
      const modResult = await moderateFinalText(tool.id, fullText, outputModeration);
      blocked = modResult.blocked;
      moderationResult = modResult.moderationResult;
      if (!blocked && fullText) yield { type: "delta", text: fullText };
    }

    yield* finalizeGeneration({
      conversation,
      tool,
      model,
      config,
      providerKey: provider.key,
      userId: params.userId,
      userMessageContent: snapshot.userMessageContent,
      reservationId: confirmation.reservationId,
      cancelled: params.signal.aborted || finishReason === "cancelled",
      fullText,
      finishReason,
      usage: outcome.accumulatedUsage,
      latencyMs: outcome.accumulatedLatencyMs + (Date.now() - startedAt),
      moderationResult,
      blocked,
      generatedDocuments: outcome.generatedDocuments,
    });
  } catch (error) {
    await releaseReservation(confirmation.reservationId);
    await db.insert(messages).values({ conversationId: conversation.id, role: "assistant", content: "", status: "FAILED", finishReason: "error" });
    yield { type: "error", message: error instanceof Error ? error.message : "Error al generar la respuesta." };
  }
}
