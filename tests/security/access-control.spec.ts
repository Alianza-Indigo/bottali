import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { test, expect, type Page } from "@playwright/test";
import { db } from "@/lib/db/client";
import { sessions, userRoles, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { getRoleIdsByKeys } from "@/lib/permissions/rbac";
import { activateToolForUser } from "@/lib/tools/access";
import { createConversation } from "@/lib/conversations/service";
import { createPublishedTestTool } from "../fixtures/tool-factory";
import { DEMO_CREDENTIALS, loginAs } from "../e2e/helpers";

/** Same double-submit-cookie requirement covered in tests/security/csrf.spec.ts — every
 * mutating request here needs the real token or it 403s before ever reaching the
 * authorization check this file is actually trying to exercise. */
async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const csrfCookie = cookies.find((c) => c.name === "crisis_csrf");
  return csrfCookie ? { "x-csrf-token": csrfCookie.value } : {};
}

/**
 * Covers the access-control categories from the spec-gap audit that weren't exercised by
 * any existing test: privilege escalation, role manipulation, revoked sessions, expired
 * tokens, and unauthorized admin content reads (§30). csrf.spec.ts/headers.spec.ts already
 * cover CSRF and header hygiene — this file is everything else in "can this identity do
 * what it's asking to do."
 */
test.describe("Control de acceso: escalamiento de privilegios y sesiones", () => {
  test("un usuario final (sin permisos administrativos) no puede leer ni mutar recursos de /admin", async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);

    const listRes = await page.request.get("/api/v1/admin/tools");
    expect(listRes.status()).toBe(403);

    const suspendRes = await page.request.post(`/api/v1/admin/users/${randomUUID()}/suspend`, { headers: await csrfHeaders(page) });
    expect(suspendRes.status()).toBe(403);
  });

  test("registrarse con un campo 'role' o 'isAdmin' inyectado en el body no otorga privilegios", async ({ page }) => {
    const email = `e2e-privesc-${randomUUID()}@test.local`;
    const res = await page.request.post("/api/v1/auth/register", {
      data: {
        email,
        password: "ValidPassword!123",
        displayName: "Intento de escalamiento",
        acceptedPrivacyPolicy: true,
        // None of these fields exist on registerSchema — Zod strips unknown keys, and the
        // route hardcodes the USER role regardless of what's sent here.
        role: "SUPER_ADMIN",
        roleKey: "SUPER_ADMIN",
        isAdmin: true,
        permissions: ["settings.manage"],
      },
    });
    expect(res.status()).toBe(201);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    expect(user).toBeTruthy();
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, user!.id));
    expect(roles).toHaveLength(1);

    await db.delete(userRoles).where(eq(userRoles.userId, user!.id));
    await db.delete(users).where(eq(users.id, user!.id));
  });

  test("revocar las sesiones de un usuario invalida de inmediato su cookie de sesión activa", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);

    expect((await page.request.get("/api/v1/me")).status()).toBe(200);

    const [demoUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_CREDENTIALS.user.email)).limit(1);
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAs(adminPage, DEMO_CREDENTIALS.superAdmin.email, DEMO_CREDENTIALS.superAdmin.password);
    const revokeRes = await adminPage.request.post(`/api/v1/admin/users/${demoUser!.id}/sessions/revoke`, {
      headers: await csrfHeaders(adminPage),
    });
    expect(revokeRes.status()).toBe(200);

    // Same browser context (same cookies) as the original login — the session row is now
    // REVOKED server-side, so the still-valid-looking cookie must no longer authenticate.
    expect((await page.request.get("/api/v1/me")).status()).toBe(401);

    await context.close();
    await adminContext.close();
  });

  test("una sesión cuyo expires_at ya pasó deja de autenticar aunque la cookie siga presente", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, DEMO_CREDENTIALS.user.email, DEMO_CREDENTIALS.user.password);
    expect((await page.request.get("/api/v1/me")).status()).toBe(200);

    const [demoUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_CREDENTIALS.user.email)).limit(1);
    // Directly backdate the real session row rather than waiting out SESSION_TTL_SECONDS —
    // same effect (getCurrentSession()'s expiresAt check), verifiable in test time.
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(sessions.userId, demoUser!.id));

    expect((await page.request.get("/api/v1/me")).status()).toBe(401);
    await context.close();
  });

  test("un rol administrativo sin 'conversations.content.read' no puede leer contenido de conversaciones (§30)", async ({ page }) => {
    await loginAs(page, DEMO_CREDENTIALS.toolAdmin.email, DEMO_CREDENTIALS.toolAdmin.password);

    // TOOL_ADMIN has neither conversations.metadata.read nor conversations.content.read —
    // both the routine listing and the exceptional content-read must be denied.
    const listRes = await page.request.get("/api/v1/admin/conversations");
    expect(listRes.status()).toBe(403);

    const contentRes = await page.request.post(`/api/v1/admin/conversations/${randomUUID()}/content`, {
      headers: await csrfHeaders(page),
      data: { reason: "Intento no autorizado de leer contenido." },
    });
    expect(contentRes.status()).toBe(403);
  });

  test("metadata.read y content.read son permisos realmente independientes: un rol con solo el primero no obtiene el segundo", async ({
    page,
  }) => {
    const email = `e2e-support-agent-${randomUUID()}@test.local`;
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash: await hashPassword("SupportAgent!123"), status: "ACTIVE", emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    const roleMap = await getRoleIdsByKeys(["SUPPORT_AGENT"]);
    await db.insert(userRoles).values({ userId: created!.id, roleId: roleMap.get("SUPPORT_AGENT")! });

    const { toolId, versionId, slug } = await createPublishedTestTool(created!.id, {});
    await activateToolForUser(toolId, created!.id);
    const conversation = await createConversation(created!.id, toolId, versionId);
    void slug;

    await loginAs(page, email, "SupportAgent!123");

    // SUPPORT_AGENT has conversations.metadata.read — this must succeed.
    const listRes = await page.request.get("/api/v1/admin/conversations");
    expect(listRes.status()).toBe(200);

    // ...but not conversations.content.read — the exceptional path must still be denied,
    // proving the two permissions are enforced independently rather than one implying the other.
    const contentRes = await page.request.post(`/api/v1/admin/conversations/${conversation.id}/content`, {
      headers: await csrfHeaders(page),
      data: { reason: "Intento de lectura de contenido sin el permiso adecuado." },
    });
    expect(contentRes.status()).toBe(403);

    await db.delete(userRoles).where(eq(userRoles.userId, created!.id));
    await db.delete(users).where(eq(users.id, created!.id));
  });
});
