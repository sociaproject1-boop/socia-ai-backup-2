interface Props {
  className?: string;
  rounded?: string;
}

export function Skeleton({ className = "", rounded = "rounded-2xl" }: Props) {
  return (
    <div
      className={`shimmer ${rounded} ${className}`}
      style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
    />
  );
}

export function FeedSkeleton() {
  const cells = [
    { ar: "3/4" }, { ar: "9/13" }, { ar: "1/1" }, { ar: "9/13" }, { ar: "3/4" }, { ar: "9/13" },
  ];
  return (
    <div className="columns-2 gap-3">
      {cells.map((c, i) => (
        <div key={i} className="break-inside-avoid mb-3">
          <Skeleton className="w-full" rounded="rounded-3xl" />
          <div style={{ aspectRatio: c.ar }} />
        </div>
      ))}
    </div>
  );
}

export function ChatRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-12 w-12" rounded="rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/2" rounded="rounded-md" />
        <Skeleton className="h-3 w-3/4" rounded="rounded-md" />
      </div>
    </div>
  );
}
