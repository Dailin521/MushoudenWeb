import model from '../data/zhaoyun-gpu.json';
import scene from '../data/startscene.json';
import { asset } from './site';
import { createVatRenderer, decodePositions, sampleFrames } from './gpu-vat';
import { createStartSceneEffects } from './startscene-effects';

export function setupZhaoyunHero(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('.zhaoyun-canvas')!;
  const button = root.querySelector<HTMLButtonElement>('.animation-toggle')!;
  const startButton = root.querySelector<HTMLButtonElement>('.startscene-start')!;
  const musicButton = root.querySelector<HTMLButtonElement>('.music-toggle')!;
  const audio = root.querySelector<HTMLAudioElement>('audio')!;
  const status = root.querySelector<HTMLElement>('.scene-status')!;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const effects = createStartSceneEffects(root);
  const chinese = root.dataset.locale === 'zh';
  let paused = motion.matches, visible = false, loading = false, failed = false;
  let waiting = false, starting = false, started = false, buffering = false, audioFailed = false, unlocking = false;
  let renderer: ReturnType<typeof createVatRenderer> | undefined;
  let request = 0, lastTime = 0, lastAudioTime = 0, time = 0, sceneTime = 0, transitionTime = 0.2;
  let clip = model.clips.find(item => item.name === 'open')!;
  let previous: [number, number, number] = sampleFrames(clip, 0);
  let idleLoops = 0, idleTarget = 2;
  audio.volume = 0.55;

  function canRun() { return !!renderer && !failed && !paused && visible && !document.hidden && !waiting; }
  function updateControls() {
    if (failed) return;
    root.dataset.playback = waiting ? 'waiting' : paused ? 'paused' : request ? 'playing' : started ? 'suspended' : 'poster';
    button.setAttribute('aria-label', chinese ? (paused ? '播放动画' : '暂停动画') : (paused ? 'Play animation' : 'Pause animation'));
    button.hidden = !renderer || waiting;
    startButton.hidden = !waiting && !(paused && !started);
    musicButton.hidden = !started || audioFailed;
    musicButton.setAttribute('aria-label', chinese ? (audio.muted ? '开启音乐' : '关闭音乐') : (audio.muted ? 'Unmute music' : 'Mute music'));
    musicButton.setAttribute('aria-pressed', String(!audio.muted));
  }
  function draw() {
    renderer?.draw(sampleFrames(clip, time), previous, Math.min(1, transitionTime / 0.2));
    effects.draw(sceneTime, !started);
  }
  function tick(now: number) {
    request = 0;
    // Audio is the master clock, so a slow frame cannot desynchronise the entrance.
    const delta = audioFailed ? Math.min((now - lastTime) / 1000, 0.1) : Math.max(0, audio.currentTime - lastAudioTime);
    lastTime = now; lastAudioTime = audio.currentTime;
    time += delta; sceneTime += delta; transitionTime += delta;
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
  function stopDrawing() { cancelAnimationFrame(request); request = 0; }
  async function resume() {
    if (starting || unlocking || !canRun()) return;
    starting = true;
    try {
      if (!audioFailed) {
        if (!audio.getAttribute('src')) audio.src = asset(audio.canPlayType('audio/ogg; codecs="opus"') ? scene.audio.ogg.url : scene.audio.mp3.url);
        if (audio.paused) await audio.play();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        waiting = true;
      } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
        audioFailed = true; buffering = false;
        status.textContent = chinese ? '音乐暂时无法播放，动画将继续。' : 'Music is unavailable. The animation will continue.';
      }
    } finally { starting = false; }
    if (canRun() && !buffering) {
      if (!started && !audioFailed) time = sceneTime = audio.currentTime;
      started = true; root.dataset.started = '';
      stopDrawing(); lastTime = performance.now(); lastAudioTime = audio.currentTime; request = requestAnimationFrame(tick);
    } else if (!canRun()) { audio.pause(); buffering = false; }
    draw(); updateControls();
  }
  function sync() {
    stopDrawing();
    if (failed) return;
    if (unlocking) { draw(); updateControls(); return; }
    if (canRun()) { if (!buffering) void resume(); }
    else { audio.pause(); buffering = false; }
    draw(); updateControls();
  }
  async function fetchAsset(url: string) {
    const response = await fetch(asset(url));
    if (!response.ok) throw new Error(`Animation asset returned ${response.status}`);
    return response;
  }
  function decompress(response: Response) {
    return new Response(response.body!.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
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
        decompress(positionResponse), decompress(vertexResponse), decompress(indexResponse),
        atlasResponse.blob().then(blob => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })),
      ]);
      bitmap = atlas;
      if (packed.byteLength !== model.textureWidth * model.textureHeight * 4 || vertices.byteLength !== model.vertexCount * 40 || indices.byteLength !== model.indexCount * 2) throw new Error('Invalid animation data length');
      renderer = createVatRenderer(canvas, model, decodePositions(new Uint8Array(packed), model.vertexCount), vertices, indices, atlas);
      root.dataset.ready = ''; root.dataset.animation = clip.name;
      draw(); sync();
    } catch (error) {
      bitmap?.close(); renderer?.destroy(); renderer = undefined; failed = true;
      root.removeAttribute('data-ready'); root.dataset.playback = 'fallback'; button.hidden = startButton.hidden = musicButton.hidden = true;
      audio.pause(); effects.draw(0, true);
      console.warn('Zhao Yun animation could not start; keeping the poster.', error);
    } finally { loading = false; }
  }
  function start() {
    waiting = false; paused = false;
    // Call play synchronously inside the gesture, even if VAT is still loading.
    // resume() otherwise waits for the ready animation before automatic playback.
    if (!renderer) {
      unlocking = true;
      if (!audio.getAttribute('src')) audio.src = asset(audio.canPlayType('audio/ogg; codecs="opus"') ? scene.audio.ogg.url : scene.audio.mp3.url);
      void audio.play().then(() => audio.pause()).catch(() => {}).finally(() => {
        unlocking = false; buffering = false; sync();
      });
    }
    void load(); sync();
  }
  startButton.addEventListener('click', start);
  button.addEventListener('click', () => { paused = !paused; sync(); });
  musicButton.addEventListener('click', () => { audio.muted = !audio.muted; updateControls(); });
  motion.addEventListener('change', () => { paused = motion.matches; void load(); sync(); });
  audio.addEventListener('waiting', () => { if (!unlocking) { buffering = true; stopDrawing(); updateControls(); } });
  audio.addEventListener('playing', () => { buffering = false; if (!starting && !unlocking) sync(); });
  audio.addEventListener('ended', () => { audio.currentTime = scene.musicDelay; void resume(); });
  audio.addEventListener('error', () => {
    audioFailed = true; buffering = false;
    status.textContent = chinese ? '音乐暂时无法播放，动画将继续。' : 'Music is unavailable. The animation will continue.';
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { stopDrawing(); audio.pause(); });
  window.addEventListener('pageshow', sync);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); stopDrawing(); audio.pause(); renderer = undefined; failed = true;
    root.removeAttribute('data-ready'); root.dataset.playback = 'fallback'; button.hidden = startButton.hidden = musicButton.hidden = true;
    effects.draw(0, true);
  });
  new ResizeObserver(draw).observe(root);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) void load();
    sync();
  }, { rootMargin: '120px' }).observe(root);
  draw(); updateControls();
}
