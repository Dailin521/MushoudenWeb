import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

export default defineConfig({
  site: process.env.SITE_URL || undefined,
  base: process.env.BASE_PATH || '/',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
