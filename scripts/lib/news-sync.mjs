import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';

export const FALLBACK = '/media/game/strategy.webp';
export const PATCH_COVER = '/media/news/fix.svg';
export const IMAGE_CACHE_VERSION = 2;
export const FEEDS = {
  zh: 'https://store.steampowered.com/feeds/news/app/3285500/?l=schinese',
  en: 'https://store.steampowered.com/feeds/news/app/3285500/?l=english',
};
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, trimValues: true });
const textParser = new XMLParser({ htmlEntities: true, parseTagValue: false, trimValues: false });
const plain = (html) => {
  const escaped = sanitizeHtml(String(html ?? ''), { allowedTags: [], allowedAttributes: {} });
  return String(textParser.parse(`<text>${escaped}</text>`).text ?? '').replace(/\s+/g, ' ').trim();
};
const textValue = (value) => typeof value === 'object' && value !== null ? String(value['#text'] ?? '') : String(value ?? '');

export function eventIdentity(value) {
  try {
    const url = new URL(textValue(value));
    if (url.protocol !== 'https:' || url.hostname !== 'store.steampowered.com') return null;
    const match = url.pathname.match(/^\/news\/app\/3285500\/view\/(\d+)\/?$/);
    return match ? { id: match[1], sourceUrl: `https://store.steampowered.com/news/app/3285500/view/${match[1]}` } : null;
  } catch { return null; }
}

export function parseFeed(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Steam RSS must not contain a DTD or entity declarations');
  SyntaxValidator.validate(xml);
  const channel = parser.parse(xml)?.rss?.channel;
  if (!channel || !channel.item) throw new Error('Steam RSS has no news items');
  const items = Array.isArray(channel.item) ? channel.item : [channel.item];
  const result = items.flatMap((item) => {
    const identity = eventIdentity(item.link) ?? eventIdentity(item.guid);
    const date = new Date(textValue(item.pubDate));
    if (!identity || !Number.isFinite(date.getTime()) || !plain(item.title)) return [];
    return [{ ...identity, publishedAt: date.toISOString(), title: plain(item.title), rawHtml: textValue(item.description), coverUrl: item.enclosure?.['@_url'] ?? '' }];
  });
  if (!result.length) throw new Error('Steam RSS has no valid event IDs or dates');
  return result;
}

// Never retain classes, inline CSS, scripts, embeds or event handlers from Steam.
export function cleanBody(rawHtml, imagePaths = new Map()) {
  return sanitizeHtml(String(rawHtml).replace(/\[\/?carousel\]/gi, ''), {
    allowedTags: ['p', 'br', 'div', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr'],
    allowedAttributes: { a: ['href', 'rel', 'target'], img: ['src', 'alt', 'loading', 'decoding'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['style', 'script', 'textarea', 'option', 'iframe', 'object', 'embed', 'svg', 'math'],
    transformTags: {
      div: (_tag, attrs) => ({ tagName: /\bbb_h[234]\b/.test(attrs.class ?? '') ? (attrs.class.match(/bb_(h[234])/)?.[1] ?? 'div') : 'div', attribs: {} }),
      a: (_tag, attrs) => ({ tagName: 'a', attribs: { href: attrs.href ?? '', rel: 'noopener noreferrer', target: '_blank' } }),
      img: (_tag, attrs) => ({ tagName: 'img', attribs: { src: imagePaths.get(attrs.src) ?? FALLBACK, alt: attrs.alt ?? '', loading: 'lazy', decoding: 'async' } }),
    },
  }).trim();
}

export function imageUrls(rawHtml) {
  const urls = new Set();
  sanitizeHtml(String(rawHtml), {
    allowedTags: ['img'], allowedAttributes: { img: ['src'] },
    transformTags: { img: (_tag, attrs) => { if (attrs.src) urls.add(attrs.src); return { tagName: 'img', attribs: {} }; } },
  });
  return [...urls];
}

export function allowedImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && /(?:^|\.)(?:steamstatic\.com|steamusercontent\.com)$/.test(url.hostname);
  } catch { return false; }
}

export async function fetchLimited(url, { fetchImpl = globalThis.fetch, maxBytes = 2_000_000, timeoutMs = 18_000, attempts = 3, image = false, retryDelayMs = 250 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      let current = url;
      const signal = AbortSignal.timeout(timeoutMs);
      for (let redirects = 0; redirects <= 4; redirects++) {
        if (image && !allowedImageUrl(current)) throw new Error('Image host is outside the Steam CDN allowlist');
        const response = await fetchImpl(current, { signal, redirect: 'manual', headers: { 'User-Agent': 'MushoudenWeb-NewsSync/1.0', Accept: image ? 'image/*' : 'application/rss+xml, application/xml, text/xml' } });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get('location');
          if (!location || redirects === 4) throw new Error('Too many or invalid redirects');
          current = new URL(location, current).href;
          continue;
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
        const type = (response.headers.get('content-type') ?? '').split(';')[0].toLowerCase();
        if (image && !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(type)) { await response.body?.cancel(); throw new Error(`Unsupported image type: ${type}`); }
        if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Response exceeds the byte limit'); }
        const chunks = []; let size = 0;
        if (!response.body) throw new Error('Response body is empty');
        const reader = response.body.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) throw new Error('Response exceeds the byte limit');
            chunks.push(Buffer.from(value));
          }
        } catch (error) { await reader.cancel().catch(() => {}); throw error; }
        return Buffer.concat(chunks);
      }
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  }
  throw new Error(`Request failed: ${url}: ${lastError?.message}`);
}

