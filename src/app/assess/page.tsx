import type { Metadata } from "next";
import { BarChart3, FileSearch, Radar } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AssessmentForm } from "@/components/assessment-form";

export const metadata: Metadata = {
  title: "Start an assessment",
  description: "Tell Searchlight what business, website, and search market to analyze.",
};

const researchSteps = [
  { icon: FileSearch, text: "Analyze a focused sample of your public website" },
  { icon: Radar, text: "Research rankings, intent, and recurring competitors" },
  { icon: BarChart3, text: "Prioritize opportunities with traceable evidence" },
];

export default function AssessPage() {
  return (
    <AppShell backHref="/" backLabel="Home">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[0.7fr_1.3fr] lg:px-10">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <p className="eyebrow text-emerald-700">New assessment</p>
          <h1 className="mt-3 max-w-md text-4xl font-semibold leading-tight tracking-[-0.045em] text-ink sm:text-5xl">
            Give us the business context behind the search.
          </h1>
          <p className="mt-5 max-w-md leading-7 text-muted-foreground">
            Better inputs produce a tighter query set and more useful competitor
            comparisons. Target keywords are helpful, but not required.
          </p>
          <div className="mt-8 space-y-4">
            {researchSteps.map((step) => (
              <div key={step.text} className="flex items-start gap-3 text-sm text-slate-600">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                  <step.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="pt-2 leading-5">{step.text}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.4)] sm:p-8 lg:p-10">
          <div className="mb-8 border-b border-slate-100 pb-6">
            <h2 className="text-xl font-semibold tracking-tight text-ink">Business details</h2>
            <p className="mt-1.5 text-sm text-slate-500">All fields are required unless marked optional.</p>
          </div>
          <AssessmentForm />
        </section>
      </div>
    </AppShell>
  );
}
