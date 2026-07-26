import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getTTSProvider, isVoiceEnabled } from "@/lib/ai/registry";
import { handleApiError } from "@/lib/validation/http";

/** §16: never list voices when voice isn't actually configured — an empty, honest list
 * rather than a UI that offers a feature the platform can't deliver. */
export async function GET() {
  try {
    await requireCurrentUser();
    if (!isVoiceEnabled()) {
      return NextResponse.json({ voices: [] });
    }
    const voices = await getTTSProvider().listVoices();
    return NextResponse.json({ voices });
  } catch (error) {
    return handleApiError(error);
  }
}
