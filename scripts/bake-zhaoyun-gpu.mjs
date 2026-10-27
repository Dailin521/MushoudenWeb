// Same VAT approach as TowerDefense's SpineMeshGpuBaker / SpineMeshGpu.shader:
// sample world-space mesh vertices offline, then interpolate two frames in the GPU.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import sharp from 'sharp';
import { BaseTexture, TextureMatrix } from '@pixi/core';
import { TextureAtlas, MixBlend, MixDirection, settings } from '@pixi-spine/base';
import { SkeletonBinary, AtlasAttachmentLoader, Skeleton, MeshAttachment, ClippingAttachment,
  RotateTimeline, TranslateTimeline, DeformTimeline } from '@pixi-spine/runtime-3.8';

const source = process.env.MUSHOUDEN_SPINE_ROOT || 'E:/rich/Mushouden/Code/Mushouden/Assets/Res/Spine/开始界面';
const prefix = path.join(source, '开始界面切图');
const output = 'public/media/spine/zhaoyun';
const [binary, atlasText, image] = await Promise.all([
  readFile(prefix + '.skel.bytes'), readFile(prefix + '.atlas.txt', 'utf8'), readFile(prefix + '.png'),
]);
const { width, height } = await sharp(image).metadata();
const atlas = new TextureAtlas(atlasText, (_, done) => done(new BaseTexture(null, { width, height })));
if (atlas.pages.length !== 1) throw new Error('This bake expects the single-page Zhao Yun atlas.');
// Legacy 3.8.75 is read by the unmodified offline runtime (which prints a deprecation notice).
const data = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(binary);
settings.yDown = false;
const skeleton = new Skeleton(data);
skeleton.updateWorldTransform();
const meshes = [];
let vertexCount = 0;
for (const slot of skeleton.drawOrder) {
  const attachment = slot.getAttachment();
  // StartScene's SkeletonGraphic explicitly has meshGenerator.settings.useClipping = 0.
  if (attachment instanceof ClippingAttachment) continue;
  if (!(attachment instanceof MeshAttachment) || slot.data.blendMode !== 0 || slot.darkColor) {
    throw new Error(`Unsupported attachment/blending: ${slot.data.name}`);
  }
  meshes.push({ slot, attachment, offset: vertexCount });
  vertexCount += attachment.worldVerticesLength / 2;
}
if (vertexCount > 65535) throw new Error('Mesh exceeds the 16-bit index budget.');
const geometry = new Float32Array(vertexCount * 10); // UV, atlas region, constant RGBA tint.
const indices = [];
for (const { slot, attachment, offset } of meshes) {
  const matrix = new TextureMatrix(attachment.region.texture);
  matrix.update();
  const uvs = matrix.multiplyUvs(attachment.regionUVs, new Float32Array(attachment.regionUVs.length));
  const frame = attachment.region.texture.frame;
  const region = [frame.x / width, frame.y / height, (frame.x + frame.width) / width, (frame.y + frame.height) / height];
  const color = ['r', 'g', 'b', 'a'].map(k => slot.color[k] * attachment.color[k]);
  for (let i = 0; i < uvs.length / 2; i++) geometry.set([uvs[i * 2], uvs[i * 2 + 1], ...region, ...color], (offset + i) * 10);
  indices.push(...attachment.triangles.map(i => i + offset));
}

function sample(animation, time) {
  skeleton.setToSetupPose();
  animation.apply(skeleton, -1, time, false, [], 1, MixBlend.setup, MixDirection.mixIn);
  skeleton.updateWorldTransform();
  const positions = new Float32Array(vertexCount * 2);
  for (const { slot, attachment, offset } of meshes) {
    if (slot.getAttachment() !== attachment) throw new Error('Attachment switches need an additional GPU layout stream.');
    attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, positions, offset * 2, 2);
  }
  if (!positions.every(Number.isFinite)) throw new Error(`Invalid sampled vertices: ${animation.name} / ${time}`);
  return positions;
}

