import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base text-ink shadow-sm transition-[border-color,box-shadow] placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
