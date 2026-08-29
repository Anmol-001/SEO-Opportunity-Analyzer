"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { assessmentInputSchema } from "@/lib/validation/assessment";

type FieldName =
  | "businessName"
  | "websiteUrl"
  | "industry"
  | "location"
  | "primaryService"
  | "mainGoal"
  | "targetKeywords";

type FieldErrors = Partial<Record<FieldName, string[]>>;

function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: FieldName;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={name}>{label}</Label>
        {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AssessmentForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const candidate = Object.fromEntries(formData.entries());
    const parsed = assessmentInputSchema.safeParse(candidate);

    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as FieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();

      if (!response.ok) {
        setFieldErrors((result.fieldErrors ?? {}) as FieldErrors);
        setFormError(
          result.error ?? "The assessment could not be started. Please try again.",
        );
        return;
      }

      router.push(result.processingUrl);
    } catch {
      setFormError("The server could not be reached. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          name="businessName"
          label="Business name"
          error={fieldErrors.businessName?.[0]}
        >
          <Input
            id="businessName"
            name="businessName"
            placeholder="Northstar Dental"
            autoComplete="organization"
            aria-describedby={fieldErrors.businessName ? "businessName-error" : undefined}
          />
        </Field>
        <Field
          name="websiteUrl"
          label="Website"
          error={fieldErrors.websiteUrl?.[0]}
        >
          <Input
            id="websiteUrl"
            name="websiteUrl"
            type="url"
            placeholder="yourwebsite.com"
            autoComplete="url"
            aria-describedby={fieldErrors.websiteUrl ? "websiteUrl-error" : undefined}
          />
        </Field>
        <Field name="industry" label="Industry" error={fieldErrors.industry?.[0]}>
          <Input
            id="industry"
            name="industry"
            placeholder="Dental care"
            aria-describedby={fieldErrors.industry ? "industry-error" : undefined}
          />
        </Field>
        <Field name="location" label="Target location" error={fieldErrors.location?.[0]}>
          <Input
            id="location"
            name="location"
            placeholder="Noida, India"
            autoComplete="address-level2"
            aria-describedby={fieldErrors.location ? "location-error" : undefined}
          />
        </Field>
      </div>

      <Field
        name="primaryService"
        label="Primary service or product"
        error={fieldErrors.primaryService?.[0]}
      >
        <Input
          id="primaryService"
          name="primaryService"
          placeholder="Dental implants"
          aria-describedby={fieldErrors.primaryService ? "primaryService-error" : undefined}
        />
      </Field>

      <Field name="mainGoal" label="Main business or marketing goal" error={fieldErrors.mainGoal?.[0]}>
        <Textarea
          id="mainGoal"
          name="mainGoal"
          placeholder="Increase qualified consultation enquiries for our implant service."
          aria-describedby={fieldErrors.mainGoal ? "mainGoal-error" : undefined}
        />
      </Field>

      <Field
        name="targetKeywords"
        label="Target keywords"
        hint="Optional · up to 8"
        error={fieldErrors.targetKeywords?.[0]}
      >
        <Textarea
          id="targetKeywords"
          name="targetKeywords"
          className="min-h-20"
          placeholder="dental implants noida, dental implant cost noida"
          aria-describedby={fieldErrors.targetKeywords ? "targetKeywords-error" : undefined}
        />
      </Field>

      {formError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {formError}{" "}
          <Link href="/assessment/demo" className="font-semibold underline underline-offset-2">
            View the example report instead.
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-sm text-xs leading-5 text-slate-500">
          We analyze a focused sample of public pages. This is research and
          decision support, not an SEO guarantee.
        </p>
        <Button type="submit" size="lg" disabled={isSubmitting} className="sm:min-w-52">
          {isSubmitting ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Starting analysis
            </>
          ) : (
            <>
              Start assessment
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
