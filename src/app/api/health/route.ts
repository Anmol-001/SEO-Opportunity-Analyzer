import { NextResponse } from "next/server";

import { runtimeReadiness } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = runtimeReadiness();

  return NextResponse.json(
    {
      status: readiness.readyForCurrentMode ? "ready" : "configuration_required",
      timestamp: new Date().toISOString(),
      ...readiness,
    },
    {
      status: readiness.readyForCurrentMode ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