export async function atomicWrite(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, contents); await rename(temporary, file); }
  finally { await unlink(temporary).catch(() => {}); }
}

export function createImageCache({ mediaDir, fetchImpl, logger = console, requestOptions = {}, recordSource = () => {}, cacheVersions = {} }) {
  const pending = new Map();
  let active = 0;
  const waiting = [];
  const withImageSlot = async (operation) => {
    if (active >= 4) await new Promise((resolve) => waiting.push(resolve));
    else active++;
    try { return await operation(); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  };
  return function cacheImage(url) {
    if (!url || !allowedImageUrl(url)) return Promise.resolve(FALLBACK);
    if (pending.has(url)) return pending.get(url);
    const operation = withImageSlot(async () => {
      const name = `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.webp`;
      const file = path.join(mediaDir, name);
      const localPath = `/media/news/${name}`;
      const remember = () => { recordSource(localPath, url); return localPath; };
      let cached = false;
      try {
        // Buffer input avoids libvips retaining a Windows file handle during replacement.
        const metadata = await sharp(await readFile(file)).metadata();
        cached = Boolean(metadata.width && metadata.height);
        if (cached && cacheVersions[localPath] === IMAGE_CACHE_VERSION) return remember();
      } catch { /* cache miss or damaged image */ }
      try {
        const bytes = await fetchLimited(url, { fetchImpl, maxBytes: 12_000_000, timeoutMs: 15_000, attempts: 2, ...requestOptions, image: true });
        // Decode every frame; Sharp carries frame delays and looping into WebP.
        const output = await sharp(bytes, { animated: true, limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
        await atomicWrite(file, output);
        cacheVersions[localPath] = IMAGE_CACHE_VERSION;
        return remember();
      } catch (error) {
        logger.warn(`${cached ? 'Image refresh failed; keeping saved image' : 'Image fallback'}: ${url}: ${error.message}`);
        return cached ? remember() : FALLBACK;
      }
    });
    pending.set(url, operation);
    return operation;
  };
}

async function mapConcurrent(values, limit, action) {
  let cursor = 0;
  const results = new Array(values.length);
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) { const index = cursor++; results[index] = await action(values[index]); }
  }));
  return results;
}

export async function localizeItem(item, cacheImage) {
  const urls = [...new Set([...imageUrls(item.rawHtml), item.coverUrl].filter(Boolean))];
  const paths = new Map(await mapConcurrent(urls, 4, async (url) => {
    try { return [url, await cacheImage(url)]; } catch { return [url, FALLBACK]; }
  }));
  const bodyHtml = cleanBody(item.rawHtml, paths);
  const fullSummary = plain(bodyHtml.replace(/<\/(?:p|div|h[234]|li|blockquote)>/gi, ' '));
  const summary = [...fullSummary].slice(0, 180).join('') + ([...fullSummary].length > 180 ? '…' : '');
  const defaultCover = /更新日志|patch notes/i.test(item.title) ? PATCH_COVER : FALLBACK;
  return { title: item.title, summary, bodyHtml, cover: paths.get(item.coverUrl) ?? defaultCover };
}

export function mergeNews(existing, updatesByLocale) {
  const entries = new Map(existing.map((entry) => [entry.id, { ...entry, locales: { ...entry.locales } }]));
  for (const locale of ['zh', 'en']) {
    const updates = updatesByLocale[locale] ?? [];
    for (const item of updates) {
      const previous = entries.get(item.id);
      entries.set(item.id, { id: item.id, publishedAt: item.publishedAt, sourceUrl: item.sourceUrl, locales: { ...(previous?.locales ?? {}), [locale]: item.content } });
    }
  }
  return [...entries.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id));
}

export function isNewsSnapshot(value) {
  return Array.isArray(value) && value.every((entry) => {
    if (typeof entry?.id !== 'string' || eventIdentity(entry.sourceUrl)?.id !== entry.id || !Number.isFinite(Date.parse(entry.publishedAt)) || !entry.locales) return false;
    const locales = Object.entries(entry.locales);
    return locales.length > 0 && locales.every(([key, content]) => ['zh', 'en'].includes(key) && content && ['title', 'summary', 'bodyHtml', 'cover'].every((field) => typeof content[field] === 'string'));
  });
}

