import scene from '../data/startscene.json';

// Both SetDelay calls in StartScene.SetParticle prepend sequence intervals:
// 1.5 + 0.8 seconds, then DOTween's default OutQuad slows 35 down to 6.
export function particleTime(time: number) {
  const elapsed = Math.max(0, time - scene.particleDelay);
  const t = Math.min(elapsed, scene.particleSlowDuration), d = scene.particleSlowDuration;
  return Math.min(time, scene.particleDelay) * 0.1 + scene.particleFinalSpeed * elapsed
    + (scene.particleInitialSpeed - scene.particleFinalSpeed) * (t - t * t / d + t * t * t / (3 * d * d));
}

export function createStartSceneEffects(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('.startscene-particles')!;
  const context = canvas.getContext('2d');
  const logo = root.querySelector<HTMLElement>('.startscene-logo')!;
  const glow = document.createElement('canvas'); glow.width = glow.height = 64;
  const glowContext = glow.getContext('2d')!;
  const gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffddad'); gradient.addColorStop(0.12, '#ff9a41');
  gradient.addColorStop(0.35, '#ec430b90'); gradient.addColorStop(1, '#eb410000');
  glowContext.fillStyle = gradient; glowContext.fillRect(0, 0, 64, 64);
  // Three source layers: emission rates 0.2 / 0.1 / 0.02, lifetime 50.
  const particles = [0.2, 0.1, 0.02].flatMap((rate, layer) =>
    Array.from({ length: Math.ceil(rate * 50) }, (_, i) => ({ layer, birth: i / rate,
      seed: ((i + 1) * 0.61803398875 + layer * 0.2718) % 1 })));
  return {
    draw(time: number, still = false) {
      logo.style.opacity = String(still ? 1 : Math.max(0, Math.min(1, (time - scene.logoDelay) / scene.logoFade)));
      if (!context) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      if (still) return;
      const simulated = particleTime(time);
      context.globalCompositeOperation = 'lighter';
      for (const { layer, birth, seed } of particles) {
        if (simulated < birth) continue;
        const age = (simulated - birth) % 50;
        const distance = age * (8 + seed * 7) * 10;
        const x = (-1680 + distance * 0.94 + Math.sin(age * 0.3 + seed * 19) * 18 + 1280) / 2560 * width;
        const y = (720 - (-440 + (seed - 0.5) * 1100 + distance * 0.342 + Math.cos(age * 0.23 + seed * 30) * 25)) / 1440 * height;
        const size = Math.max(2, (layer === 0 ? 125 : layer === 1 ? 250 : 160) * age / 50 * height / 1440);
        if (x < -size || x > width + size || y < -size || y > height + size) continue;
        context.globalAlpha = Math.min(1, age / 2) * Math.min(1, (50 - age) / 15) * (layer === 2 ? 0.35 : 0.8);
        context.drawImage(glow, x - size, y - size, size * 2, size * 2);
      }
      context.globalAlpha = 1;
    },
  };
}
