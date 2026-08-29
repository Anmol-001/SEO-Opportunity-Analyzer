import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";

import { getDb } from "@/lib/db";

export const maxDuration = 60;

function validToken(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  if (process.env.ENABLE_INFRA_SMOKE !== "true") {
    return NextResponse.json({ error: "Smoke test is disabled." }, { status: 404 });
  }

  if (!validToken(request.headers.get("x-smoke-token"), process.env.SMOKE_TEST_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const db = getDb();
  const probe = await db.infrastructureProbe.create({
    data: { note: "Queued by the Vercel after() infrastructure smoke test." },
  });

  after(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      await db.infrastructureProbe.update({
        where: { id: probe.id },
        data: {
          status: "complete",
          completedAt: new Date(),
          note: "Background execution completed and persisted after 10 seconds.",
        },
      });
    } catch {
      await db.infrastructureProbe
        .update({
          where: { id: probe.id },
          data: { status: "failed", note: "Background persistence failed." },
        })
        .catch(() => undefined);
    }
  });

  return NextResponse.json(
    { probeId: probe.id, status: probe.status, verifyAfterSeconds: 12 },
    { status: 202 },
  );
}

export async function GET(request: Request) {
  if (process.env.ENABLE_INFRA_SMOKE !== "true") {
    return NextResponse.json({ error: "Smoke test is disabled." }, { status: 404 });
  }

  if (!validToken(request.headers.get("x-smoke-token"), process.env.SMOKE_TEST_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const probeId = url.searchParams.get("id");
  if (!probeId) {
    return NextResponse.json({ error: "Provide a probe id." }, { status: 400 });
  }

  const probe = await getDb().infrastructureProbe.findUnique({ where: { id: probeId } });
  return probe
    ? NextResponse.json(probe)
    : NextResponse.json({ error: "Probe not found." }, { status: 404 });
}
