import { NextResponse } from "next/server";

// Liveness: only confirms the process can respond. No dependency checks, no secrets.
export async function GET() {
  return NextResponse.json({ status: "ok", checkedAt: new Date().toISOString() });
}
