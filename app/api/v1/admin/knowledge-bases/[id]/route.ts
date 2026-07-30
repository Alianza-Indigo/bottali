import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { knowledgeBases, knowledgeDocuments } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { disableKnowledgeBase, deleteKnowledgeBase } from "@/lib/knowledge/service";
import { handleApiError } from "@/lib/validation/http";
import { NotFoundError } from "@/lib/utils/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("knowledge.read");
    const { id } = await params;
    const rows = await db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, id), eq(knowledgeBases.organizationId, user.organizationId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundError("Base de conocimiento no encontrada.");
    const documents = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.knowledgeBaseId, id));
    return NextResponse.json({ knowledgeBase: rows[0], documents });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("knowledge.manage");
    const { id } = await params;
    await disableKnowledgeBase(id, user.id, user.organizationId);
    return NextResponse.json({ message: "Base de conocimiento deshabilitada." });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("knowledge.manage");
    const { id } = await params;
    await deleteKnowledgeBase(id, user.id, user.organizationId);
    return NextResponse.json({ message: "Base de conocimiento eliminada." });
  } catch (error) {
    return handleApiError(error);
  }
}
