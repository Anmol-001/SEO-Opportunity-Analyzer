import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ProcessingTracker } from "@/components/processing-tracker";

export const metadata: Metadata = {
  title: "Researching your search opportunities",
};

export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell>
      <ProcessingTracker assessmentId={id} />
    </AppShell>
  );
}
