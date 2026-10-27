import model from '../data/zhaoyun-gpu.json';
import { asset } from './site';
import { createVatRenderer, decodePositions, sampleFrames } from './gpu-vat';

export function setupZhaoyunHero(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const button = root.querySelector<HTMLButtonElement>('button')!;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = motion.matches, visible = false, loading = false, failed = false;
  let renderer: ReturnType<typeof createVatRenderer> | undefined;
  let request = 0, lastTime = 0, time = 0, transitionTime = 0.2;
  let clip = model.clips.find(item => item.name === 'open')!;
  let previous: [number, number, number] = sampleFrames(clip, 0);
  let idleLoops = 0, idleTarget = 2;

  function updateButton() {
    root.dataset.playback = paused ? 'paused' : renderer ? 'playing' : 'poster';
    button.setAttribute('aria-label', root.dataset.locale === 'zh' ? (paused ? '播放动画' : '暂停动画') : (paused ? 'Play animation' : 'Pause animation'));
  }
  function draw() { renderer?.draw(sampleFrames(clip, time), previous, Math.min(1, transitionTime / 0.2)); }
  function tick(now: number) {
    request = 0;
    const delta = Math.min((now - lastTime) / 1000, 0.1); lastTime = now;
    time += delta; transitionTime += delta;
    if (time >= clip.duration) {
      previous = sampleFrames(clip, clip.duration);
      let name = 'anima_01';
      if (clip.name === 'anima_01' && ++idleLoops >= idleTarget) {
        name = `anima_0${2 + Math.floor(Math.random() * 3)}`;
        idleLoops = 0; idleTarget = 2 + Math.floor(Math.random() * 2);
      }
      clip = model.clips.find(item => item.name === name)!;
      time = 0; transitionTime = 0;
      root.dataset.animation = clip.name;
    }
    draw(); request = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(request); request = 0;
    if (failed) return;
    if (renderer && !paused && visible && !document.hidden) { lastTime = performance.now(); request = requestAnimationFrame(tick); }
    updateButton();
  }
  async function fetchAsset(url: string) {
    const response = await fetch(asset(url));
    if (!response.ok) throw new Error(`Animation asset returned ${response.status}`);
    return response;
  }
  async function load() {
    if (renderer || loading || failed || paused) return;
    loading = true;
    let bitmap: ImageBitmap | undefined;
    try {
      const [positionResponse, vertexResponse, indexResponse, atlasResponse] = await Promise.all([
        fetchAsset(model.positionsUrl), fetchAsset(model.verticesUrl), fetchAsset(model.indicesUrl), fetchAsset(model.atlasUrl),
      ]);
      const [packed, vertices, indices, atlas] = await Promise.all([
        new Response(positionResponse.body!.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),
        vertexResponse.arrayBuffer(), indexResponse.arrayBuffer(),
        atlasResponse.blob().then(blob => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })),
      ]);
      bitmap = atlas;
      if (packed.byteLength !== model.textureWidth * model.textureHeight * 4 || vertices.byteLength !== model.vertexCount * 40 || indices.byteLength !== model.indexCount * 2) throw new Error('Invalid animation data length');
      renderer = createVatRenderer(canvas, model, decodePositions(new Uint8Array(packed), model.vertexCount), vertices, indices, atlas);
      draw(); root.dataset.ready = ''; root.dataset.animation = clip.name;
      button.hidden = false; sync();
    } catch (error) {
      bitmap?.close(); renderer?.destroy(); renderer = undefined; failed = true;
      root.removeAttribute('data-ready'); root.dataset.playback = 'fallback'; button.hidden = true;
      console.warn('Zhao Yun animation could not start; keeping the poster.', error);
    } finally { loading = false; }
  }
  button.addEventListener('click', () => { paused = !paused; void load(); sync(); });
  motion.addEventListener('change', () => { paused = motion.matches; void load(); sync(); });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => cancelAnimationFrame(request));
  window.addEventListener('pageshow', sync);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); cancelAnimationFrame(request); renderer = undefined; failed = true;
    root.removeAttribute('data-ready'); root.dataset.playback = 'fallback'; button.hidden = true;
  });
  new ResizeObserver(draw).observe(root);
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) void load();
    sync();
  }, { rootMargin: '120px' });
  observer.observe(root);
  // A reduced-motion visitor sees the poster until explicitly choosing to play.
  button.hidden = !paused;
  updateButton();
}
