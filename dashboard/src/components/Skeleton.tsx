import type { CSSProperties } from 'react';
import { useLanguage } from '../lib/language';

export function Skeleton({ width = '100%', height = 16, radius, style }: { width?: CSSProperties['width']; height?: CSSProperties['height']; radius?: number; style?: CSSProperties }) {
  return <span className="skeleton" aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}

/** A labelled placeholder for a page that is loading. */
export function PageSkeleton({ blocks = 3 }: { blocks?: number }) {
  const { text } = useLanguage();
  return <div className="page" role="status" aria-label={text('جاري التحميل', 'Loading')}>
    <div className="skeleton-stack"><Skeleton width={220} height={30} /><Skeleton width={340} height={16} /></div>
    {Array.from({ length: blocks }, (_, index) => <div className="skeleton-stack" key={index}>
      <Skeleton width="40%" height={20} /><Skeleton height={14} /><Skeleton width="75%" height={14} />
    </div>)}
  </div>;
}
