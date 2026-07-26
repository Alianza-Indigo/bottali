import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providerModels, providers, tools } from "@/db/schema";
import {
  approveVersion,
  createTool,
  markVersionTesting,
  markVersionUnderReview,
  publishVersion,
  updateAccessRules,
  updateBehavior,
  updateBranding,
  updateCapabilities,
  updateModels,
  updatePwaConfig,
  updateSafetyPolicies,
} from "@/lib/tools/service";
import { syncProvidersFromEnv } from "@/lib/ai/sync-providers";
import { seedDefaultLegalDocuments } from "@/lib/legal/seed-legal";
import type { BehaviorInput } from "@/lib/validation/tools";

/** Creates a fully configured, published tool backed by the fake LLM provider — shared
 * test fixture so integration tests don't each re-implement the whole publish wizard. */
export async function createPublishedTestTool(
  actorId: string,
  overrides: Partial<Pick<BehaviorInput, "memoryMode">> & {
    rag?: boolean;
    pwa?: boolean;
    voice?: boolean;
    /** Tool names to allow-list in safetyPolicies.allowedInternalTools; also flips
     * capabilities.internalTools on when non-empty. */
    internalTools?: string[];
    /** Tool names that require human confirmation before auto-executing (§15). */
    confirmationsRequired?: string[];
    history?: boolean;
    streaming?: boolean;
    documentGeneration?: boolean;
    files?: boolean;
    images?: boolean;
    escalation?: boolean;
    notifications?: boolean;
  } = {},
): Promise<{ toolId: string; versionId: string; slug: string }> {
  await syncProvidersFromEnv(db);
  await seedDefaultLegalDocuments(db);

  const slug = `fixture-tool-${randomUUID().slice(0, 8)}`;
  const { toolId, versionId } = await createTool(
    { slug, name: "Herramienta fixture", shortName: "Fixture", description: "Herramienta de prueba." },
    actorId,
  );

  const [provider] = await db.select().from(providers).where(eq(providers.key, "llm:fake")).limit(1);
  const [model] = await db.select().from(providerModels).where(eq(providerModels.providerId, provider!.id)).limit(1);

  await updateBranding(
    versionId,
    {
      name: "Herramienta fixture",
      shortName: "Fixture",
      description: "Herramienta de prueba.",
      tags: [],
      iconUrl: "https://example.org/icon.png",
      primaryColor: "#1d4ed8",
      secondaryColor: "#0f172a",
      theme: "system",
    },
    actorId,
  );
  await updateBehavior(
    versionId,
    {
      systemPrompt: "Eres un asistente de prueba para pruebas automatizadas.",
      language: "es",
      welcomeMessage: "Hola, soy un asistente de prueba.",
      memoryMode: overrides.memoryMode ?? "DISABLED",
      suggestedQuestions: [],
      errorMessage: "Ocurrió un error.",
      scopeNotice: "Solo para pruebas automatizadas.",
      rules: [],
      allowedProfileFields: [],
      exampleExchanges: [],
    },
    actorId,
  );
  await updateModels(
    versionId,
    {
      providerId: provider!.id,
      primaryModelId: model!.id,
      temperature: 0.7,
      topP: 1,
      maxOutputTokens: 256,
      timeoutMs: 30000,
      maxRetries: 1,
      streamingEnabled: true,
      contextTokenLimit: 8000,
      fallbackPolicy: "on_error",
      budgetMonthlyCents: 100000,
      perUserDailyMessageLimit: 100,
      perUserMonthlyTokenLimit: 5000000,
      conversationLimit: 500,
      fileLimit: 20,
      storageLimitBytes: 104857600,
    },
    actorId,
  );
  await updateCapabilities(
    versionId,
    {
      text: true,
      streaming: overrides.streaming ?? true,
      voiceInput: overrides.voice ?? false,
      voiceOutput: overrides.voice ?? false,
      files: overrides.files ?? false,
      images: overrides.images ?? false,
      forms: false,
      quickReplies: true,
      menus: false,
      memory: overrides.memoryMode ? overrides.memoryMode !== "DISABLED" : false,
      history: overrides.history ?? true,
      rag: overrides.rag ?? false,
      exportEnabled: true,
      documentGeneration: overrides.documentGeneration ?? false,
      internalTools: Boolean(overrides.internalTools?.length),
      externalApis: false,
      notifications: overrides.notifications ?? false,
      evaluations: false,
      escalation: overrides.escalation ?? false,
      feedback: true,
      pwa: overrides.pwa ?? false,
      deepLinks: false,
    },
    actorId,
  );
  await updateAccessRules(
    versionId,
    { mode: "ALL_USERS", waitlistEnabled: false, gracePeriodDays: 0, allowedHours: null, allowedCountries: [] },
    actorId,
  );
  await updateSafetyPolicies(
    versionId,
    {
      riskLevel: "LOW",
      disclaimers: [],
      restrictedTopics: [],
      rejectionRules: [],
      inputModeration: true,
      outputModeration: true,
      riskSignals: [],
      confirmationsRequired: overrides.confirmationsRequired ?? [],
      allowedInternalTools: overrides.internalTools ?? [],
      prohibitedActions: [],
    },
    actorId,
  );
  await updatePwaConfig(
    versionId,
    {
      name: "Herramienta fixture",
      shortName: "Fixture",
      description: "Herramienta de prueba.",
      themeColor: "#1d4ed8",
      backgroundColor: "#ffffff",
      startUrl: `/tools/${slug}`,
      scope: "/tools/",
      display: "standalone",
      orientation: "any",
      shortcuts: [],
      screenshots: [],
      offlinePageUrl: "/offline.html",
      updatePolicy: "prompt",
      deepLinks: [],
    },
    actorId,
  );

  await db.update(tools).set({ responsibleUserId: actorId }).where(eq(tools.id, toolId));

  await markVersionTesting(versionId, actorId);
  await markVersionUnderReview(versionId, actorId);
  await approveVersion(versionId, actorId);
  await publishVersion(versionId, actorId);

  return { toolId, versionId, slug };
}
