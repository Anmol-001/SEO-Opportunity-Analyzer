import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleGauge,
  ExternalLink,
  Flag,
  Search,
  Target,
} from "lucide-react";

import type { OpportunityReport } from "@/lib/reports/types";

const priorityStyles = {
  high: "bg-red-50 text-red-700 border-red-100",
  medium: "bg-amber-50 text-amber-700 border-amber-100",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

export function ReportView({
  businessName,
  websiteUrl,
  primaryService,
  location,
  score,
  report,
}: {
  businessName: string;
  websiteUrl: string;
  primaryService: string;
  location: string;
  score: number;
  report: OpportunityReport;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12 lg:px-10">
      <section className="rounded-3xl bg-ink p-6 text-white shadow-[0_28px_70px_-45px_rgba(15,23,42,0.65)] sm:p-9 lg:grid lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
            SEO opportunity report
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
            {businessName}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-300">
            <span>{primaryService}</span>
            <span aria-hidden="true">·</span>
            <span>{location}</span>
            <span aria-hidden="true">·</span>
            <a
              href={websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-white"
            >
              {new URL(websiteUrl).hostname}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className="mt-8 flex items-center gap-4 lg:mt-0">
          <div className="grid size-24 place-items-center rounded-full border-[8px] border-emerald-300/25 bg-white/5">
            <span className="text-4xl font-bold tracking-tight">{score}</span>
          </div>
          <div className="max-w-32">
            <p className="text-sm font-semibold">SEO Opportunity Score</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Deterministic, evidence-weighted</p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <p className="eyebrow text-emerald-700">Executive summary</p>
          <p className="mt-4 text-xl font-medium leading-8 tracking-[-0.015em] text-ink">
            {report.executiveSummary.overallAssessment}
          </p>
          <p className="mt-4 leading-7 text-slate-600">
            {report.executiveSummary.businessImplication}
          </p>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
          <CircleGauge className="size-6 text-emerald-700" aria-hidden="true" />
          <h2 className="mt-4 font-semibold text-ink">Evidence coverage</h2>
          <div className="mt-5 space-y-3 text-sm">
            {Object.entries(report.dataAvailability)
              .filter(([key]) => key !== "notes")
              .map(([key, available]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="capitalize text-slate-600">{key.replace(/([A-Z])/g, " $1")}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    {available ? "Available" : "Unavailable"}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          icon={Search}
          eyebrow="What we found"
          title="Website & search findings"
          description="Direct observations are separated from their likely business impact."
        />
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {report.websiteFindings.map((finding) => (
            <article key={finding.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-xs font-bold text-emerald-700">{finding.id}</span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${priorityStyles[finding.severity]}`}>
                  {finding.severity}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink">{finding.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{finding.evidence}</p>
              <div className="mt-4 border-l-2 border-emerald-300 pl-3 text-sm leading-6 text-slate-700">
                <strong className="text-ink">Why it matters:</strong> {finding.impact}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading
          icon={BarChart3}
          eyebrow="Search visibility"
          title="Keyword opportunities"
          description="Existing opportunities build on current visibility; potential opportunities fill a proven gap."
        />
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-bold">Keyword</th>
                  <th className="px-5 py-4 font-bold">Volume</th>
                  <th className="px-5 py-4 font-bold">Rank</th>
                  <th className="px-5 py-4 font-bold">Type</th>
                  <th className="px-5 py-4 font-bold">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.keywordOpportunities.map((keyword) => (
                  <tr key={keyword.keyword} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-ink">{keyword.keyword}</p>
                      <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{keyword.rationale}</p>
                    </td>
                    <td className="px-5 py-4 font-mono text-slate-700">
                      {keyword.searchVolume?.toLocaleString("en-IN") ?? "Unavailable"}
                    </td>
                    <td className="px-5 py-4 font-mono text-slate-700">
                      {keyword.rankingPosition ? `#${keyword.rankingPosition}` : "Not found"}
                    </td>
                    <td className="px-5 py-4 capitalize text-slate-700">{keyword.opportunityType}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${priorityStyles[keyword.priority]}`}>
                        {keyword.priority}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Paid competition signals, when available, are advertising data and are not presented as SEO difficulty.
        </p>
      </section>

      <section className="mt-12">
        <SectionHeading
          icon={Target}
          eyebrow="Priority actions"
          title="Recommendations tied to evidence"
          description="Each action points back to the findings that justify it."
        />
        <div className="mt-5 space-y-4">
          {report.recommendations.map((recommendation, index) => (
            <article key={recommendation.id} className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-[auto_1fr_auto] sm:items-start">
              <span className="grid size-10 place-items-center rounded-xl bg-ink font-mono text-sm font-bold text-white">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-700">{recommendation.id}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${priorityStyles[recommendation.priority]}`}>
                    {recommendation.priority}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold leading-6 text-ink">{recommendation.action}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{recommendation.impact}</p>
                <p className="mt-3 text-xs text-slate-500">
                  Evidence: {recommendation.evidenceRefs.join(" · ")}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Effort</p>
                <p className="mt-0.5 text-sm font-semibold capitalize text-ink">{recommendation.effort}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading
          icon={Flag}
          eyebrow="Execution roadmap"
          title="Your 30 / 60 / 90-day plan"
          description="Sequence the work so early improvements support later expansion."
        />
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {[
            ["30 days", report.nextSteps.days30],
            ["60 days", report.nextSteps.days60],
            ["90 days", report.nextSteps.days90],
          ].map(([label, steps], columnIndex) => (
            <article key={label as string} className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="font-mono text-xs font-bold text-emerald-700">0{columnIndex + 1}</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">{label as string}</h3>
              <ul className="mt-5 space-y-4">
                {(steps as string[]).map((step) => (
                  <li key={step} className="flex gap-3 text-sm leading-6 text-slate-600">
                    <ArrowRight className="mt-1 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    {step}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
        <strong>Data note:</strong> {report.dataAvailability.notes.join(" ")}
      </div>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: typeof Search;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <p className="eyebrow text-emerald-700">{eyebrow}</p>
        <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}
