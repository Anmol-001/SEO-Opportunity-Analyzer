import { NextResponse } from "next/server";

import { runtimeReadiness } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = runtimeReadiness();

  return NextResponse.json(
    {
      status: readiness.readyForFixture ? "ready" : "configuration_required",
      timestamp: new Date().toISOString(),
      ...readiness,
    },
    { status: readiness.readyForFixture ? 200 : 503 },
  );
}
