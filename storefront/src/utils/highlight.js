// utils/highlight.js — To dam tu khoa bang TEXT NODE (KHONG dung innerHTML — tranh XSS)
// Chi tra ve mang phan tu React; key la chi so de tranh trung key.
import React from 'react';

export default function highlight(text, query) {
  const src = String(text || '');
  const q = String(query || '').trim();
  if (!q) return src;

  const lower = src.toLowerCase();
  const lq = q.toLowerCase();
  const parts = [];
  let i = 0;
  let idx = lower.indexOf(lq);
  let n = 0;

  while (idx !== -1 && n < 50) {
    if (idx > i) parts.push(src.slice(i, idx));
    parts.push(React.createElement('mark', { key: n }, src.slice(idx, idx + q.length)));
    i = idx + q.length;
    idx = lower.indexOf(lq, i);
    n++;
  }
  if (i < src.length) parts.push(src.slice(i));
  return parts;
}
