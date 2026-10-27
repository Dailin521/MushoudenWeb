import { fileURLToPath } from 'node:url';
import { syncToDisk } from './lib/news-sync.mjs';

try {
  await syncToDisk({ root: fileURLToPath(new URL('../', import.meta.url)) });
} catch (error) {
  console.error(`Steam news synchronization failed: ${error.message}`);
  process.exitCode = 1;
}