export async function synchronizeNews({ existing = [], fetchFeed, cacheImage = async () => FALLBACK, logger = console }) {
  const updates = {}; const failedLocales = [];
  // Fetch both languages independently; the RSS <language> field is inaccurate.
  await Promise.all(Object.entries(FEEDS).map(async ([locale, url]) => {
    try {
      const items = parseFeed(await fetchFeed(url, locale));
      updates[locale] = await mapConcurrent(items, 2, async (item) => ({ ...item, content: await localizeItem(item, cacheImage) }));
    } catch (error) { failedLocales.push(locale); logger.warn(`Steam ${locale} feed failed; keeping its existing snapshot: ${error.message}`); }
  }));
  if (!Object.keys(updates).length && !existing.length) throw new Error('Both Steam feeds failed and there is no usable news snapshot');
  if (!Object.keys(updates).length) logger.warn('Both Steam feeds failed. Build continues with the saved news snapshot.');
  return { news: mergeNews(existing, updates), failedLocales };
}

export async function syncToDisk({ root, fetchImpl = globalThis.fetch, logger = console }) {
  const dataFile = path.join(root, 'src/data/news.json');
  let existing = []; let previousText;
  try {
    previousText = await readFile(dataFile, 'utf8');
    const parsed = JSON.parse(previousText);
    if (!isNewsSnapshot(parsed)) throw new Error('Invalid news snapshot format');
    existing = parsed;
  } catch (error) {
    // A truncated or invalid snapshot may contain older events that are no longer
    // in Steam's ten-item feed. Never replace that file with a partial history.
    if (error.code !== 'ENOENT') throw new Error(`Cannot read existing news snapshot; original file preserved: ${error.message}`, { cause: error });
  }
  const sourceFile = path.join(root, 'public/media/news/sources.json');
  let previousSources;
  let sources = {};
  try {
    previousSources = await readFile(sourceFile, 'utf8');
    sources = JSON.parse(previousSources);
    if (!sources || typeof sources !== 'object' || Array.isArray(sources) || Object.entries(sources).some(([file, url]) => !/^\/media\/news\/[a-f0-9]{32}\.webp$/.test(file) || !allowedImageUrl(url))) throw new Error('Invalid image provenance manifest');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot read image source manifest; original file preserved: ${error.message}`, { cause: error });
  }
  const versionFile = path.join(root, 'public/media/news/cache-versions.json');
  let previousVersions;
  let cacheVersions = {};
  try {
    previousVersions = await readFile(versionFile, 'utf8');
    cacheVersions = JSON.parse(previousVersions);
    if (!cacheVersions || typeof cacheVersions !== 'object' || Array.isArray(cacheVersions) || Object.entries(cacheVersions).some(([file, version]) => !/^\/media\/news\/[a-f0-9]{32}\.webp$/.test(file) || !Number.isInteger(version) || version < 1)) throw new Error('Invalid image cache versions');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot read image cache versions; original file preserved: ${error.message}`, { cause: error });
  }
  const cacheImage = createImageCache({ mediaDir: path.join(root, 'public/media/news'), fetchImpl, logger, cacheVersions, recordSource: (file, url) => { sources[file] = url; } });
  // Refresh legacy encodings even when their articles have left the RSS feed.
  // Failed upgrades retain the previous file and retry on the next sync.
  await mapConcurrent(Object.entries(sources).filter(([file]) => cacheVersions[file] !== IMAGE_CACHE_VERSION).map(([, url]) => url), 4, cacheImage);
  const result = await synchronizeNews({ existing, logger, fetchFeed: async (url) => (await fetchLimited(url, { fetchImpl })).toString('utf8'), cacheImage });
  const nextText = `${JSON.stringify(result.news, null, 2)}\n`;
  const changed = nextText !== previousText;
  // Filenames are SHA-256(source URL), truncated to 32 hex characters. Keep this
  // small stable manifest so bundled WebP files can be traced to their originals.
  const nextSources = `${JSON.stringify(Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`;
  const nextVersions = `${JSON.stringify(Object.fromEntries(Object.entries(cacheVersions).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`;
  if (nextSources !== previousSources) await atomicWrite(sourceFile, nextSources);
  if (nextVersions !== previousVersions) await atomicWrite(versionFile, nextVersions);
  if (changed) await atomicWrite(dataFile, nextText);
  logger.info(`Steam news: ${result.news.length} events; ${result.failedLocales.length ? `failed languages: ${result.failedLocales.join(', ')}; ` : ''}${changed ? 'snapshot saved' : 'snapshot unchanged'}.`);
  return { ...result, changed };
}
