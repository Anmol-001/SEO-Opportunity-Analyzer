import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <AppShell>
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <p className="eyebrow text-emerald-700">Not found</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-ink">
          That assessment is not available.
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          It may not exist, or the local database may not be connected yet.
        </p>
        <div className="mt-7 flex gap-3">
          <Button asChild>
            <Link href="/assessment/demo">View example report</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Return home</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
