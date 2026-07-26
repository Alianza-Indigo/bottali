import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { conversations, toolBehavior, toolBranding, toolCapabilities, tools } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { canUserAccessTool } from "@/lib/tools/access";
import { isVoiceEnabled } from "@/lib/ai/registry";
import { ChatPageClient } from "@/components/chat/ChatPageClient";

// Per-tool PWA installability (§18): when the published version has the "pwa" capability
// enabled, this page's own manifest link points at the dynamic per-tool manifest instead of
// the platform-wide one, so "Add to Home Screen" installs the tool as its own standalone app.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const toolRows = await db.select().from(tools).where(eq(tools.slug, slug)).limit(1);
  const tool = toolRows[0];
  if (!tool || tool.status !== "PUBLISHED" || !tool.publishedVersionId) return {};

  const [brandingRows, capabilitiesRows] = await Promise.all([
    db.select().from(toolBranding).where(eq(toolBranding.toolVersionId, tool.publishedVersionId)).limit(1),
    db.select().from(toolCapabilities).where(eq(toolCapabilities.toolVersionId, tool.publishedVersionId)).limit(1),
  ]);

  const title = brandingRows[0]?.name ?? tool.slug;
  if (!capabilitiesRows[0]?.pwa) return { title };

  return { title, manifest: `/api/v1/catalog/${tool.id}/manifest` };
}

export default async function ToolChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireCurrentUser();

  const toolRows = await db.select().from(tools).where(eq(tools.slug, slug)).limit(1);
  const tool = toolRows[0];
  if (!tool || tool.status !== "PUBLISHED" || !tool.publishedVersionId) notFound();

  const hasAccess = await canUserAccessTool(tool.id, user.id);
  if (!hasAccess) redirect(`/tools/${slug}`);

  const [branding, behavior, capabilities] = await Promise.all([
    db.select().from(toolBranding).where(eq(toolBranding.toolVersionId, tool.publishedVersionId)).limit(1),
    db.select().from(toolBehavior).where(eq(toolBehavior.toolVersionId, tool.publishedVersionId)).limit(1),
    db.select().from(toolCapabilities).where(eq(toolCapabilities.toolVersionId, tool.publishedVersionId)).limit(1),
  ]);

  const existingConversations = await db
    .select({ id: conversations.id, title: conversations.title, lastMessageAt: conversations.lastMessageAt })
    .from(conversations)
    .where(and(eq(conversations.userId, user.id), eq(conversations.toolId, tool.id), eq(conversations.status, "ACTIVE")))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(50);

  // Voice is only ever offered when BOTH the platform has a real provider configured
  // (isVoiceEnabled) AND this specific tool's version enabled it (§16: "no muestres voces
  // si el proveedor no está configurado").
  const voiceReady = isVoiceEnabled();

  return (
    <ChatPageClient
      tool={{
        id: tool.id,
        slug: tool.slug,
        name: branding[0]?.name ?? tool.slug,
        welcomeMessage: behavior[0]?.welcomeMessage ?? "",
        scopeNotice: behavior[0]?.scopeNotice ?? "",
        suggestedQuestions: behavior[0]?.suggestedQuestions ?? [],
        capabilities: {
          files: Boolean(capabilities[0]?.files),
          images: Boolean(capabilities[0]?.images),
          exportEnabled: Boolean(capabilities[0]?.exportEnabled),
          feedback: Boolean(capabilities[0]?.feedback),
          voiceInput: voiceReady && Boolean(capabilities[0]?.voiceInput),
          voiceOutput: voiceReady && Boolean(capabilities[0]?.voiceOutput),
          quickReplies: Boolean(capabilities[0]?.quickReplies),
          menus: Boolean(capabilities[0]?.menus),
          escalation: Boolean(capabilities[0]?.escalation),
          deepLinks: Boolean(capabilities[0]?.deepLinks),
        },
      }}
      initialConversations={existingConversations.map((c) => ({ id: c.id, title: c.title }))}
    />
  );
}
