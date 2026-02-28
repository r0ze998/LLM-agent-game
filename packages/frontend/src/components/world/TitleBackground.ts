// Canvas 2D animated background for the title screen
// Visualizes "a civilization being born" — stars, hills, emerging buildings, agent particles, fireflies

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  type: 'star' | 'agent' | 'firefly';
  // star-specific
  twinklePhase?: number;
  twinkleSpeed?: number;
  // agent-specific
  targetX?: number;
  targetY?: number;
  // firefly-specific
  glowPhase?: number;
  glowSpeed?: number;
}

interface Silhouette {
  x: number;
  width: number;
  height: number;
  type: 'hill' | 'house' | 'tree' | 'tower';
  emergeProgress: number;
  color: string;
  layer: number; // 0=far hills, 1=mid hills, 2=foreground
}

export interface TitleScene {
  particles: Particle[];
  silhouettes: Silhouette[];
  time: number;
  phase: number;      // 0-4
  phaseTime: number;  // ms elapsed within current phase
  initialized: boolean;
}

// ---- Creation ----

function createStars(count: number): Particle[] {
  const stars: Particle[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random() * 0.6,
      vx: (Math.random() - 0.5) * 0.00002,
      vy: (Math.random() - 0.5) * 0.00001,
      size: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.6 + 0.3,
      color: Math.random() > 0.3 ? '#ffffff' : '#c0d8ff',
      type: 'star',
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.002 + 0.001,
    });
  }
  return stars;
}

function createAgents(count: number): Particle[] {
  const agents: Particle[] = [];
  const colors = ['#5a8aff', '#8a6aff', '#6adaff'];
  for (let i = 0; i < count; i++) {
    const x = Math.random() * 0.8 + 0.1;
    agents.push({
      x,
      y: 0.82 + Math.random() * 0.08,
      vx: 0,
      vy: 0,
      size: Math.random() * 1.5 + 2,
      alpha: 0.7 + Math.random() * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      type: 'agent',
      targetX: Math.random() * 0.8 + 0.1,
      targetY: 0.82 + Math.random() * 0.08,
    });
  }
  return agents;
}

function createFireflies(count: number): Particle[] {
  const fireflies: Particle[] = [];
  for (let i = 0; i < count; i++) {
    fireflies.push({
      x: Math.random() * 0.8 + 0.1,
      y: 0.6 + Math.random() * 0.3,
      vx: (Math.random() - 0.5) * 0.00008,
      vy: (Math.random() - 0.5) * 0.00005,
      size: 1,
      alpha: 0,
      color: '#ffd76a',
      type: 'firefly',
      glowPhase: Math.random() * Math.PI * 2,
      glowSpeed: Math.random() * 0.003 + 0.001,
    });
  }
  return fireflies;
}

function createHills(): Silhouette[] {
  const hills: Silhouette[] = [];
  // Far hills (3-4)
  const farPositions = [0.0, 0.25, 0.55, 0.8];
  for (const xp of farPositions) {
    hills.push({
      x: xp,
      width: 0.3 + Math.random() * 0.15,
      height: 0.08 + Math.random() * 0.05,
      type: 'hill',
      emergeProgress: 1,
      color: '#0f0f28',
      layer: 0,
    });
  }
  // Mid hills (2)
  hills.push({
    x: 0.1, width: 0.4, height: 0.06 + Math.random() * 0.03,
    type: 'hill', emergeProgress: 1, color: '#151530', layer: 1,
  });
  hills.push({
    x: 0.55, width: 0.45, height: 0.06 + Math.random() * 0.03,
    type: 'hill', emergeProgress: 1, color: '#151530', layer: 1,
  });
  return hills;
}

function createBuildings(): Silhouette[] {
  const buildings: Silhouette[] = [];
  const types: Array<'house' | 'tree' | 'tower'> = ['house', 'tree', 'tower'];
  const count = 15 + Math.floor(Math.random() * 6);
  for (let i = 0; i < count; i++) {
    const t = types[Math.floor(Math.random() * types.length)];
    const h = t === 'tower' ? 0.06 + Math.random() * 0.04
            : t === 'house' ? 0.03 + Math.random() * 0.02
            : 0.04 + Math.random() * 0.03;
    const w = t === 'tower' ? 0.01 + Math.random() * 0.005
            : t === 'house' ? 0.02 + Math.random() * 0.015
            : 0.015 + Math.random() * 0.01;
    buildings.push({
      x: Math.random() * 0.9 + 0.05,
      width: w,
      height: h,
      type: t,
      emergeProgress: 0,
      color: '#0a0a1e',
      layer: 2,
    });
  }
  return buildings;
}

