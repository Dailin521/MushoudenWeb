import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const source = process.env.MUSHOUDEN_ASSETS || 'E:/rich/Mushouden/Code/Mushouden/Assets';
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const output = 'public/media/startscene';
await mkdir(output, { recursive: true });
await mkdir('output', { recursive: true });
async function save(name, extension, bytes) {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const file = `${name}-${hash}.${extension}`;
  await writeFile(path.join(output, file), bytes);
  return `/media/startscene/${file}`;
}
async function image(name, filename, height) {
  const bytes = await sharp(path.join(source, 'Res/切图/CG', filename)).resize({ height, withoutEnlargement: true })
    .webp({ quality: 86, alphaQuality: 100, effort: 6 }).toBuffer();
  return save(name, 'webp', bytes);
}
const background = await image('background', 'BG.png', 1080);
const logoZh = await image('logo-zh', 'logosanguo.png', 900);
const logoEn = await image('logo-en', 'logo_猛将_en.png', 584);
const original = path.join(source, 'AssetBundles/AudioClip/背景音乐/bgm_start.wav');
const audio = {};
for (const [extension, codec] of [['ogg', ['-c:a', 'libopus', '-b:a', '96k', '-vbr', 'on']], ['mp3', ['-c:a', 'libmp3lame', '-b:a', '128k']]]) {
  const temporary = path.resolve('output', `bgm-start.${extension}`);
  // Preserve StartScene.play_music_time = 0.4 without relying on a delayed play()
  // call, which would lose the browser's user-activation permission.
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', original,
    '-map_metadata', '-1', '-vn', '-af', 'adelay=400:all=1', ...codec, temporary], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  const bytes = await readFile(temporary);
  audio[extension] = { url: await save('bgm-start', extension, bytes), bytes: bytes.length };
}
const manifest = { background, logoZh, logoEn, audio, musicDelay: 0.4, logoDelay: 2, logoFade: 0.7,
  particleDelay: 2.3, particleInitialSpeed: 35, particleFinalSpeed: 6, particleSlowDuration: 8 };
await writeFile('src/data/startscene.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ originalBytes: (await stat(original)).size, ...manifest }, null, 2));
