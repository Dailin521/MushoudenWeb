import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/media/game');
const project = process.env.MUSHOUDEN_ASSET_ROOT || 'E:/rich/Mushouden/Code/Mushouden/Assets/Res/切图/CG';
await fs.mkdir(output, { recursive: true });
const sources = [];

async function image(source, name, width = 1600) {
  const response = source.startsWith('https:') ? await fetch(source, { signal: AbortSignal.timeout(30000) }) : null;
  if (response && !response.ok) throw new Error(`${response.status}: ${source}`);
  const bytes = response ? Buffer.from(await response.arrayBuffer()) : await fs.readFile(source);
  const dest = path.join(output, `${name}.webp`);
  await sharp(bytes).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 84 }).toFile(dest);
  sources.push({ file: `/media/game/${name}.webp`, source });
  return `/media/game/${name}.webp`;
}

await image(path.join(project, 'CGzhaoyun.jpg'), 'zhaoyun', 1920);
await image(path.join(project, 'CG3.jpg'), 'duel');
await image(path.join(project, 'CG2.png'), 'strategy');
await image(path.join(project, 'logo_猛将_en.png'), 'logo-en', 1142);
const game = { screenshots: [], trailer: {}, headers: {} };
for (const [locale, steamLocale] of [['zh', 'schinese'], ['en', 'english']]) {
  const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=3285500&l=${steamLocale}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Steam: ${response.status}`);
  const json = await response.json();
  const data = json['3285500'].data;
  game.headers[locale] = await image(data.header_image, `steam-${locale}`, 920);
  if (locale === 'zh') {
    for (const [index, screenshot] of data.screenshots.slice(0, 6).entries()) {
      const full = await image(screenshot.path_full, `screenshot-${index + 1}`, 1920);
      const thumb = await image(screenshot.path_full, `screenshot-${index + 1}-thumb`, 800);
      game.screenshots.push({ full, thumb });
    }
    const movie = data.movies.find(item => item.id === 257157306) || data.movies[0];
    game.trailer = { poster: await image(movie.thumbnail, 'trailer', 1200), hls: movie.hls_h264, source: 'https://store.steampowered.com/app/3285500/' };
  }
}
await fs.mkdir(path.join(root, 'src/data'), { recursive: true });
await fs.writeFile(path.join(root, 'src/data/game.json'), JSON.stringify(game, null, 2) + '\n');
await fs.writeFile(path.join(output, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
console.log(`Prepared ${sources.length} game images. Source game project was read only.`);