const clips = [];
const samples = [];
const fps = 20;
const positionMax = 4095; // 12 significant bits: subpixel at the website's display size.
const bounds = [Infinity, Infinity, -Infinity, -Infinity];
for (const animation of data.animations) {
  const times = new Set([0, animation.duration]);
  for (let frame = 1; frame < Math.ceil(animation.duration * fps); frame++) times.add(frame / fps);
  // Preserve original keys and stepped changes, as in the reference Unity baker.
  for (const timeline of animation.timelines) {
    let stride;
    if (timeline instanceof RotateTimeline) stride = RotateTimeline.ENTRIES;
    else if (timeline instanceof TranslateTimeline) stride = TranslateTimeline.ENTRIES;
    else if (timeline instanceof DeformTimeline) stride = 1;
    else throw new Error(`Unsupported timeline: ${timeline.constructor.name}`);
    for (let i = 0; i < timeline.frames.length; i += stride) {
      const time = timeline.frames[i];
      times.add(time);
      if (time > 0 && (i === 0 || timeline.getCurveType(i / stride - 1) === 1)) times.add(Math.max(0, time - 0.00001));
    }
  }
  const sorted = [...times].sort((a, b) => a - b).filter((t, i, a) => i === 0 || t - a[i - 1] > 0.000001);
  sorted[sorted.length - 1] = animation.duration;
  const clip = { name: animation.name, duration: animation.duration, offset: samples.length, times: sorted };
  for (const time of sorted) {
    const values = sample(animation, time);
    samples.push(values);
    for (let i = 0; i < values.length; i += 2) {
      bounds[0] = Math.min(bounds[0], values[i]); bounds[1] = Math.min(bounds[1], values[i + 1]);
      bounds[2] = Math.max(bounds[2], values[i]); bounds[3] = Math.max(bounds[3], values[i + 1]);
    }
  }
  clips.push(clip);
}
const extent = [bounds[2] - bounds[0], bounds[3] - bounds[1]];
// RG16UI: precise integer data, no PNG color conversion or alpha premultiplication.
const textureWidth = 2048;
const textureHeight = Math.ceil(samples.length * vertexCount / textureWidth);
if (textureHeight > 4096) throw new Error('VAT exceeds the supported texture size.');
const positions = new Uint16Array(textureWidth * textureHeight * 2);
let maxQuantizationError = 0;
for (let frame = 0; frame < samples.length; frame++) {
  for (let i = 0; i < vertexCount * 2; i++) {
    const axis = i % 2;
    const value = Math.round((samples[frame][i] - bounds[axis]) / extent[axis] * positionMax);
    positions[frame * vertexCount * 2 + i] = value;
    maxQuantizationError = Math.max(maxQuantizationError, Math.abs(bounds[axis] + value / positionMax * extent[axis] - samples[frame][i]));
  }
}
let maxInterpolationError = 0;
let interpolationSum = 0;
let interpolationCount = 0;
for (const clip of clips) {
  const animation = data.findAnimation(clip.name);
  for (let frame = 0; frame + 1 < clip.times.length; frame++) {
    const exact = sample(animation, (clip.times[frame] + clip.times[frame + 1]) / 2);
    const first = samples[clip.offset + frame], second = samples[clip.offset + frame + 1];
    for (let i = 0; i < exact.length; i += 2) {
      const error = Math.hypot((first[i] + second[i]) / 2 - exact[i], (first[i + 1] + second[i + 1]) / 2 - exact[i + 1]);
      maxInterpolationError = Math.max(maxInterpolationError, error);
      interpolationSum += error * error; interpolationCount++;
    }
  }
}
if (maxQuantizationError > 0.25 || maxInterpolationError > 3) throw new Error(`Sampling error too high: ${maxQuantizationError}, ${maxInterpolationError}`);

// Determine the atlas convention, without changing the original image.
const rgba = await sharp(image).ensureAlpha().raw().toBuffer();
let straightAlphaPixels = 0;
for (let i = 0; i < rgba.length; i += 4) {
  if (rgba[i + 3] > 0 && rgba[i + 3] < 250 && Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) > rgba[i + 3] + 2) straightAlphaPixels++;
}
// Convert the original PMA pixels to straight alpha before lossy WebP encoding.
// This preserves soft edges; the fragment shader premultiplies after sampling.
if (straightAlphaPixels === 0) {
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3];
    for (let channel = 0; channel < 3; channel++) rgba[i + channel] = alpha ? Math.min(255, Math.round(rgba[i + channel] * 255 / alpha)) : 0;
  }
}
const webAtlas = await sharp(rgba, { raw: { width, height, channels: 4 } }).webp({ quality: 86, alphaQuality: 100, effort: 6 }).toBuffer();
await mkdir(output, { recursive: true });
async function save(stem, extension, bytes) {
  const name = `${stem}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.${extension}`;
  await writeFile(path.join(output, name), bytes);
  return `/media/spine/zhaoyun/${name}`;
}
// Delta + byte planes compress the repeated poses before upload. The browser
// reconstructs this once; frame playback still reads RG16UI entirely on the GPU.
const packed = Buffer.alloc(positions.length * 2);
const stride = vertexCount * 2;
for (let i = 0; i < positions.length; i++) {
  const delta = (positions[i] - (i >= stride ? positions[i - stride] : 0)) & 65535;
  packed[i] = delta & 255;
  packed[i + positions.length] = delta >>> 8;
}
const [atlasUrl, positionsUrl, verticesUrl, indicesUrl] = await Promise.all([
  save('atlas', 'webp', webAtlas),
  save('positions', 'bin.gz', gzipSync(packed, { level: 9 })),
  save('vertices', 'bin.gz', gzipSync(Buffer.from(geometry.buffer), { level: 9 })),
  save('indices', 'bin.gz', gzipSync(Buffer.from(new Uint16Array(indices).buffer), { level: 9 })),
]);
const manifest = { version: 2, positionEncoding: 'delta16-byteplanes-gzip', positionMax, sourceVersion: data.version, vertexCount, indexCount: indices.length,
  textureWidth, textureHeight, bounds: [bounds[0], bounds[1], ...extent],
  setupBounds: [data.x, data.y, data.width, data.height], atlasSize: [width, height],
  premultipliedAlpha: false,
  atlasUrl, positionsUrl, verticesUrl, indicesUrl, clips };
await writeFile('src/data/zhaoyun-gpu.json', JSON.stringify(manifest));
const validation = { vertices: vertexCount, meshes: meshes.length, frames: samples.length, textureWidth, textureHeight,
  maxQuantizationError, maxInterpolationError, rmsInterpolationError: Math.sqrt(interpolationSum / interpolationCount),
  premultipliedAlpha: manifest.premultipliedAlpha, clips: clips.map(c => ({ name: c.name, duration: c.duration, frames: c.times.length })) };
await mkdir('output', { recursive: true });
await writeFile('output/zhaoyun-gpu-validation.json', JSON.stringify(validation, null, 2));
console.log(JSON.stringify(validation, null, 2));
