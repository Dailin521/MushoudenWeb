import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { decodePositions, sampleFrames } from '../src/lib/gpu-vat.ts';

test('transport decoding preserves negative deltas and unsigned wraparound between frames', () => {
  // Three two-vertex poses, including coordinate extremes, with byte planes.
  const packed = Uint8Array.from([0, 255, 100, 0, 255, 1, 255, 255, 1, 255, 157, 1,
    0, 255, 0, 128, 255, 0, 255, 127, 0, 255, 255, 128]);
  assert.deepEqual([...decodePositions(packed, 2)], [0, 65535, 100, 32768, 65535, 0, 99, 65535, 0, 65535, 0, 32768]);
});

test('frame lookup handles nonuniform keyframes, holds stepped intervals and clamps at clip ends', () => {
  const clip = { name: 'test', offset: 12, duration: 1, times: [0, 0.5, 0.50001, 1] };
  assert.deepEqual(sampleFrames(clip, 0.25), [12, 13, 0.5]);
  assert.deepEqual(sampleFrames(clip, 0.5), [13, 14, 0]);
  assert.deepEqual(sampleFrames(clip, 1), [15, 15, 0]);
  assert.deepEqual(sampleFrames(clip, 10), [15, 15, 0]);
});

test('published VAT assets contain all five clips, valid indices and moving vertex data', async () => {
  const model = JSON.parse(await readFile('src/data/zhaoyun-gpu.json', 'utf8'));
  const packed = gunzipSync(await readFile('public' + model.positionsUrl));
  const positions = decodePositions(packed, model.vertexCount);
  assert.equal(positions.length, model.textureWidth * model.textureHeight * 2);
  assert.ok(positions.every(value => value <= model.positionMax));
  const vertices = gunzipSync(await readFile('public' + model.verticesUrl));
  assert.equal(vertices.length, model.vertexCount * 40);
  const indexBytes = gunzipSync(await readFile('public' + model.indicesUrl));
  const indices = new Uint16Array(indexBytes.buffer, indexBytes.byteOffset, indexBytes.length / 2);
  assert.equal(indices.length, model.indexCount);
  assert.ok(indices.every(i => i < model.vertexCount));
  assert.deepEqual(model.clips.map(c => c.name).sort(), ['anima_01', 'anima_02', 'anima_03', 'anima_04', 'open']);
  for (const clip of model.clips) {
    assert.equal(clip.times[0], 0); assert.equal(clip.times.at(-1), clip.duration);
    assert.ok(clip.times.every((t, i) => !i || t > clip.times[i - 1]));
    const start = clip.offset * model.vertexCount * 2;
    const middle = (clip.offset + Math.floor(clip.times.length / 2)) * model.vertexCount * 2;
    assert.notDeepEqual(positions.slice(start, start + model.vertexCount * 2), positions.slice(middle, middle + model.vertexCount * 2));
  }
});

test('the complete opening stays below 4 MB with Opus in either language', async () => {
  const model = JSON.parse(await readFile('src/data/zhaoyun-gpu.json', 'utf8'));
  const scene = JSON.parse(await readFile('src/data/startscene.json', 'utf8'));
  for (const logo of [scene.logoZh, scene.logoEn]) {
    const urls = [model.positionsUrl, model.verticesUrl, model.indicesUrl, model.atlasUrl, scene.background, logo, scene.audio.ogg.url, '/media/game/zhaoyun.webp'];
    const files = await Promise.all(urls.map(url => readFile('public' + url)));
    assert.ok(files.reduce((sum, file) => sum + file.length, 0) < 4_000_000);
    assert.equal(files[3].toString('ascii', 8, 12), 'WEBP');
    assert.equal(files[6].toString('ascii', 0, 4), 'OggS');
  }
});
