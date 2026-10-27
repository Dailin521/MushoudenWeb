import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { FALLBACK, PATCH_COVER, IMAGE_CACHE_VERSION, FEEDS, allowedImageUrl, cleanBody, createImageCache, eventIdentity, fetchLimited, imageUrls, isNewsSnapshot, localizeItem, mergeNews, parseFeed, synchronizeNews, syncToDisk } from '../scripts/lib/news-sync.mjs';

const silent = { warn() {}, info() {} };
const url = (id) => `https://store.steampowered.com/news/app/3285500/view/${id}`;
const feed = (items, language = 'en-us') => `<?xml version="1.0"?><rss><channel><language>${language}</language>${items.map(({ id = '123', title = 'Title', body = '<p>Body</p>', date = 'Tue, 20 Oct 2026 04:01:28 +0000', cover }) => `<item><title><![CDATA[${title}]]></title><description><![CDATA[${body}]]></description><link><![CDATA[${url(id)}]]></link><guid isPermaLink="true">${url(id)}</guid><pubDate>${date}</pubDate>${cover ? `<enclosure url="${cover}" type="image/png" />` : ''}</item>`).join('')}</channel></rss>`;
const content = (title) => ({ title, summary: title, bodyHtml: `<p>${title}</p>`, cover: FALLBACK });
const update = (id, title) => ({ id, publishedAt: '2026-10-20T04:01:28.000Z', sourceUrl: url(id), content: content(title) });
const imagePath = (source) => `/media/news/${createHash('sha256').update(source).digest('hex').slice(0, 32)}.webp`;
const animationFixture = () => {
  const pixels = Buffer.alloc(8 * 6 * 3 * 2);
  for (let pixel = 0; pixel < 8 * 6 * 2; pixel++) pixels[pixel * 3 + (pixel < 8 * 6 ? 0 : 2)] = 255;
  return sharp(pixels, { raw: { width: 8, height: 12, channels: 3, pageHeight: 6 } }).gif({ delay: [70, 230], loop: 3 }).toBuffer();
};

test('event identity uses the RSS view URL and preserves its 64-bit string ID', () => {
  assert.deepEqual(eventIdentity(url('703282384630449863')), { id: '703282384630449863', sourceUrl: url('703282384630449863') });
  assert.equal(eventIdentity('https://evil.test/news/app/3285500/view/123'), null);
  assert.equal(eventIdentity('https://store.steampowered.com/news/app/999/view/123'), null);
  assert.equal(eventIdentity('http://store.steampowered.com/news/app/3285500/view/123'), null);
});

test('same ID merges Chinese and English even when both RSS language fields say English', async () => {
  const result = await synchronizeNews({ fetchFeed: async (_url, locale) => feed([{ title: locale === 'zh' ? '中文消息' : 'English news' }]), logger: silent });
  assert.equal(result.news.length, 1);
  assert.equal(result.news[0].locales.zh.title, '中文消息');
  assert.equal(result.news[0].locales.en.title, 'English news');
  assert.equal(result.news[0].publishedAt, '2026-10-20T04:01:28.000Z');
  assert.ok(isNewsSnapshot(result.news));
});

test('titles and summaries are plain text with decoded entities, ready for escaped UI rendering', async () => {
  const item = parseFeed(feed([{ title: 'Zhang Liao & Guan Yu', body: '<p>Warriors &amp; heroes &copy; &#x1f601;</p>' }]))[0];
  assert.equal(item.title, 'Zhang Liao & Guan Yu');
  assert.equal((await localizeItem(item, async () => FALLBACK)).summary, 'Warriors & heroes © 😁');
});

test('duplicate items do not duplicate events; reruns are deterministic', async () => {
  const fetchFeed = async () => feed([{ id: '123' }, { id: '123' }]);
  const first = await synchronizeNews({ fetchFeed, logger: silent });
  const second = await synchronizeNews({ existing: first.news, fetchFeed, logger: silent });
  assert.equal(first.news.length, 1);
  assert.deepEqual(second.news, first.news);
});

