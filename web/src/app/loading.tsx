// Skeleton shown while a server page loads its data.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-72 rounded-[8px] bg-raised" />
      <div className="h-4 w-[min(560px,90%)] rounded bg-raised" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-36 rounded-[14px] bg-surface" />)}</div>
      <div className="h-64 rounded-[14px] bg-surface" />
    </div>
  );
}
