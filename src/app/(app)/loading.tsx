// Shown instantly on navigation while the server loads the next page.
export default function Loading() {
  const bar = "bg-line/70 rounded-full animate-pulse";
  return (
    <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-[1.4fr_1fr] items-start" aria-busy="true" aria-label="Loading">
      {[0, 1].map((col) => (
        <div key={col} className="space-y-6">
          {[0, 1].map((i) => (
            <div key={i} className="card p-6 space-y-4">
              <div className={`${bar} h-4 w-32`} />
              <div className={`${bar} h-8 w-24`} />
              <div className={`${bar} h-3 w-full`} />
              <div className={`${bar} h-3 w-5/6`} />
              <div className={`${bar} h-3 w-2/3`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
