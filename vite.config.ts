/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = env.VITE_SITE_URL && !env.VITE_SITE_URL.includes('localhost')
    ? env.VITE_SITE_URL
    : (mode === 'production' ? 'https://rifa-manaure.vercel.app' : 'http://localhost:5173');
  const supabaseUrl = env.VITE_SUPABASE_URL || 'https://bxhzvmbbsisxqpwrgvgn.supabase.co';

  return {
    plugins: [
      react(),
      {
        name: 'html-transform-site-url',
        enforce: 'pre',
        transformIndexHtml(html: string) {
          let updated = html
            .replace(/%VITE_SITE_URL%/g, siteUrl)
            .replace(/%VITE_SUPABASE_URL%/g, supabaseUrl);
          if (mode === 'production') {
            updated = updated.replace(/http:\/\/localhost:5173\/?/g, `${siteUrl}/`);
          }
          return updated;
        },
      },
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    test: {
      environment: 'node',
      globals: true,
    },
    build: {
      sourcemap: 'hidden',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (
                id.includes('/react/') ||
                id.includes('\\react\\') ||
                id.includes('react-dom') ||
                id.includes('react-router')
              ) {
                return 'vendor-react';
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
            }
          },
        },
      },
    },
  };
});