test('updates replace the affected locale and preserve other locale and old history', () => {
  const old = mergeNews([], { zh: [update('123', '旧消息'), update('100', '历史')], en: [update('123', 'English')] });
  const next = mergeNews(old, { zh: [update('123', '更新消息')] });
  assert.equal(next.length, 2);
  assert.equal(next.find((entry) => entry.id === '123').locales.zh.title, '更新消息');
  assert.equal(next.find((entry) => entry.id === '123').locales.en.title, 'English');
  assert.equal(next.find((entry) => entry.id === '100').locales.zh.title, '历史');
  assert.equal(old.find((entry) => entry.id === '123').locales.zh.title, '旧消息');
});

test('malicious HTML loses scripts, handlers, unsafe URLs, style and embeds', () => {
  const html = cleanBody('<script>alert(1)</script><iframe src="https://evil.test">bad</iframe><svg onload="bad()"><script>bad()</script></svg><p style="color:red" onclick="bad()">Safe <strong>text</strong></p><a href="java&#x73;cript:alert(1)">bad link</a><a href="https://example.com">good</a><img src="javascript:alert(1)" onerror="bad()">');
  assert.doesNotMatch(html, /<(?:script|iframe|svg)\b|onload|onclick|onerror|style=|javascript|alert\(1\)/i);
  assert.match(html, /<p>Safe <strong>text<\/strong><\/p>/);
  assert.match(html, /href="https:\/\/example.com" rel="noopener noreferrer" target="_blank"/);
  assert.match(html, /src="\/media\/game\/strategy.webp"/);
});

test('Steam headings and carousel become ordinary semantic headings and local images', () => {
  const html = cleanBody('[carousel]<img src="https://clan.fastly.steamstatic.com/a.png">[/carousel]<div class="bb_h2"><b>News</b></div>', new Map([['https://clan.fastly.steamstatic.com/a.png', '/media/news/a.webp']]));
  assert.doesNotMatch(html, /carousel|bb_h2/);
  assert.match(html, /<h2><b>News<\/b><\/h2>/);
  assert.match(html, /src="\/media\/news\/a.webp"/);
  assert.deepEqual(imageUrls('<img src="https://cdn.test/a?a=1&amp;b=2"><img src="https://cdn.test/a?a=1&amp;b=2">'), ['https://cdn.test/a?a=1&b=2']);
});

test('missing enclosure and failed body images independently use the fallback', async () => {
  const item = parseFeed(feed([{ body: '<p>One</p><p>Two</p><img src="https://clan.fastly.steamstatic.com/a.png">' }]))[0];
  const result = await localizeItem(item, async () => { throw new Error('image unavailable'); });
  assert.equal(result.cover, FALLBACK);
  assert.match(result.bodyHtml, /src="\/media\/game\/strategy.webp"/);
  assert.equal(result.summary, 'One Two');
});

test('patch notes without a cover use the FIX graphic in both languages', async () => {
  for (const title of ['ver_2.5.2更新日志', 'ver_2.5.1 Patch Notes']) {
    const item = parseFeed(feed([{ title }]))[0];
    assert.equal((await localizeItem(item, async () => FALLBACK)).cover, PATCH_COVER);
    const withCover = { ...item, coverUrl: 'https://clan.fastly.steamstatic.com/cover.png' };
    assert.equal((await localizeItem(withCover, async () => '/media/news/cover.webp')).cover, '/media/news/cover.webp');
  }
});

test('one failed feed preserves its locale while the healthy feed updates', async () => {
  const existing = mergeNews([], { zh: [update('123', '原中文')], en: [update('123', 'Old English')] });
  const result = await synchronizeNews({ existing, fetchFeed: async (_url, locale) => { if (locale === 'zh') throw new Error('offline'); return feed([{ title: 'Updated English' }]); }, logger: silent });
  assert.deepEqual(result.failedLocales, ['zh']);
  assert.equal(result.news[0].locales.zh.title, '原中文');
  assert.equal(result.news[0].locales.en.title, 'Updated English');
});

test('both failed feeds succeed with a cached snapshot and fail without it', async () => {
  const existing = mergeNews([], { zh: [update('123', 'Cached')] });
  const options = { fetchFeed: async () => { throw new Error('offline'); }, logger: silent };
  assert.deepEqual((await synchronizeNews({ ...options, existing })).news, existing);
  await assert.rejects(synchronizeNews(options), /no usable news snapshot/);
});

test('malformed, empty and DTD feeds fail rather than erase valid data', () => {
  for (const xml of ['not xml', '<rss><channel /></rss>', '<!DOCTYPE rss [<!ENTITY a "b">]><rss />', feed([{ date: 'not a date' }])]) assert.throws(() => parseFeed(xml));
});

