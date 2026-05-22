/**
 * SkeletonLoader — shimmer placeholder while content loads.
 */
import type { CSSProperties } from 'react';

interface SkeletonProps {
  width?:    string | number;
  height?:   string | number;
  rounded?:  'sm' | 'md' | 'lg' | 'full';
  className?: string;
  style?:    CSSProperties;
}

const ROUNDED = {
  sm:   'rounded-[var(--cs-radius-xs)]',
  md:   'rounded-[var(--cs-radius-sm)]',
  lg:   'rounded-[var(--cs-radius-md)]',
  full: 'rounded-full',
};

export default function Skeleton({
  width,
  height = 16,
  rounded = 'md',
  className = '',
  style,
}: SkeletonProps) {
  return (
    <div
      className={['cs-shimmer shrink-0', ROUNDED[rounded], className].join(' ')}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

/** Row of skeletons matching a stat display */
export function StatRowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <Skeleton width="40%" height={12} />
          <Skeleton width="25%" height={12} />
        </div>
      ))}
    </div>
  );
}

/** Timeline strip skeleton */
export function TimelineStripSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex items-center gap-2 px-1">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} width={72} height={52} rounded="md" />
      ))}
    </div>
  );
}

/** Scene thumbnail skeleton */
export function ThumbnailSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={['aspect-video rounded-[var(--cs-radius-lg)] overflow-hidden', className].join(' ')}>
      <div className="w-full h-full cs-shimmer" />
    </div>
  );
}
