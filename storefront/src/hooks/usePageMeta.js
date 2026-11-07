// hooks/usePageMeta.js — B1/B4 SEO: <title> + meta description + OG theo tung route
import { useEffect } from 'react';

const SITE = 'BizOps AI';

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * @param {string} title
 * @param {string} description
 */
export default function usePageMeta(title, description = '') {
  useEffect(() => {
    const full = title ? `${title} · ${SITE}` : SITE;
    document.title = full;
    if (description) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:title', full);
      setMeta('property', 'og:description', description);
      setMeta('property', 'og:type', 'website');
    }
  }, [title, description]);
}