test('image URLs only accept HTTPS Steam CDN hosts without credentials or custom ports', () => {
  assert.ok(allowedImageUrl('https://clan.fastly.steamstatic.com/images/a.png'));
  for (const value of ['http://steamstatic.com/a.png', 'https://steamstatic.com.evil.test/a.png', 'https://localhost/a.png', 'https://user@steamstatic.com/a.png', 'https://steamstatic.com:444/a.png', 'data:image/png;base64,a']) assert.equal(allowedImageUrl(value), false, value);
});

test('bounded requests retry errors and reject excessive response bytes', async () => {
  let calls = 0;
  const bytes = await fetchLimited('https://example.com', { fetchImpl: async () => { calls++; if (calls === 1) throw new Error('temporary'); return new Response('okay'); }, retryDelayMs: 0 });
  assert.equal(bytes.toString(), 'okay');
  assert.equal(calls, 2);
  await assert.rejects(fetchLimited('https://example.com', { fetchImpl: async () => new Response('too long'), maxBytes: 3, attempts: 1 }), /byte limit/);
});

test('requests abort on the configured timeout instead of waiting indefinitely', async () => {
  await assert.rejects(fetchLimited('https://example.com', { timeoutMs: 10, attempts: 1, fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response('too late')), 1000);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  }) }), /timeout/i);
});

