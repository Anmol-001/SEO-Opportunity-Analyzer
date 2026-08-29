import type { Metadata } from "next";
import { ArrowRight, Clock3, FileBarChart, Plus } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { demoAssessment } from "@/lib/reports/fixture";
import {
  ASSESSMENT_HISTORY_COOKIE,
  parseAssessmentHistory,
} from "@/lib/security/assessment-history";

export const metadata: Metadata = {
  title: "Assessment history",
};
export const dynamic = "force-dynamic";

interface HistoryItem {
  id: string;
  businessName: string;
  websiteUrl: string;
  status: string;
  opportunityScore: number | null;
  createdAt: Date;
}

async function getAssessments(ids: string[]): Promise<HistoryItem[]> {
  if (!process.env.DATABASE_URL || ids.length === 0) return [];

  try {
    return await getDb().submission.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        businessName: true,
        websiteUrl: true,
        status: true,
        opportunityScore: true,
        createdAt: true,
      },
    });
  } catch {
    return [];
  }
}

export default async function HistoryPage() {
  const cookieStore = await cookies();
  const historyIds = parseAssessmentHistory(
    cookieStore.get(ASSESSMENT_HISTORY_COOKIE)?.value,
  );
  const assessments = await getAssessments(historyIds);
  const items: HistoryItem[] = [
    ...assessments,
    {
      id: demoAssessment.id,
      businessName: demoAssessment.businessName,
      websiteUrl: demoAssessment.websiteUrl,
      status: demoAssessment.status,
      opportunityScore: demoAssessment.opportunityScore,
      createdAt: demoAssessment.createdAt,
    },
  ];

  return (
    <AppShell backHref="/" backLabel="Home">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-emerald-700">Saved research</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-ink sm:text-5xl">
              Assessment history
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
              Revisit reports started in this browser or check an assessment in flight.
            </p>
          </div>
          <Button asChild>
            <Link href="/assess">
              <Plus aria-hidden="true" />
              New assessment
            </Link>
          </Button>
        </div>

        <div className="mt-9 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-48px_rgba(15,23,42,0.5)]">
          <div className="hidden grid-cols-[1.2fr_1fr_0.6fr_0.4fr_auto] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 md:grid">
            <span>Business</span>
            <span>Website</span>
            <span>Date</span>
            <span>Score</span>
            <span className="sr-only">Open</span>
          </div>
          <div className="divide-y divide-slate-100">
            {items.map((assessment) => {
              const complete = assessment.status === "complete";
              const href = complete
                ? `/assessment/${assessment.id}`
                : `/assessment/${assessment.id}/processing`;

              return (
                <Link
                  key={assessment.id}
                  href={href}
                  className="group grid gap-3 px-5 py-5 transition-colors hover:bg-emerald-50/50 md:grid-cols-[1.2fr_1fr_0.6fr_0.4fr_auto] md:items-center md:gap-4 md:px-6"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                      <FileBarChart className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-semibold text-ink">{assessment.businessName}</p>
                      {assessment.id === "demo" ? (
                        <span className="text-xs font-semibold text-emerald-700">Example report</span>
                      ) : null}
                    </div>
                  </div>
                  <p className="truncate text-sm text-slate-500">
                    {new URL(assessment.websiteUrl).hostname}
                  </p>
                  <p className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                    <Clock3 className="size-3.5 md:hidden" aria-hidden="true" />
                    {assessment.createdAt.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <div>
                    {assessment.opportunityScore !== null ? (
                      <span className="inline-grid size-10 place-items-center rounded-full bg-ink font-mono text-sm font-bold text-white">
                        {assessment.opportunityScore}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold capitalize text-amber-700">
                        {assessment.status}
                      </span>
                    )}
                  </div>
                  <ArrowRight className="hidden size-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-700 md:block" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </div>

        {!process.env.DATABASE_URL ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
            <strong>Local setup note:</strong> Connect a Neon database to persist new assessments. The example report remains available without credentials.
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
