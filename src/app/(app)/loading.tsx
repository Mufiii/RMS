/** Shown while a page's data loads: the same frame as the real page, so nothing jumps. */
export default function Loading() {
  const bar = "animate-pulse rounded-md bg-foreground/8";
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="-mx-4 mb-5 flex min-h-[4.5rem] items-center justify-between border-b bg-card px-4 md:-mx-8 md:mb-6 md:px-8">
        <div className={`${bar} h-6 w-40`} />
        <div className={`${bar} h-10 w-32 rounded-lg`} />
      </div>
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/8">
              <div className={`${bar} size-11 rounded-xl`} />
              <div className="grid flex-1 gap-2">
                <div className={`${bar} h-3.5 w-24`} />
                <div className={`${bar} h-7 w-20`} />
              </div>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8">
          <div className="border-b px-5 py-4">
            <div className={`${bar} h-10 w-full max-w-md rounded-lg`} />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b px-5 py-4 last:border-0">
              <div className={`${bar} size-9 rounded-full`} />
              <div className={`${bar} h-4 flex-1`} />
              <div className={`${bar} h-4 w-24`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
