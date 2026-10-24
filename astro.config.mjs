// @ts-check
import { defineConfig } from 'astro/config';
import expressiveCode from 'astro-expressive-code';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import pagefind from 'astro-pagefind';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages: SITE_URL=https://<user>.github.io BASE_PATH=/<repo> (set in the deploy workflow).
// Locally both fall back to a root deployment.
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [
    // Must come before mdx() so it handles fenced code blocks in lessons.
    expressiveCode({
      themes: ['github-dark-default', 'github-light-default'],
      themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
      useDarkModeMediaQuery: false,
      defaultProps: { wrap: false },
      styleOverrides: {
        borderRadius: '0.5rem',
        codeFontFamily: 'var(--font-mono)',
        uiFontFamily: 'var(--font-sans)',
      },
    }),
    mdx(),
    react(),
    pagefind(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
