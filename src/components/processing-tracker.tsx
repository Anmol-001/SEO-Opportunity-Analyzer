"use client";

import { AlertTriangle, Check, Circle, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  pipelineStages,
  stageIndex,
  type PipelineStatus,
} from "@/lib/pipeline/states";

interface AssessmentState {
  businessName: string;
  websiteUrl: string;
  status: PipelineStatus;
  progressMessage: string | null;
  failureReason: string | null;
}

export function ProcessingTracker({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<AssessmentState | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      try {
        const response = await fetch(`/api/assessments/${assessmentId}`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not read assessment status.");
        if (!active) return;

        setAssessment(result);
        setPollError(null);

        if (result.status === "complete") {
          router.replace(`/assessment/${assessmentId}`);
          return;
        }

        if (result.status !== "failed") {
          timeout = setTimeout(refresh, 1_250);
        }
      } catch (error) {
        if (!active) return;
        setPollError(error instanceof Error ? error.message : "Status check failed.");
        timeout = setTimeout(refresh, 2_500);
      }
    }

    void refresh();
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [assessmentId, router]);

  const currentIndex = assessment ? stageIndex(assessment.status) : 0;
  const failed = assessment?.status === "failed";

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-18">
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
          {failed ? (
            <AlertTriangle className="size-6" aria-hidden="true" />
          ) : (
            <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
          )}
        </span>
        <p className="eyebrow mt-6 text-emerald-700">Assessment in progress</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
          {assessment?.businessName
            ? `Researching ${assessment.businessName}`
            : "Building your search opportunity report"}
        </h1>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-muted-foreground" aria-live="polite">
          {failed
            ? assessment?.failureReason ?? "The assessment could not be completed."
            : assessment?.progressMessage ??
              pollError ??
              "Connecting to the assessment pipeline…"}
        </p>
      </div>

      <div className="mt-10 overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)] sm:p-8">
        <ol className="space-y-1">
          {pipelineStages.map((stage, index) => {
            const complete = !failed && index < currentIndex;
            const current = !failed && index === currentIndex;
            const Icon = complete ? Check : current ? LoaderCircle : Circle;

            return (
              <li
                key={stage.status}
                className={`flex gap-4 rounded-2xl px-3 py-3.5 ${
                  current ? "bg-emerald-50" : ""
                }`}
              >
                <span
                  className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${
                    complete
                      ? "bg-emerald-700 text-white"
                      : current
                        ? "bg-emerald-100 text-emerald-800"
                        : "text-slate-300"
                  }`}
                >
                  <Icon
                    className={`size-4 ${current ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                </span>
                <div>
                  <p className={`text-sm font-semibold ${current || complete ? "text-ink" : "text-slate-400"}`}>
                    {stage.label}
                  </p>
                  {current ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500">{stage.description}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        {failed ? (
          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/assess">Start a new assessment</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/assessment/demo">View example report</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
