import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Storefront build config — performance-first (spec §7.1/§7.2).
 *
 * 1. INLINE TOAN BO CSS vao <head> (build hook `generateBundle`).
 *    Ly do (do duoc bang Lighthouse, khong phai phong doan):
 *      - CSS bat dong bo -> trinh duyet phai style+layout 2 LAN (shell roi lai
 *        full CSS) -> "Style & Layout" nhay tu 315ms len 1125ms.
 *      - CSS inline -> chi 1 lan layout, va shell giong HET React ve kich thuoc
 *        (truoc day shell H1 = 32px, React H1 = 24px -> repaint -> Chrome GHI
 *        LAI LCP o thoi diem muon ~2.9s thay vi lan paint dau).
 *    Chi can 6.6 kB gzip -> nhanh hon 1 vong tranh tai rieng (RTT 150ms + doc
 *    tai tren Slow 4G).
 *
 * 2. @font-face INLINE trong <head> -> trinh duyet biet truoc webfont bao gio,
 *    kem fallback metric-compatible (BVP Fallback: size-adjust) -> khi webfont
 *    swap xong advance width giong het -> KHONG layout shift -> LCP chi ghi 1 lan.
 */

function inlineFontFaces() {
  const fontFile = path.resolve(__dirname, 'src/styles/fonts.css');
  return {
    name: 'storefront:inline-font-faces',
    enforce: 'pre',
    transformIndexHtml(html) {
      if (!fs.existsSync(fontFile)) return html;
      const css = fs.readFileSync(fontFile, 'utf8');
      const faces = [];
      const re = /@font-face\s*\{[^}]*\}/g;
      let m;
      while ((m = re.exec(css))) {
        faces.push(m[0].replace(/\/\*[\s\S]*?\*\//g, ''));
      }
      if (!faces.length) return html;
      const block =
        '<style id="bvp-font-faces">\n' +
        faces.join('\n') +
        '\n</style>';
      return html.replace('</head>', block + '\n</head>');
    },
  };
}

function inlineCss() {
  return {
    name: 'storefront:inline-css',
    enforce: 'post',
    generateBundle(_options, bundle) {
      // Gop tat ca CSS thanh mot file (cssCodeSplit: false nen chi co 1 file).
      const cssFile = Object.keys(bundle).find((f) => f.endsWith('.css'));
      const htmlFile = Object.keys(bundle).find((f) => f.endsWith('index.html'));
      if (!cssFile || !htmlFile) return;
      const css = bundle[cssFile].source.toString();
      const html = bundle[htmlFile].source.toString();
      const inline = '<style id="bvp-app-css">\n' + css + '\n</style>';
      const next = html.replace(
        /<link rel="stylesheet" crossorigin href="[^"]+">/g,
        inline
      );
      if (next === html) return;
      bundle[htmlFile].source = next;
      delete bundle[cssFile];
    },
  };
}

export default defineConfig({
  plugins: [inlineFontFaces(), react(), inlineCss()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Gom phan React runtime dung chung vao mot chunk de moi route chi tai them.
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/react-router')) return 'vendor-router';
          return undefined;
        },
      },
    },
  },
});