export function createTitleScene(): TitleScene {
  const starCount = 80 + Math.floor(Math.random() * 41);
  const agentCount = 8 + Math.floor(Math.random() * 5);
  const fireflyCount = 10 + Math.floor(Math.random() * 6);

  return {
    particles: [
      ...createStars(starCount),
      ...createAgents(agentCount),
      ...createFireflies(fireflyCount),
    ],
    silhouettes: [...createHills(), ...createBuildings()],
    time: 0,
    phase: 0,
    phaseTime: 0,
    initialized: true,
  };
}

// ---- Update ----

// Phase time thresholds (ms)
const PHASE_THRESHOLDS = [0, 1500, 4000, 7000, 10000];

function computePhase(time: number): number {
  if (time < PHASE_THRESHOLDS[1]) return 0;
  if (time < PHASE_THRESHOLDS[2]) return 1;
  if (time < PHASE_THRESHOLDS[3]) return 2;
  if (time < PHASE_THRESHOLDS[4]) return 3;
  return 4;
}

export function skipToEnd(scene: TitleScene): void {
  scene.time = PHASE_THRESHOLDS[4] + 2000;
  scene.phase = 4;
  scene.phaseTime = 2000;
  // Finalize all silhouettes
  for (const s of scene.silhouettes) {
    s.emergeProgress = 1;
  }
}

export function updateTitleScene(scene: TitleScene, deltaMs: number): void {
  scene.time += deltaMs;
  scene.phase = computePhase(scene.time);
  scene.phaseTime = scene.time - PHASE_THRESHOLDS[Math.min(scene.phase, 4)];

  for (const p of scene.particles) {
    if (p.type === 'star') {
      p.x += p.vx * deltaMs;
      p.y += p.vy * deltaMs;
      p.twinklePhase! += p.twinkleSpeed! * deltaMs;
      p.alpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(p.twinklePhase!));
      // wrap
      if (p.x < 0) p.x = 1;
      if (p.x > 1) p.x = 0;
    } else if (p.type === 'agent') {
      // Only move agents from phase 3 onward
      if (scene.phase >= 3) {
        const dx = p.targetX! - p.x;
        const dy = p.targetY! - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.01) {
          p.targetX = Math.random() * 0.8 + 0.1;
          p.targetY = 0.82 + Math.random() * 0.08;
        } else {
          const speed = 0.00004;
          p.x += (dx / dist) * speed * deltaMs;
          p.y += (dy / dist) * speed * deltaMs;
        }
      }
    } else if (p.type === 'firefly') {
      // Only animate fireflies from phase 3 onward
      if (scene.phase >= 3) {
        p.x += p.vx * deltaMs;
        p.y += p.vy * deltaMs;
        p.glowPhase! += p.glowSpeed! * deltaMs;
        p.alpha = Math.max(0, Math.sin(p.glowPhase!)) * 0.8;
        if (Math.random() < 0.001) {
          p.vx = (Math.random() - 0.5) * 0.00008;
          p.vy = (Math.random() - 0.5) * 0.00005;
        }
        if (p.x < 0.05 || p.x > 0.95) p.vx *= -1;
        if (p.y < 0.55 || p.y > 0.92) p.vy *= -1;
      }
    }
  }

  // Buildings emerge only from phase 2 onward, at 3x speed
  if (scene.phase >= 2) {
    const emergeRate = 0.0003; // 3x original
    for (const s of scene.silhouettes) {
      if (s.type !== 'hill' && s.emergeProgress < 1) {
        s.emergeProgress = Math.min(1, s.emergeProgress + emergeRate * deltaMs);
      }
    }
  }
}

// ---- Render ----

