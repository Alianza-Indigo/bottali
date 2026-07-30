import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getToolTTSProvider, getToolVoiceAvailability } from "@/lib/tools/provider-credentials";
import { requireToolRuntimeCapability } from "@/lib/tools/runtime-access";
import { handleApiError } from "@/lib/validation/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsedToolId = z.string().uuid().safeParse(new URL(request.url).searchParams.get("toolId"));
    if (!parsedToolId.success) return NextResponse.json({ voices: [] });

    await requireToolRuntimeCapability(parsedToolId.data, user.id, "voiceOutput");
    const availability = await getToolVoiceAvailability(parsedToolId.data);
    if (!availability.output) return NextResponse.json({ voices: [] });

    const provider = await getToolTTSProvider(parsedToolId.data);
    const voices = await provider.listVoices();
    return NextResponse.json({ voices });
  } catch (error) {
    return handleApiError(error);
  }
}
