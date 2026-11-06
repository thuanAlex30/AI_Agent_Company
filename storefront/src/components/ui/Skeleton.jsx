// components/ui/Skeleton.jsx — B4 Skeleton shimmer bang transform (khong dung width/height/left/top)
// Shimmer chay 1.4s, dung khi du lieu ve.
import React from 'react';

export function Skeleton({ w = '100%', h = 16, r = 8, className = '', style, ...rest }) {
  return (
    <div
      className={'ui-skel ' + className}
      style={{ width: w, height: h, borderRadius: r, ...(style || {}) }}
      aria-hidden="true"
      {...rest}
    />
  );
}

export default Skeleton;

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={'ui-skel-text ' + className} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} h={12} w={i === lines - 1 ? '60%' : '100%'} style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="ui-card" aria-hidden="true">
      <Skeleton h={160} r={12} />
      <Skeleton h={14} style={{ marginTop: 12 }} />
      <Skeleton h={12} w="45%" style={{ marginTop: 8 }} />
    </div>
  );
}
