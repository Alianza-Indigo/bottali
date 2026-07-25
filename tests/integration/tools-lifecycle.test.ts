import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { providerModels, providers, tools, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  approveVersion,
  createTool,
  ensureEditableDraftVersion,
  markVersionTesting,
  markVersionUnderReview,
  pauseTool,
  publishVersion,
  resumeTool,
  rollbackToVersion,
  suspendTool,
  updateAccessRules,
  updateBehavior,
  updateBranding,
  updateCapabilities,
  updateModels,
  updatePwaConfig,
  updateSafetyPolicies,
} from "@/lib/tools/service";
import { validateVersionForPublish } from "@/lib/tools/validation-publish";
import { activateToolForUser, resolveCatalogState } from "@/lib/tools/access";
import { runToolTest } from "@/lib/tools/test-run";
import { syncProvidersFromEnv } from "@/lib/ai/sync-providers";
import { seedDefaultLegalDocuments } from "@/lib/legal/seed-legal";

describe("tools engine lifecycle (real Postgres, fake LLM provider)", () => {
  let actorId: string;
  let fakeModelId: string;
  let toolId: string;
  const slug = `test-tool-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    await syncProvidersFromEnv(db);
    await seedDefaultLegalDocuments(db);

    const [user] = await db
      .insert(users)
      .values({
        email: `tools-lifecycle-${randomUUID()}@test.local`,
        passwordHash: await hashPassword("TestPassword!123"),
        status: "ACTIVE",
      })
      .returning({ id: users.id });
    actorId = user!.id;

    const [provider] = await db.select().from(providers).where(eq(providers.key, "llm:fake")).limit(1);
    const [model] = await db.select().from(providerModels).where(eq(providerModels.providerId, provider!.id)).limit(1);
    fakeModelId = model!.id;
  });

  afterAll(async () => {
    if (toolId) await db.delete(tools).where(eq(tools.id, toolId));
    if (actorId) await db.delete(users).where(eq(users.id, actorId));
  });

  it("creates a tool with a DRAFT version and scaffolded config", async () => {
    const result = await createTool(
      { slug, name: "Herramienta de prueba", shortName: "Prueba", description: "Una herramienta de prueba end-to-end." },
      actorId,
    );
    toolId = result.toolId;
    expect(result.versionId).toBeTruthy();
  });

  it("rejects publishing an incomplete draft", async () => {
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const versionId = tool[0]!.draftVersionId!;
    const validation = await validateVersionForPublish(versionId);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it("accepts a fully configured draft and publishes it", async () => {
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const versionId = tool[0]!.draftVersionId!;

    await updateBranding(
      versionId,
      {
        name: "Herramienta de prueba",
        shortName: "Prueba",
        description: "Una herramienta de prueba end-to-end.",
        tags: [],
        primaryColor: "#1d4ed8",
        secondaryColor: "#0f172a",
        theme: "system",
      },
      actorId,
    );
    await updateBehavior(
      versionId,
      {
        systemPrompt: "Eres un asistente de prueba.",
        language: "es",
        welcomeMessage: "Hola, soy un asistente de prueba.",
        memoryMode: "DISABLED",
        suggestedQuestions: [],
        errorMessage: "Ocurrió un error.",
        scopeNotice: "Esta herramienta es solo para pruebas automatizadas.",
        rules: [],
        allowedProfileFields: [],
        exampleExchanges: [],
      },
      actorId,
    );
    await updateModels(
      versionId,
      {
        providerId: (await db.select().from(providers).where(eq(providers.key, "llm:fake")).limit(1))[0]!.id,
        primaryModelId: fakeModelId,
        temperature: 0.7,
        topP: 1,
        maxOutputTokens: 512,
        timeoutMs: 30000,
        maxRetries: 2,
        streamingEnabled: true,
        contextTokenLimit: 8000,
        fallbackPolicy: "on_error",
        budgetMonthlyCents: 1000,
        perUserDailyMessageLimit: 50,
        perUserMonthlyTokenLimit: 200000,
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
        streaming: true,
        voiceInput: false,
        voiceOutput: false,
        files: false,
        images: false,
        forms: false,
        quickReplies: true,
        menus: false,
        memory: false,
        history: true,
        rag: false,
        exportEnabled: true,
        documentGeneration: false,
        internalTools: false,
        externalApis: false,
        notifications: false,
        evaluations: false,
        escalation: false,
        feedback: true,
        pwa: false,
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
        confirmationsRequired: [],
        allowedInternalTools: [],
        prohibitedActions: [],
      },
      actorId,
    );
    await updatePwaConfig(
      versionId,
      {
        name: "Herramienta de prueba",
        shortName: "Prueba",
        description: "Una herramienta de prueba end-to-end.",
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
    await updateBranding(
      versionId,
      {
        name: "Herramienta de prueba",
        shortName: "Prueba",
        description: "Una herramienta de prueba end-to-end.",
        tags: [],
        iconUrl: "https://example.org/icon.png",
        primaryColor: "#1d4ed8",
        secondaryColor: "#0f172a",
        theme: "system",
      },
      actorId,
    );
    await db.update(tools).set({ responsibleUserId: actorId }).where(eq(tools.id, toolId));

    const validation = await validateVersionForPublish(versionId);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);

    await markVersionTesting(versionId, actorId);
    await markVersionUnderReview(versionId, actorId);
    await approveVersion(versionId, actorId);
    await publishVersion(versionId, actorId);

    const publishedTool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    expect(publishedTool[0]!.status).toBe("PUBLISHED");
    expect(publishedTool[0]!.publishedVersionId).toBe(versionId);
  });

  it("resolves catalog state and supports activation", async () => {
    const stateBefore = await resolveCatalogState({ toolId, userId: actorId });
    expect(stateBefore).toBe("AVAILABLE");

    await activateToolForUser(toolId, actorId);
    const stateAfter = await resolveCatalogState({ toolId, userId: actorId });
    expect(stateAfter).toBe("ACTIVE");
  });

  it("runs a test message against the fake provider", async () => {
    const tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const result = await runToolTest(tool[0]!.publishedVersionId!, "Hola, ¿cómo estás?");
    expect(result.reply).toContain("fake-standard");
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  it("pauses, resumes, suspends and rolls back", async () => {
    await pauseTool(toolId, actorId, "prueba");
    let tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    expect(tool[0]!.status).toBe("PAUSED");

    await resumeTool(toolId, actorId);
    tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    expect(tool[0]!.status).toBe("PUBLISHED");

    await suspendTool(toolId, actorId, "prueba de suspensión");
    tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    expect(tool[0]!.status).toBe("SUSPENDED");

    // Rollback from SUSPENDED should fail the tool-level transition (only PUBLISHED gates rollback here);
    // resume the lifecycle to PUBLISHED first to exercise a realistic rollback.
    await pauseTool(toolId, actorId);
    await resumeTool(toolId, actorId);

    const publishedVersionId = tool[0]!.publishedVersionId!;
    const { newVersionId } = await rollbackToVersion(toolId, publishedVersionId, actorId);
    expect(newVersionId).not.toBe(publishedVersionId);

    tool = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    expect(tool[0]!.publishedVersionId).toBe(newVersionId);
    expect(tool[0]!.status).toBe("PUBLISHED");
  });

  it("creates a fresh editable draft without touching the published version", async () => {
    const before = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    const publishedVersionId = before[0]!.publishedVersionId!;

    const draftVersionId = await ensureEditableDraftVersion(toolId, actorId);
    expect(draftVersionId).not.toBe(publishedVersionId);

    const after = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);
    expect(after[0]!.publishedVersionId).toBe(publishedVersionId); // untouched
    expect(after[0]!.draftVersionId).toBe(draftVersionId);
  });
});
