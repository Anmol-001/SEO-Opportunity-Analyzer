import Link from "next/link";

export function BrandMark() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 rounded-lg font-semibold tracking-[-0.02em] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Searchlight home"
    >
      <span className="relative grid size-9 place-items-center overflow-hidden rounded-xl bg-ink shadow-sm">
        <span className="size-3.5 rounded-full border-[3px] border-emerald-300" />
        <span className="absolute bottom-1 right-1 h-2.5 w-[3px] rotate-[-45deg] rounded-full bg-emerald-300" />
      </span>
      <span className="text-[1.05rem]">Searchlight</span>
    </Link>
  );
}
