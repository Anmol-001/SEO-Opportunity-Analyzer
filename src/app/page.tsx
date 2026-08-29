import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  FileSearch,
  Radar,
  Sparkles,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

const analysisLenses = [
  {
    icon: FileSearch,
    label: "Website evidence",
    value: "Content, structure & relevance",
  },
  {
    icon: Radar,
    label: "Search landscape",
    value: "Rankings, intent & SERP features",
  },
  {
    icon: BarChart3,
    label: "Competitive gaps",
    value: "Where other sites are winning",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <BrandMark />
        <nav className="flex items-center gap-2" aria-label="Primary navigation">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/history">Past assessments</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/assess">
              Start analysis
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </nav>
      </header>

      <section className="relative mx-auto grid w-full max-w-7xl gap-14 px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-24">
        <div className="relative z-10 max-w-3xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Evidence-led SEO research
          </div>
          <h1 className="text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-ink sm:text-6xl lg:text-7xl">
            Discover where your website can win in search.
          </h1>
          <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
            Turn your website, real search results, and competitor patterns into a
            prioritized plan—grounded in evidence, not generic SEO advice.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="group sm:min-w-52">
              <Link href="/assess">
                Analyze my website
                <ArrowRight
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/assessment/demo">View example report</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {[
              "No account required",
              "Real search evidence",
              "Actionable 90-day plan",
            ].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <span className="grid size-5 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                  <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                </span>
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative lg:pl-8">
          <div className="absolute -left-16 -top-20 size-72 rounded-full bg-emerald-100/60 blur-3xl" />
          <div className="report-preview relative rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.32)] sm:p-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-5">
              <div>
                <p className="eyebrow">Opportunity snapshot</p>
                <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-ink">
                  Northstar Dental
                </h2>
                <p className="mt-1 text-sm text-slate-500">Dental implants · Noida</p>
              </div>
              <div className="relative grid size-20 place-items-center rounded-full border-[7px] border-emerald-100">
                <span className="text-2xl font-bold tracking-tight text-ink">72</span>
                <span className="absolute -bottom-6 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Score
                </span>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              {analysisLenses.map((item, index) => (
                <div
                  key={item.label}
                  className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
                    <item.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{item.label}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{item.value}</p>
                  </div>
                  <span className="font-mono text-xs font-semibold text-emerald-700">
                    0{index + 1}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl bg-ink p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                Highest-leverage move
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                Build a dedicated service + location page using the patterns found
                across four recurring competitors.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200/80 bg-white/70">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-8 text-sm text-slate-600 sm:grid-cols-3 sm:px-8 lg:px-10">
          <p>
            <strong className="block text-ink">Facts stay factual.</strong>
            Rankings and volumes come from connected data providers.
          </p>
          <p>
            <strong className="block text-ink">Scores stay explainable.</strong>
            Opportunity scores are calculated before AI synthesis.
          </p>
          <p>
            <strong className="block text-ink">Advice stays traceable.</strong>
            Every recommendation points back to specific evidence.
          </p>
        </div>
      </section>
    </main>
  );
}