function drawBezierHill(
  ctx: CanvasRenderingContext2D,
  x: number, w: number, h: number,
  baseY: number, canvasW: number, canvasH: number,
  color: string,
) {
  const px = x * canvasW;
  const pw = w * canvasW;
  const ph = h * canvasH;
  const py = baseY;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.bezierCurveTo(
    px + pw * 0.25, py - ph,
    px + pw * 0.75, py - ph,
    px + pw, py,
  );
  ctx.lineTo(px + pw, canvasH);
  ctx.lineTo(px, canvasH);
  ctx.closePath();
  ctx.fill();
}

function drawHouse(
  ctx: CanvasRenderingContext2D,
  cx: number, baseY: number,
  w: number, h: number,
  emerge: number,
  color: string,
) {
  const visH = h * emerge;
  // body
  ctx.fillStyle = color;
  ctx.fillRect(cx - w / 2, baseY - visH * 0.7, w, visH * 0.7);
  // roof triangle
  if (emerge > 0.5) {
    const roofProgress = (emerge - 0.5) * 2;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.6, baseY - visH * 0.7);
    ctx.lineTo(cx, baseY - visH * 0.7 - visH * 0.3 * roofProgress);
    ctx.lineTo(cx + w * 0.6, baseY - visH * 0.7);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  cx: number, baseY: number,
  w: number, h: number,
  emerge: number,
  color: string,
) {
  const visH = h * emerge;
  const trunkW = w * 0.3;
  ctx.fillStyle = color;
  // trunk
  ctx.fillRect(cx - trunkW / 2, baseY - visH * 0.4, trunkW, visH * 0.4);
  // canopy
  if (emerge > 0.3) {
    const canopyProgress = Math.min(1, (emerge - 0.3) / 0.7);
    const r = (w * 1.2) * canopyProgress;
    ctx.beginPath();
    ctx.arc(cx, baseY - visH * 0.4 - r * 0.5, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTower(
  ctx: CanvasRenderingContext2D,
  cx: number, baseY: number,
  w: number, h: number,
  emerge: number,
  color: string,
) {
  const visH = h * emerge;
  ctx.fillStyle = color;
  // body
  ctx.fillRect(cx - w / 2, baseY - visH, w, visH);
  // top
  if (emerge > 0.7) {
    const topProgress = (emerge - 0.7) / 0.3;
    const topW = w * 1.5;
    const topH = h * 0.08 * topProgress;
    ctx.fillRect(cx - topW / 2, baseY - visH - topH, topW, topH);
  }
}

export function renderTitleScene(
  ctx: CanvasRenderingContext2D,
  scene: TitleScene,
  w: number,
  h: number,
): void {
  const { phase, phaseTime } = scene;

  // 1. Background: Phase 0 fades from black to gradient
  const bgAlpha = phase === 0 ? Math.min(1, scene.time / 1500) : 1;
  // Fill black first
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  // Then overlay the gradient with alpha
  ctx.globalAlpha = bgAlpha;
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#050514');
  bgGrad.addColorStop(0.5, '#0a0a20');
  bgGrad.addColorStop(1, '#0d0d28');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  // 2. Stars — Phase 0: gradually reveal; Phase 1+: fully visible
  const starReveal = phase === 0 ? Math.min(1, scene.time / 1500) : 1;
  for (const p of scene.particles) {
    if (p.type !== 'star') continue;
    ctx.globalAlpha = p.alpha * starReveal;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 3. Horizon ambient glow — hidden in Phase 0, fades in Phase 1
  if (phase >= 1) {
    const glowReveal = phase === 1 ? Math.min(1, phaseTime / 1500) : 1;
    const pulseMag = phase >= 4 ? 0.08 : 0.04; // stronger pulse in phase 4
    const pulseAlpha = (0.12 + pulseMag * Math.sin(scene.time * 0.0008)) * glowReveal;
    const glowGrad = ctx.createRadialGradient(
      w * 0.5, h * 0.78, 0,
      w * 0.5, h * 0.78, w * 0.5,
    );
    glowGrad.addColorStop(0, `rgba(90, 60, 180, ${pulseAlpha})`);
    glowGrad.addColorStop(0.5, `rgba(40, 40, 120, ${pulseAlpha * 0.5})`);
    glowGrad.addColorStop(1, 'rgba(10, 10, 30, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);
  }

  // 4. Far hills (layer 0) — hidden in Phase 0, rise in Phase 1
  const groundY = h * 0.85;
  if (phase >= 1) {
    const hillReveal = phase === 1 ? Math.min(1, phaseTime / 2000) : 1;
    for (const s of scene.silhouettes) {
      if (s.layer === 0) {
        drawBezierHill(ctx, s.x, s.width, s.height * hillReveal, groundY - h * 0.05, w, h, s.color);
      }
    }
  }

  // 5. Mid hills (layer 1) — hidden in Phase 0, rise in Phase 1
  if (phase >= 1) {
    const hillReveal = phase === 1 ? Math.min(1, phaseTime / 2000) : 1;
    for (const s of scene.silhouettes) {
      if (s.layer === 1) {
        drawBezierHill(ctx, s.x, s.width, s.height * hillReveal, groundY, w, h, s.color);
      }
    }
  }

  // 6. Agent connection lines — Phase 3+
  const agents = scene.particles.filter(p => p.type === 'agent');
  if (phase >= 3) {
    const lifeReveal = phase === 3 ? Math.min(1, phaseTime / 1500) : 1;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i], b = agents[j];
        const dx = (a.x - b.x) * w;
        const dy = (a.y - b.y) * h;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          const lineAlpha = (1 - dist / 150) * 0.08 * lifeReveal;
          ctx.strokeStyle = `rgba(90, 138, 255, ${lineAlpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x * w, a.y * h);
          ctx.lineTo(b.x * w, b.y * h);
          ctx.stroke();
        }
      }
    }
  }

  // 7. Foreground silhouettes (buildings/trees/towers — layer 2) — Phase 2+
  if (phase >= 2) {
    for (const s of scene.silhouettes) {
      if (s.layer !== 2) continue;
      const cx = s.x * w;
      const bw = s.width * w;
      const bh = s.height * h;
      if (s.type === 'house') {
        drawHouse(ctx, cx, groundY, bw, bh, s.emergeProgress, s.color);
      } else if (s.type === 'tree') {
        drawTree(ctx, cx, groundY, bw, bh, s.emergeProgress, s.color);
      } else if (s.type === 'tower') {
        drawTower(ctx, cx, groundY, bw, bh, s.emergeProgress, s.color);
      }
    }
  }

  // Ground fill below silhouettes — Phase 1+
  if (phase >= 1) {
    const hillReveal = phase === 1 ? Math.min(1, phaseTime / 2000) : 1;
    ctx.globalAlpha = hillReveal;
    ctx.fillStyle = '#0a0a1e';
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.globalAlpha = 1;
  }

  // 8. Agent particles — Phase 3+
  if (phase >= 3) {
    const lifeReveal = phase === 3 ? Math.min(1, phaseTime / 1500) : 1;
    for (const p of agents) {
      ctx.globalAlpha = p.alpha * lifeReveal;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2);
      ctx.fill();
      // small glow
      ctx.globalAlpha = p.alpha * 0.3 * lifeReveal;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.size * 3, 0, Math.PI * 2);
      const agentGlow = ctx.createRadialGradient(
        p.x * w, p.y * h, 0,
        p.x * w, p.y * h, p.size * 3,
      );
      agentGlow.addColorStop(0, p.color);
      agentGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = agentGlow;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 9. Fireflies — Phase 3+
  if (phase >= 3) {
    const lifeReveal = phase === 3 ? Math.min(1, phaseTime / 1500) : 1;
    for (const p of scene.particles) {
      if (p.type !== 'firefly') continue;
      if (p.alpha < 0.05) continue;
      ctx.globalAlpha = p.alpha * lifeReveal;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2);
      ctx.fill();
      // glow
      ctx.globalAlpha = p.alpha * 0.4 * lifeReveal;
      const ffGlow = ctx.createRadialGradient(
        p.x * w, p.y * h, 0,
        p.x * w, p.y * h, 6,
      );
      ffGlow.addColorStop(0, p.color);
      ffGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = ffGlow;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 10. Vignette — stronger in Phase 0
  const vigAlpha = phase === 0 ? 0.6 : 0.4;
  const vigGrad = ctx.createRadialGradient(
    w * 0.5, h * 0.5, w * 0.25,
    w * 0.5, h * 0.5, w * 0.75,
  );
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, `rgba(0,0,0,${vigAlpha})`);
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);
}