test('image downloads reject unsupported types and redirects outside the allowlist', async () => {
  const source = 'https://clan.fastly.steamstatic.com/a.png';
  await assert.rejects(fetchLimited(source, { image: true, attempts: 1, fetchImpl: async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }) }), /Unsupported image type/);
  let calls = 0;
  await assert.rejects(fetchLimited(source, { image: true, attempts: 1, fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/a.png' } }); } }), /allowlist/);
  assert.equal(calls, 1);
});

test('image cache optimizes a real image, deduplicates requests and works offline on rerun', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mushouden-images-'));
  try {
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#ff0000' } }).png().toBuffer();
    let calls = 0;
    const sources = {};
    const source = 'https://clan.fastly.steamstatic.com/test.png';
    const options = { mediaDir: dir, cacheVersions: {}, logger: silent, requestOptions: { attempts: 1 }, recordSource: (file, sourceUrl) => { sources[file] = sourceUrl; }, fetchImpl: async () => { calls++; return new Response(png, { headers: { 'content-type': 'image/png' } }); } };
    const cache = createImageCache(options);
    const [first, duplicate] = await Promise.all([cache(source), cache(source)]);
    assert.equal(first, duplicate);
    assert.equal(calls, 1);
    assert.deepEqual(sources, { [first]: source });
    const metadata = await sharp(await readFile(path.join(dir, path.basename(first)))).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 1600);
    const offlineCache = createImageCache({ ...options, fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal(await offlineCache(source), first);
    assert.equal(await offlineCache('https://clan.fastly.steamstatic.com/missing.png'), FALLBACK);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('animated images retain frames, timing and loop, and the upgraded cache needs no network', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mushouden-animation-'));
  try {
    const gif = await animationFixture();
    const source = 'https://clan.fastly.steamstatic.com/animation.gif';
    const local = imagePath(source);
    const file = path.join(dir, path.basename(local));
    await writeFile(file, await sharp(gif).webp().toBuffer());
    assert.equal((await sharp(await readFile(file)).metadata()).pages ?? 1, 1);
    const cacheVersions = {};
    const cache = createImageCache({ mediaDir: dir, cacheVersions, logger: silent, fetchImpl: async () => new Response(gif, { headers: { 'content-type': 'image/gif' } }) });
    assert.equal(await cache(source), local);
    const image = await readFile(file);
    const metadata = await sharp(image, { animated: true }).metadata();
    assert.equal(metadata.pages, 2);
    assert.equal(metadata.width, 8);
    assert.equal(metadata.pageHeight, 6);
    assert.deepEqual(metadata.delay, [70, 230]);
    assert.equal(metadata.loop, 3);
    const first = await sharp(image, { page: 0, pages: 1 }).raw().toBuffer();
    const second = await sharp(image, { page: 1, pages: 1 }).raw().toBuffer();
    assert.notDeepEqual(first, second);
    assert.equal(cacheVersions[local], IMAGE_CACHE_VERSION);
    let requests = 0;
    const offline = createImageCache({ mediaDir: dir, cacheVersions, logger: silent, fetchImpl: async () => { requests++; throw new Error('offline'); } });
    assert.equal(await offline(source), local);
    assert.equal(requests, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a failed animation upgrade preserves the old file and can be retried', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mushouden-animation-offline-'));
  try {
    const gif = await animationFixture();
    const source = 'https://clan.fastly.steamstatic.com/animation.gif';
    const local = imagePath(source);
    const file = path.join(dir, path.basename(local));
    const oldImage = await sharp(gif).webp().toBuffer();
    await writeFile(file, oldImage);
    const cacheVersions = {};
    const options = { mediaDir: dir, cacheVersions, logger: silent, requestOptions: { attempts: 1 } };
    const offline = createImageCache({ ...options, fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal(await offline(source), local);
    assert.deepEqual(await readFile(file), oldImage);
    assert.equal(cacheVersions[local], undefined);
    const retry = createImageCache({ ...options, fetchImpl: async () => new Response(gif, { headers: { 'content-type': 'image/gif' } }) });
    assert.equal(await retry(source), local);
    assert.equal((await sharp(await readFile(file)).metadata()).pages, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('disk sync migrates historical images outside the current feed and persists the encoding version', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mushouden-animation-history-'));
  try {
    const gif = await animationFixture();
    const source = 'https://clan.fastly.steamstatic.com/historical.gif';
    const local = imagePath(source);
    const mediaDir = path.join(root, 'public/media/news');
    const dataDir = path.join(root, 'src/data');
    await mkdir(mediaDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(mediaDir, path.basename(local)), await sharp(gif).webp().toBuffer());
    await writeFile(path.join(mediaDir, 'sources.json'), JSON.stringify({ [local]: source }));
    const existing = mergeNews([], { zh: [update('100', 'Historical post')] });
    existing[0].locales.zh.bodyHtml = `<p><img src="${local}" /></p>`;
    await writeFile(path.join(dataDir, 'news.json'), JSON.stringify(existing));
    let imageRequests = 0;
    const fetchImpl = async (requested) => {
      if (requested === source) { imageRequests++; return new Response(gif, { headers: { 'content-type': 'image/gif' } }); }
      return new Response(feed([{ id: '123', title: 'Current post' }]));
    };
    const result = await syncToDisk({ root, fetchImpl, logger: silent });
    assert.deepEqual(result.news.find(entry => entry.id === '100'), existing[0]);
    assert.equal((await sharp(await readFile(path.join(mediaDir, path.basename(local)))).metadata()).pages, 2);
    assert.equal(JSON.parse(await readFile(path.join(mediaDir, 'cache-versions.json'), 'utf8'))[local], IMAGE_CACHE_VERSION);
    assert.equal(imageRequests, 1);
    assert.equal((await syncToDisk({ root, fetchImpl, logger: silent })).changed, false);
    assert.equal(imageRequests, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('disk sync writes a usable snapshot and leaves unchanged file mtime intact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mushouden-sync-'));
  try {
    const fetchImpl = async (requested) => new Response(feed([{ title: requested === FEEDS.zh ? '中文' : 'English' }]));
    assert.equal((await syncToDisk({ root, fetchImpl, logger: silent })).changed, true);
    const file = path.join(root, 'src/data/news.json');
    const before = await stat(file);
    assert.equal((await syncToDisk({ root, fetchImpl, logger: silent })).changed, false);
    assert.equal((await stat(file)).mtimeMs, before.mtimeMs);
    assert.ok(isNewsSnapshot(JSON.parse(await readFile(file, 'utf8'))));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a corrupted or structurally invalid snapshot is preserved even when new feeds are healthy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mushouden-corrupt-'));
  try {
    await mkdir(path.join(root, 'src/data'), { recursive: true });
    const file = path.join(root, 'src/data/news.json');
    for (const original of ['{bad json', JSON.stringify([{ id: 'old-history', locales: {} }])]) {
      await writeFile(file, original);
      let fetchCount = 0;
      await assert.rejects(syncToDisk({ root, fetchImpl: async () => { fetchCount++; return new Response(feed([{ title: 'Healthy new feed' }])); }, logger: silent }), /original file preserved/);
      assert.equal(fetchCount, 0);
      assert.equal(await readFile(file, 'utf8'), original);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
