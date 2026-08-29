import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ReportView } from "@/components/report-view";
import { getDb } from "@/lib/db";
import { demoAssessment, demoReport } from "@/lib/reports/fixture";
import type { OpportunityReport } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: id === "demo" ? "Example SEO opportunity report" : "SEO opportunity report",
    description: "Evidence-backed website, search, competitor, and keyword opportunities.",
    openGraph: {
      title: id === "demo" ? "Example SEO opportunity report" : "SEO opportunity report",
      description: "Evidence-backed website, search, competitor, and keyword opportunities.",
      images: [],
    },
    twitter: {
      title: id === "demo" ? "Example SEO opportunity report" : "SEO opportunity report",
      description: "Evidence-backed website, search, competitor, and keyword opportunities.",
      images: [],
    },
  };
}

export default async function AssessmentReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (id === "demo") {
    return (
      <AppShell backHref="/" backLabel="Home">
        <ReportView
          businessName={demoAssessment.businessName}
          websiteUrl={demoAssessment.websiteUrl}
          primaryService={demoAssessment.primaryService}
          location={demoAssessment.location}
          score={demoAssessment.opportunityScore}
          report={demoReport}
        />
      </AppShell>
    );
  }

  if (!process.env.DATABASE_URL) notFound();

  const assessment = await getDb().submission.findUnique({
    where: { id },
    include: { report: true },
  });

  if (!assessment) notFound();
  if (assessment.status !== "complete" || !assessment.report) {
    redirect(`/assessment/${id}/processing`);
  }

  return (
    <AppShell backHref="/history" backLabel="History">
      <ReportView
        businessName={assessment.businessName}
        websiteUrl={assessment.websiteUrl}
        primaryService={assessment.primaryService}
        location={assessment.location}
        score={assessment.report.opportunityScore}
        report={assessment.report.payload as unknown as OpportunityReport}
      />
    </AppShell>
  );
}
