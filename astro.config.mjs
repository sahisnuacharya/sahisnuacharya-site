// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://sahisnuacharya.com.np',
  output: 'server',
  trailingSlash: 'never',
  adapter: cloudflare({
    // Images are optimized in the browser before upload (admin), so no paid image service.
    imageService: 'passthrough',
    // Reuse the one free KV namespace instead of creating a second one for sessions.
    sessionKVBindingName: 'MEDIA',
  }),
  build: {
    inlineStylesheets: 'always',
  },
  // Keep scripts as separate files so the strict Content Security Policy allows them.
  vite: { build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false },
});
