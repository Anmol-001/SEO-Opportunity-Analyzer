import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export function AppShell({
  children,
  backHref,
  backLabel = "Back",
}: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <BrandMark />
          <div className="flex items-center gap-2">
            {backHref ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={backHref}>
                  <ArrowLeft aria-hidden="true" />
                  {backLabel}
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/history">Past assessments</Link>
            </Button>
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}
