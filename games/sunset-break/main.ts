import { connect, type GameSession } from '@evo/game-sdk';

// ---------------------------------------------------------------- config
const START_BALANCE = 2500;
const BETTING_SECONDS = 6;
const WIPEOUT_SECONDS = 3;
const HISTORY_LENGTH = 16;
const FEED_LENGTH = 40;
const CLIMB_RATE = 0.072;
const BONUS_CLIMB_RATE = 0.205;
const BONUS_CHANCE = 0.58;
const RIDER_BETS = [10, 25, 40, 50, 75, 100, 150] as const;
const HANDLES = [
  'NEON_RAY', 'MALIBU_K', 'DECO_DIVA', 'SALTWATER', 'BISCAYNE', 'TIDE_LORD', 'PALMETTO', 'REEF_RUNNER',
  'VOLTA', 'KIKI_WAVE', 'SUNBURN_87', 'PIER_NINE', 'LAGOON', 'CORAL_JET', 'NIGHTSWIM',
] as const;
const OPENING_HISTORY = [1.42, 2.87, 1.11, 6.3, 1.94, 12.55, 1.28, 3.61, 1.07, 4.42];
const OPENING_FEED = ['LAGOON', 'NEON_RAY', 'BISCAYNE'] as const;
const DARK = '#0b0124';

// Cosmetic noise (spray, lip spit, camera shake, the drum noise buffer) comes from a pool drawn once at
// boot with a fixed count. The frame rate then cannot shift the stream, so the hidden state of wave n
// is a function of the seed and n alone, and "Relaunch" replays the same crash points.
const POOL_SIZE = 32768;
const pool = new Float32Array(POOL_SIZE);
let poolCursor = 0;

function jitter(): number {
  const value = pool[poolCursor] ?? 0;
  poolCursor = (poolCursor + 1) % POOL_SIZE;
  return value;
}

// ---------------------------------------------------------------- types
type Phase = 'betting' | 'riding' | 'wipeout';
type Pt = readonly [number, number];
type Geom = { P0: Pt; P1: Pt; P2: Pt; P3: Pt };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; age: number; c: string };
type Rider = { name: string; bet: number; out: number; done: boolean };
type Fall = {
  bx: number; by: number; br: number; bvx: number; bvy: number; bvr: number;
  rx: number; ry: number; rr: number; rvx: number; rvy: number; rvr: number;
};
type State = {
  phase: Phase;
  round: number;
  t: number;
  mult: number;
  crashAt: number;
  bonusAt: number | null;
  standing: boolean;
  popAt: number;
  popU: number;
  u: number;
  face: number;
  balance: number;
  net: number;
  bet: number;
  auto: number | null;
  staked: number;
  queued: number;
  cashedAt: number | null;
  payout: number;
  history: number[];
  shake: number;
  parts: Particle[];
  riders: Rider[];
  fall: Fall | null;
};

const S: State = {
  phase: 'betting',
  round: 0,
  t: 0,
  mult: 1,
  crashAt: 2,
  bonusAt: null,
  standing: false,
  popAt: 0,
  popU: 0.8,
  u: 0.16,
  face: 1,
  balance: START_BALANCE,
  net: 0,
  bet: 25,
  auto: null,
  staked: 0,
  queued: 0,
  cashedAt: null,
  payout: 0,
  history: [],
  shake: 0,
  parts: [],
  riders: [],
  fall: null,
};

// The single rounding point of the payout math: stake times multiplier, floored once.
function payoutFor(stake: number, mult: number): number {
  return Math.floor(stake * mult);
}

function cycle(list: readonly number[], i: number): number {
  return list[i % list.length] ?? 0;
}

// ---------------------------------------------------------------- dom
function el<T extends HTMLElement>(id: string, ctor: new () => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof ctor)) {
    throw new Error(`#${id} is missing or not a ${ctor.name}`);
  }
  return node;
}

const ui = {
  scene: el('scene', HTMLCanvasElement),
  balance: el('balance', HTMLSpanElement),
  net: el('net', HTMLSpanElement),
  mult: el('mult', HTMLDivElement),
  state: el('state', HTMLDivElement),
  flash: el('flash', HTMLDivElement),
  history: el('history', HTMLDivElement),
  feed: el('feed', HTMLUListElement),
  action: el('action', HTMLButtonElement),
  note: el('note', HTMLParagraphElement),
  bet: el('bet', HTMLInputElement),
  auto: el('auto', HTMLInputElement),
  clearAuto: el('clearAuto', HTMLButtonElement),
  half: el('half', HTMLButtonElement),
  double: el('double', HTMLButtonElement),
  snd: el('snd', HTMLButtonElement),
  sndLabel: el('sndLabel', HTMLSpanElement),
};

const stage = ui.scene.parentElement;
if (stage === null) {
  throw new Error('#scene has no parent to size against');
}
const context2d = ui.scene.getContext('2d');
if (context2d === null) {
  throw new Error('2D canvas is not available');
}
const ctx = context2d;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let W = 0;
let H = 0;
let dpr = 1;

function resize(): void {
  const r = ui.scene.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = r.width;
  H = r.height;
  ui.scene.width = Math.round(W * dpr);
  ui.scene.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(resize).observe(stage);

// ---------------------------------------------------------------- wave face
let waveT = 0;
const horizon = (): number => H * 0.5;

// The face is one cubic bezier: flat through the trough, steepening under the lip.
// The rider's position on it is the curve parameter: u=0 trough, u=1 crest.
function geom(): Geom {
  const grow = Math.min(Math.log(Math.max(S.mult, 1)) * 0.035, 0.07);
  const cy = H * (0.43 - grow);
  return {
    P0: [W * 0.06, H * 0.87],
    P1: [W * 0.28, H * 0.855],
    P2: [W * 0.52, H * 0.75],
    P3: [W * 0.62, cy],
  };
}

function bez(t: number, g: Geom): Pt {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  return [
    a * g.P0[0] + b * g.P1[0] + c * g.P2[0] + d * g.P3[0],
    a * g.P0[1] + b * g.P1[1] + c * g.P2[1] + d * g.P3[1],
  ];
}

function bezD(t: number, g: Geom): Pt {
  const m = 1 - t;
  const a = 3 * m * m;
  const b = 6 * m * t;
  const c = 3 * t * t;
  return [
    a * (g.P1[0] - g.P0[0]) + b * (g.P2[0] - g.P1[0]) + c * (g.P3[0] - g.P2[0]),
    a * (g.P1[1] - g.P0[1]) + b * (g.P2[1] - g.P1[1]) + c * (g.P3[1] - g.P2[1]),
  ];
}

function riderPos(): { x: number; y: number; a: number } {
  const g = geom();
  const t = Math.max(0.02, Math.min(0.88, S.u));
  const p = bez(t, g);
  const d = bezD(t, g);
  const a = Math.max(-0.95, Math.min(0.95, Math.atan2(d[1], d[0])));
  return { x: p[0], y: p[1], a };
}

const scale = (): number => Math.max(0.85, Math.min(1.75, H / 240));

// ---------------------------------------------------------------- scenery
function sky(): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#17053a');
  g.addColorStop(0.26, '#46107a');
  g.addColorStop(0.42, S.standing ? '#c03a86' : '#8e2170');
  g.addColorStop(0.5, S.standing ? '#ff9f1c' : '#ff5c6e');
  g.addColorStop(0.58, '#2b0a52');
  g.addColorStop(1, '#0b0220');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function sun(): void {
  const cx = W * 0.22;
  const cy = H * 0.455;
  const r = Math.min(W * 0.17, H * 0.22);
  ctx.save();
  ctx.globalAlpha = S.standing ? 0.45 : 0.28;
  ctx.filter = 'blur(20px)';
  ctx.fillStyle = '#ff7a2f';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, '#ffe36e');
  g.addColorStop(0.5, '#ff9f1c');
  g.addColorStop(1, '#ff2e88');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = 'rgba(23,5,58,.85)';
  for (let i = 0; i < 9; i += 1) {
    const y = cy - r * 0.12 + i * (r * 0.145);
    ctx.fillRect(cx - r, y, r * 2, Math.max(1.4, r * 0.013 * (i + 1)));
  }
  ctx.restore();
}

const SKYLINE = [0.55, 0.9, 0.35, 0.72, 1, 0.42, 0.62, 0.28, 0.8, 0.5, 0.68, 0.36];

function skyline(): void {
  const base = horizon() + 1;
  const hMax = H * 0.15;
  ctx.fillStyle = 'rgba(20,4,44,.94)';
  let x = -10;
  let i = 0;
  while (x < W) {
    const w = 16 + cycle(SKYLINE, i) * 26;
    const h = hMax * (0.32 + cycle(SKYLINE, i * 3) * 0.68);
    ctx.fillRect(x, base - h, w, h);
    if (cycle(SKYLINE, i) > 0.7) {
      ctx.fillRect(x + w / 2 - 1.5, base - h - hMax * 0.26, 3, hMax * 0.26);
    }
    x += w + 5;
    i += 1;
  }
  ctx.fillStyle = 'rgba(255,159,28,.5)';
  for (let k = 0; k < 30; k += 1) {
    ctx.fillRect((k * 97) % W, base - 6 - ((k * 53) % (hMax * 0.72)), 2, 2);
  }
}

function ocean(): void {
  const hz = horizon();
  const g = ctx.createLinearGradient(0, hz, 0, H);
  g.addColorStop(0, '#2c0a5e');
  g.addColorStop(0.3, '#141048');
  g.addColorStop(1, '#08031f');
  ctx.fillStyle = g;
  ctx.fillRect(0, hz, W, H - hz);

  const sx = W * 0.3;
  ctx.save();
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 14; i += 1) {
    const p = i / 14;
    const y = hz + p * p * (H - hz) * 0.85;
    const w = (12 + p * 96) * (0.6 + 0.4 * Math.sin(waveT * 2 + i));
    ctx.fillStyle = i % 2 ? '#ff9f1c' : '#ff2e88';
    ctx.fillRect(sx - w / 2, y, w, 2);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = S.standing ? 'rgba(255,159,28,.35)' : 'rgba(255,46,136,.3)';
  ctx.lineWidth = 1;
  const spd = S.phase === 'riding' ? (S.standing ? 2.4 : 1.2) : 0.5;
  for (let i = 0; i < 10; i += 1) {
    const p = i / 10 + ((waveT * spd * 0.1) % 0.1);
    const y = hz + Math.pow(p, 2.2) * (H - hz);
    ctx.globalAlpha = 0.12 + p * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

function facePath(): void {
  const g = geom();
  ctx.moveTo(-4, H * 0.9);
  ctx.lineTo(g.P0[0], g.P0[1]);
  ctx.bezierCurveTo(g.P1[0], g.P1[1], g.P2[0], g.P2[1], g.P3[0], g.P3[1]);
}

// The full water body, one definition used for both the fill and the shading clip.
function bodyPath(): void {
  const g = geom();
  const cx = g.P3[0];
  const cy = g.P3[1];
  facePath();
  ctx.bezierCurveTo(cx + W * 0.05, cy + H * 0.09, cx + W * 0.15, H * 0.5, W + 4, H * 0.54);
  ctx.lineTo(W + 4, H + 4);
  ctx.lineTo(-4, H + 4);
  ctx.closePath();
}

function wave(): void {
  const g = geom();
  const cx = g.P3[0];
  const cy = g.P3[1];

  ctx.beginPath();
  bodyPath();
  const wg = ctx.createLinearGradient(0, cy, 0, H);
  wg.addColorStop(0, S.standing ? '#1d9a8c' : '#12729a');
  wg.addColorStop(0.3, '#0f3a72');
  wg.addColorStop(0.74, '#0d1a52');
  wg.addColorStop(1, '#07021c');
  ctx.fillStyle = wg;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  bodyPath();
  ctx.clip();
  const sh = ctx.createRadialGradient(W * 0.36, H * 0.7, 0, W * 0.36, H * 0.7, Math.max(W, H) * 0.46);
  sh.addColorStop(0, S.standing ? 'rgba(255,209,102,.38)' : 'rgba(33,230,193,.34)');
  sh.addColorStop(0.55, 'rgba(33,150,200,.10)');
  sh.addColorStop(1, 'rgba(33,230,193,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, W, H);

  const bg = ctx.createLinearGradient(cx - W * 0.1, 0, W, 0);
  bg.addColorStop(0, 'rgba(8,3,32,0)');
  bg.addColorStop(1, 'rgba(6,1,24,.85)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255,230,199,.45)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 18; i += 1) {
    const t = (i / 18 + waveT * 0.22) % 1;
    const p = bez(t, g);
    const d = bezD(t, g);
    const len = Math.hypot(d[0], d[1]) || 1;
    const off = 8 + (i % 4) * 16;
    const nx = -d[1] / len;
    const ny = d[0] / len;
    ctx.globalAlpha = 0.12 + (i % 3) * 0.13;
    ctx.beginPath();
    ctx.moveTo(p[0] + nx * off, p[1] + ny * off);
    ctx.lineTo(p[0] + nx * off + (d[0] / len) * 30, p[1] + ny * off + (d[1] / len) * 30);
    ctx.stroke();
  }
  ctx.restore();

  const crest = S.standing ? '#ffd166' : '#21e6c1';
  ctx.beginPath();
  facePath();
  ctx.strokeStyle = crest;
  ctx.lineWidth = 2.6;
  ctx.shadowColor = crest;
  ctx.shadowBlur = 15;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.bezierCurveTo(cx + W * 0.015, cy - H * 0.085, cx - W * 0.13, cy - H * 0.085, cx - W * 0.155, cy + H * 0.045);
  ctx.bezierCurveTo(cx - W * 0.115, cy - H * 0.012, cx - W * 0.05, cy + H * 0.004, cx, cy);
  ctx.closePath();
  const lg = ctx.createLinearGradient(cx - W * 0.16, cy - H * 0.05, cx, cy + H * 0.05);
  lg.addColorStop(0, 'rgba(255,230,199,.95)');
  lg.addColorStop(0.5, S.standing ? 'rgba(255,193,110,.9)' : 'rgba(140,244,228,.85)');
  lg.addColorStop(1, 'rgba(20,70,120,.7)');
  ctx.fillStyle = lg;
  ctx.shadowColor = S.standing ? '#ffd166' : '#8ef7e6';
  ctx.shadowBlur = 20;
  ctx.fill();
  ctx.restore();

  if (!reduce && S.phase === 'riding' && jitter() < 0.45) {
    S.parts.push({
      x: cx - W * 0.14,
      y: cy + H * 0.04,
      vx: -(30 + jitter() * 80),
      vy: 20 + jitter() * 70,
      life: 0.8 + jitter() * 0.6,
      age: 0,
      c: '#ffe6c7',
    });
  }
}

const FRONDS: readonly Pt[] = [[-1.35, 56], [-0.85, 68], [-0.35, 52], [0.25, 64], [0.8, 58], [1.3, 46]];

function palms(): void {
  const draw = (bx: number, by: number, s: number, flip: boolean): void => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(flip ? -s : s, s);
    ctx.fillStyle = '#08011c';
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.quadraticCurveTo(5, -72, -7, -142);
    ctx.lineTo(4, -142);
    ctx.quadraticCurveTo(15, -72, 8, 0);
    ctx.closePath();
    ctx.fill();
    for (const [a, len] of FRONDS) {
      ctx.save();
      ctx.translate(0, -142);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.55, -23, len, 6);
      ctx.quadraticCurveTo(len * 0.5, 6, 0, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };
  const s = Math.max(0.5, Math.min(1.05, H / 420));
  draw(W * 0.965, H + 14, s, true);
}

// ---------------------------------------------------------------- the rider
function polyline(points: readonly Pt[], dy: number): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) {
      ctx.moveTo(x, y - dy);
    } else {
      ctx.lineTo(x, y - dy);
    }
  });
}

function limbs(segs: readonly (readonly Pt[])[], w: number, rim: string): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = DARK;
  ctx.lineWidth = w;
  for (const seg of segs) {
    polyline(seg, 0);
    ctx.stroke();
  }
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(1.1, w * 0.26);
  ctx.shadowColor = rim;
  ctx.shadowBlur = 8;
  for (const seg of segs) {
    polyline(seg, w * 0.3);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function poly(pts: readonly Pt[], fill: string, rim: string): void {
  polyline(pts, 0);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function board(rim: string): void {
  ctx.beginPath();
  ctx.moveTo(48, -1);
  ctx.quadraticCurveTo(22, -8, -12, -7);
  ctx.quadraticCurveTo(-40, -6, -48, 0);
  ctx.quadraticCurveTo(-40, 6, -12, 7);
  ctx.quadraticCurveTo(22, 8, 48, -1);
  ctx.closePath();
  ctx.fillStyle = DARK;
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2;
  ctx.shadowColor = rim;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = rim;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(-34, -1.4, 66, 2.2);
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(-33, 5);
  ctx.lineTo(-40, 15);
  ctx.lineTo(-26, 6);
  ctx.closePath();
  ctx.fillStyle = DARK;
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function head(x: number, y: number, r: number, rim: string, dir: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = DARK;
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = rim;
  ctx.shadowBlur = 9;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(x - r * dir * 0.2, y - r * 0.95);
  ctx.quadraticCurveTo(x - r * dir * 2.3, y - r * 1.15, x - r * dir * 2.0, y - r * 0.1);
  ctx.quadraticCurveTo(x - r * dir * 1.2, y - r * 0.55, x - r * dir * 0.6, y - r * 0.8);
  ctx.closePath();
  ctx.fillStyle = DARK;
  ctx.fill();
}

function standRider(rim: string): void {
  const pump = Math.sin(waveT * 2.7) * 2.6;
  const hipY = -25 + pump;
  const shY = -43 + pump;
  limbs(
    [
      [[-17, -4], [-13, -18 + pump], [-3, hipY]],
      [[15, -4], [13, -18 + pump], [-3, hipY]],
      [[-1, shY], [13, shY + 5], [26, shY + 1]],
      [[-3, shY], [-16, shY + 6], [-27, shY + 13]],
    ],
    7.2,
    rim,
  );
  poly([[-7, shY - 3], [8, shY - 2], [5, hipY + 2], [-8, hipY + 1]], DARK, rim);
  ctx.fillStyle = rim;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(-6, shY + 6, 12, 2.6);
  ctx.globalAlpha = 1;
  head(2, shY - 11, 5.8, rim, 1);
  ctx.strokeStyle = 'rgba(255,230,199,.35)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-17, -4);
  ctx.quadraticCurveTo(-30, 4, -42, 1);
  ctx.stroke();
}

function surfer(): void {
  const p = riderPos();
  const k = scale();
  const rim = S.standing ? '#ffd166' : '#ff2e88';

  ctx.save();
  ctx.translate(p.x, p.y);

  if (S.phase === 'wipeout' && S.fall !== null) {
    ctx.save();
    ctx.translate(S.fall.bx, S.fall.by);
    ctx.rotate(S.fall.br);
    ctx.scale(k, k);
    board('#ff2e88');
    ctx.restore();
    ctx.translate(S.fall.rx, S.fall.ry);
    ctx.rotate(S.fall.rr);
    ctx.scale(k, k);
    standRider('#ff2e88');
    ctx.restore();
    return;
  }

  ctx.rotate(p.a + (S.standing ? -0.06 : 0.02));
  let sx = S.face;
  if (Math.abs(sx) < 0.3) {
    sx = 0.3 * (sx < 0 ? -1 : 1);
  }
  ctx.scale(k * sx, k);
  board(rim);
  standRider(rim);
  ctx.restore();

  if (S.phase === 'riding') {
    const n = reduce ? 1 : S.standing ? 5 : 2;
    const dir = S.face < 0 ? -1 : 1;
    const tailX = p.x - Math.cos(p.a) * 44 * k * dir;
    const tailY = p.y - Math.sin(p.a) * 44 * k * dir;
    for (let i = 0; i < n; i += 1) {
      S.parts.push({
        x: tailX,
        y: tailY,
        vx: -dir * (50 + jitter() * 150) * (S.standing ? 1.6 : 0.8),
        vy: -(30 + jitter() * 90),
        life: 0.45 + jitter() * 0.5,
        age: 0,
        c: S.standing ? '#ffd166' : '#8ef7e6',
      });
    }
    if (S.standing && !reduce) {
      ctx.strokeStyle = 'rgba(255,209,102,.3)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 5; i += 1) {
        const ly = p.y - 70 + i * 28;
        const lx = ((waveT * 560 + i * 130) % (W + 240)) - 120;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + 48, ly);
        ctx.stroke();
      }
    }
  }
}

function particles(dt: number): void {
  ctx.save();
  S.parts = S.parts.filter((q) => {
    q.age += dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vy += 200 * dt;
    if (q.age > q.life) {
      return false;
    }
    ctx.globalAlpha = 1 - q.age / q.life;
    ctx.fillStyle = q.c;
    ctx.fillRect(q.x, q.y, 2.6, 2.6);
    return true;
  });
  ctx.restore();
}

function splash(x: number, y: number): void {
  const n = reduce ? 18 : 80;
  for (let i = 0; i < n; i += 1) {
    const a = -Math.PI / 2 + (jitter() - 0.5) * 2.4;
    const sp = 90 + jitter() * 360;
    S.parts.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.7 + jitter() * 0.8,
      age: 0,
      c: jitter() > 0.45 ? '#ffe6c7' : '#ff2e88',
    });
  }
}

// ---------------------------------------------------------------- render
function render(dt: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (S.shake > 0) {
    const m = S.shake * (reduce ? 3 : 12);
    ctx.translate((jitter() - 0.5) * m, (jitter() - 0.5) * m);
    S.shake = Math.max(0, S.shake - dt * 2.2);
  }
  sky();
  sun();
  skyline();
  ocean();
  wave();
  surfer();
  particles(dt);
  palms();

  if (S.phase === 'wipeout' && S.t < 0.4) {
    ctx.fillStyle = `rgba(255,46,136,${0.5 * (1 - S.t / 0.4)})`;
    ctx.fillRect(0, 0, W, H);
  }
  const sc = ctx.createLinearGradient(0, 0, 0, H * 0.42);
  sc.addColorStop(0, 'rgba(9,2,28,.6)');
  sc.addColorStop(1, 'rgba(9,2,28,0)');
  ctx.fillStyle = sc;
  ctx.fillRect(0, 0, W, H * 0.42);

  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.98);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(4,0,14,.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  for (let y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }
}

// ---------------------------------------------------------------- ui
const money = (n: number): string => n.toLocaleString('en-US');
const mult = (m: number): string => `${m.toFixed(2)}x`;

function paint(): void {
  ui.balance.textContent = money(S.balance);
  ui.net.textContent = (S.net >= 0 ? '+' : '') + money(S.net);
  ui.net.className = `v ${S.net > 0 ? 'pos' : S.net < 0 ? 'neg' : ''}`;

  ui.mult.textContent = mult(S.mult);
  ui.mult.className = `mult${S.phase === 'wipeout' ? ' bust' : S.standing ? ' bonus' : ''}`;

  const btn = ui.action;
  btn.className = 'act';
  if (S.phase === 'riding' && S.staked > 0 && S.cashedAt === null) {
    btn.textContent = `Cash out ${money(payoutFor(S.staked, S.mult))}`;
    btn.classList.add('cash');
    btn.disabled = false;
  } else if (S.queued > 0) {
    btn.textContent = S.phase === 'betting' ? 'Waiting · tap to cancel' : 'Queued · tap to cancel';
    btn.classList.add('cancel');
    btn.disabled = false;
  } else {
    btn.textContent = S.phase === 'betting' ? 'Place bet' : 'Bet next wave';
    btn.disabled = S.balance < 1;
  }

  ui.history.replaceChildren(
    ...S.history.map((v) => {
      const s = document.createElement('span');
      s.className = `pip ${v < 2 ? 'low' : v < 5 ? 'mid' : v < 20 ? 'high' : 'epic'}`;
      s.textContent = mult(v);
      return s;
    }),
  );
}

function setState(text: string): void {
  ui.state.textContent = text;
}

function setNote(text: string): void {
  ui.note.textContent = text;
}

let flashTimer: number | null = null;

function flash(text: string, kind: 'up' | 'out' | 'bust', ms: number): void {
  ui.flash.textContent = text;
  ui.flash.className = `flash show ${kind}`;
  if (flashTimer !== null) {
    window.clearTimeout(flashTimer);
  }
  flashTimer = window.setTimeout(() => {
    ui.flash.className = `flash ${kind}`;
  }, ms);
}

function addFeed(who: string, at: number, pay: number, bust: boolean, me: boolean): void {
  const li = document.createElement('li');
  li.className = `${bust ? 'bust ' : ''}${me ? 'me' : ''}`;
  const whoEl = document.createElement('span');
  whoEl.className = 'who';
  whoEl.textContent = who;
  const atEl = document.createElement('span');
  atEl.className = 'at';
  atEl.textContent = mult(at);
  const payEl = document.createElement('span');
  payEl.className = 'pay';
  payEl.textContent = bust ? '—' : `+${money(pay)}`;
  li.append(whoEl, atEl, payEl);
  ui.feed.prepend(li);
  while (ui.feed.children.length > FEED_LENGTH) {
    ui.feed.lastChild?.remove();
  }
}

// ---------------------------------------------------------------- audio
// Original synthwave, generated live: i–VI–III–VII in A minor over a four-on-the-floor kit. It reacts
// to the round: the arp doubles and the filters open when he stands up, the kit drops out on a wipeout.
type Rig = { ac: AudioContext; music: GainNode; sfx: GainNode; drums: GainNode; delay: DelayNode; noise: AudioBuffer };
type Chord = { root: number; tones: readonly number[]; lead: readonly number[] };

const BPM = 104;
const CHORDS: readonly Chord[] = [
  { root: 110.0, tones: [220.0, 261.63, 329.63], lead: [659.25, 523.25, 440.0] },
  { root: 87.31, tones: [174.61, 220.0, 261.63], lead: [523.25, 440.0, 349.23] },
  { root: 130.81, tones: [261.63, 329.63, 392.0], lead: [784.0, 659.25, 523.25] },
  { root: 98.0, tones: [196.0, 246.94, 293.66], lead: [587.33, 493.88, 392.0] },
];

let rig: Rig | null = null;
let audioDead = false;
let musicOn = false;
let step = 0;
let nextBeat = 0;
let musicTimer: number | null = null;

function initAudio(): Rig | null {
  if (rig !== null || audioDead) {
    return rig;
  }
  try {
    const ac = new AudioContext();
    const master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(ac.destination);

    const music = ac.createGain();
    music.gain.value = 0.3;
    music.connect(master);
    const sfx = ac.createGain();
    sfx.gain.value = 0.5;
    sfx.connect(master);
    const drums = ac.createGain();
    drums.gain.value = 0.5;
    drums.connect(music);

    const delay = ac.createDelay(1.5);
    delay.delayTime.value = (60 / BPM) * 0.75;
    const fb = ac.createGain();
    fb.gain.value = 0.34;
    const tame = ac.createBiquadFilter();
    tame.type = 'lowpass';
    tame.frequency.value = 2600;
    delay.connect(fb);
    fb.connect(tame);
    tame.connect(delay);
    delay.connect(music);

    const n = Math.floor(ac.sampleRate * 0.6);
    const noise = ac.createBuffer(1, n, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < n; i += 1) {
      d[i] = (pool[i % POOL_SIZE] ?? 0) * 2 - 1;
    }
    rig = { ac, music, sfx, drums, delay, noise };
  } catch {
    audioDead = true;
  }
  return rig;
}

function voice(
  r: Rig,
  type: OscillatorType,
  freq: number,
  t: number,
  dur: number,
  peak: number,
  f0: number,
  f1: number,
  dest: AudioNode,
  detune = 0,
): void {
  const o = r.ac.createOscillator();
  const g = r.ac.createGain();
  const f = r.ac.createBiquadFilter();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  f.type = 'lowpass';
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(90, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f);
  f.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.04);
}

function noiseHit(r: Rig, t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q = 0): void {
  const s = r.ac.createBufferSource();
  const g = r.ac.createGain();
  const f = r.ac.createBiquadFilter();
  s.buffer = r.noise;
  f.type = type;
  f.frequency.value = freq;
  if (q > 0) {
    f.Q.value = q;
  }
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(r.drums);
  s.start(t);
  s.stop(t + dur + 0.02);
}

function kick(r: Rig, t: number): void {
  const o = r.ac.createOscillator();
  const g = r.ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
  g.gain.setValueAtTime(0.85, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(g);
  g.connect(r.drums);
  o.start(t);
  o.stop(t + 0.26);
}

function snare(r: Rig, t: number): void {
  noiseHit(r, t, 0.16, 0.34, 'bandpass', 1900, 0.9);
  voice(r, 'triangle', 196, t, 0.09, 0.12, 2000, 600, r.drums);
}

function hat(r: Rig, t: number, p: number): void {
  noiseHit(r, t, 0.035, p, 'highpass', 8200);
}

function playStep(r: Rig, i: number, t: number): void {
  const bar = Math.floor(i / 16) % 4;
  const s = i % 16;
  const ch = CHORDS[bar];
  if (ch === undefined) {
    return;
  }
  const riding = S.phase === 'riding';
  const bonus = riding && S.standing;
  const down = S.phase === 'wipeout';

  if (s === 0) {
    const dur = (60 / BPM) * 4;
    ch.tones.forEach((f, k) => {
      voice(r, 'sawtooth', f, t, dur, down ? 0.05 : 0.035, down ? 420 : bonus ? 2400 : 1500, 500, r.music, k * 7 - 7);
    });
  }
  if (down) {
    return;
  }

  if (s % 4 === 0) {
    kick(r, t);
  }
  if (s === 4 || s === 12) {
    snare(r, t);
  }
  if (s % (bonus ? 1 : 2) === 0) {
    hat(r, t, s % 4 === 0 ? 0.05 : 0.085);
  }

  if (s % 2 === 0) {
    const oct = s === 6 || s === 14 ? 2 : 1;
    voice(r, 'sawtooth', ch.root * oct, t, 0.17, 0.3, bonus ? 1000 : 620, 260, r.music);
  }

  if (bonus || s % 2 === 1) {
    const f = cycle(ch.tones, i) * (bonus ? 2 : 1);
    voice(r, 'square', f, t, 0.13, bonus ? 0.1 : 0.055, bonus ? 3800 : 2000, 900, r.delay);
  }

  if (bonus && (s === 0 || s === 6 || s === 10)) {
    voice(r, 'sawtooth', cycle(ch.lead, bar + s), t, 0.42, 0.075, 4200, 1200, r.music, 6);
  }
}

function scheduler(): void {
  if (rig === null || !musicOn) {
    return;
  }
  const spb = 60 / BPM / 4;
  const now = rig.ac.currentTime;
  if (nextBeat < now - 0.25) {
    nextBeat = now + 0.05;
  }
  while (nextBeat < now + 0.12) {
    if (nextBeat > now - 0.05) {
      playStep(rig, step, nextBeat);
    }
    nextBeat += spb;
    step = (step + 1) % 64;
  }
}

function startMusic(): void {
  if (rig === null || musicTimer !== null) {
    return;
  }
  step = 0;
  nextBeat = rig.ac.currentTime + 0.15;
  musicTimer = window.setInterval(scheduler, 25);
}

function stopMusic(): void {
  if (musicTimer !== null) {
    window.clearInterval(musicTimer);
  }
  musicTimer = null;
}

function setSound(on: boolean): void {
  const r = initAudio();
  if (r === null) {
    setNote("Audio isn't available in this browser.");
    return;
  }
  musicOn = on;
  ui.snd.setAttribute('aria-pressed', String(on));
  ui.sndLabel.textContent = on ? 'Music on' : 'Music off';
  if (on) {
    r.ac.resume().then(startMusic, () => undefined);
  } else {
    stopMusic();
  }
}

function tone(freq: number, dur: number, type: OscillatorType): void {
  if (!musicOn || rig === null) {
    return;
  }
  voice(rig, type, freq, rig.ac.currentTime, dur, 0.16, 6000, 900, rig.sfx);
}

ui.snd.addEventListener('click', () => setSound(!musicOn));
document.addEventListener('visibilitychange', () => {
  if (rig === null || !musicOn) {
    return;
  }
  if (document.hidden) {
    stopMusic();
    rig.ac.suspend().then(() => undefined, () => undefined);
  } else {
    rig.ac.resume().then(startMusic, () => undefined);
  }
});

// ---------------------------------------------------------------- game flow shared by frame and input
function standUp(): void {
  S.standing = true;
  S.popAt = S.t;
  S.popU = S.u;
  S.shake = 0.45;
  flash('Dropping in — 3× climb rate', 'up', 1600);
  tone(520, 0.12, 'square');
  window.setTimeout(() => tone(780, 0.14, 'square'), 90);
}

// `at` is the auto cash-out target when it fired, or null for a tap at the current multiplier.
function cashOut(at: number | null): void {
  if (S.staked <= 0 || S.cashedAt !== null) {
    return;
  }
  const m = at ?? S.mult;
  const pay = payoutFor(S.staked, m);
  S.balance += pay;
  S.net += pay - S.staked;
  S.cashedAt = m;
  S.payout = pay;
  addFeed('YOU', m, pay, false, true);
  flash(`Cashed out ${mult(m)} +${money(pay)}`, 'out', 1800);
  tone(660, 0.1, 'triangle');
  window.setTimeout(() => tone(990, 0.16, 'triangle'), 80);
  if (at !== null) {
    setNote(`Auto cash-out fired at ${mult(m)}.`);
  }
  paint();
}

function tickRiders(): void {
  for (const r of S.riders) {
    if (!r.done && S.mult >= r.out) {
      r.done = true;
      addFeed(r.name, r.out, payoutFor(r.bet, r.out), false, false);
    }
  }
}

// ---------------------------------------------------------------- session
function start(session: GameSession): void {
  const { rng } = session;
  for (let i = 0; i < POOL_SIZE; i += 1) {
    pool[i] = rng.next();
  }

  function newCrash(): number {
    const r = rng.next();
    return Math.max(1.06, Math.floor(99 / (1 - r)) / 100);
  }

  // The other riders are simulated: their exits are drawn here, once, together with the crash point.
  function seedRiders(): void {
    const names = rng.shuffle(HANDLES).slice(0, rng.int(5, 8));
    S.riders = names.map((name) => ({
      name,
      bet: RIDER_BETS[rng.int(0, RIDER_BETS.length - 1)] ?? RIDER_BETS[0],
      out: 1.08 + rng.next() * Math.max(0.3, (S.crashAt - 1.08) * (0.35 + rng.next() * 0.75)),
      done: false,
    }));
  }

  // All hidden state of the wave is fixed here, before the ride; the cash-out only indexes into it.
  function startBetting(): void {
    S.phase = 'betting';
    S.t = 0;
    S.mult = 1;
    S.standing = false;
    S.u = 0.14;
    S.face = 1;
    S.fall = null;
    S.crashAt = newCrash();
    S.bonusAt = rng.next() < BONUS_CHANCE ? Math.min(1.45 + rng.next() * 1.9, S.crashAt - 0.05) : null;
    S.cashedAt = null;
    S.payout = 0;
    S.staked = 0;
    seedRiders();
    paint();
  }

  function startRide(): void {
    S.phase = 'riding';
    S.t = 0;
    S.mult = 1;
    S.round += 1;
    S.staked = S.queued;
    S.queued = 0;
    if (S.staked > 0) {
      setNote(`Riding ${money(S.staked)}. Cash out at any moment before the wipeout.`);
    }
    tone(220, 0.06, 'sine');
    paint();
  }

  function wipeout(): void {
    const p = riderPos();
    S.phase = 'wipeout';
    S.t = 0;
    S.shake = 1;
    S.fall = {
      bx: 0, by: 0, br: 0, bvx: -40 - jitter() * 55, bvy: -105 - jitter() * 40, bvr: 3.4,
      rx: 0, ry: 0, rr: 0, rvx: 20 + jitter() * 45, rvy: -95 - jitter() * 45, rvr: -4.6,
    };
    splash(p.x, p.y);
    S.history = [S.crashAt, ...S.history].slice(0, HISTORY_LENGTH);
    if (S.staked > 0 && S.cashedAt === null) {
      S.net -= S.staked;
      addFeed('YOU', S.crashAt, 0, true, true);
      flash(`Wipeout at ${mult(S.crashAt)} — ${money(S.staked)} lost`, 'bust', 2200);
    } else {
      flash(`Wipeout at ${mult(S.crashAt)}`, 'bust', 1800);
    }
    for (const r of S.riders) {
      if (!r.done) {
        addFeed(r.name, S.crashAt, 0, true, false);
      }
    }
    if (S.staked > 0) {
      session.emit('round', {
        round: S.round,
        seed: session.seed,
        stake: S.staked,
        payout: S.payout,
        balance: S.balance,
        crashAt: S.crashAt,
        cashedOutAt: S.cashedAt,
      });
    }
    S.staked = 0;
    tone(150, 0.35, 'sawtooth');
    paint();
  }

  // ---------------------------------------------------------------- controls
  function readBet(): number {
    const raw = Math.floor(Number(ui.bet.value));
    const wanted = Number.isFinite(raw) && raw >= 1 ? raw : 1;
    S.bet = Math.min(wanted, Math.max(1, S.balance + S.queued));
    ui.bet.value = String(S.bet);
    return S.bet;
  }

  function readAuto(): void {
    const v = Number(ui.auto.value);
    S.auto = Number.isFinite(v) && v > 1 ? v : null;
    if (S.auto === null) {
      ui.auto.value = '';
    }
    setNote(S.auto !== null ? `Auto cash-out armed at ${mult(S.auto)}.` : 'Auto cash-out off.');
  }

  ui.bet.addEventListener('change', readBet);
  ui.auto.addEventListener('change', readAuto);
  ui.clearAuto.addEventListener('click', () => {
    ui.auto.value = '';
    S.auto = null;
    setNote('Auto cash-out off.');
  });
  ui.half.addEventListener('click', () => {
    ui.bet.value = String(Math.max(1, Math.floor(readBet() / 2)));
    readBet();
  });
  ui.double.addEventListener('click', () => {
    ui.bet.value = String(readBet() * 2);
    readBet();
  });
  for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-add]')) {
    b.addEventListener('click', () => {
      ui.bet.value = String(readBet() + Number(b.dataset.add ?? 0));
      readBet();
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-auto]')) {
    b.addEventListener('click', () => {
      ui.auto.value = b.dataset.auto ?? '';
      readAuto();
    });
  }

  ui.action.addEventListener('click', () => {
    if (S.phase === 'riding' && S.staked > 0 && S.cashedAt === null) {
      cashOut(null);
      return;
    }
    if (S.queued > 0) {
      S.balance += S.queued;
      S.queued = 0;
      setNote('Bet cancelled — stake returned.');
      paint();
      return;
    }
    const amt = readBet();
    if (S.balance < amt) {
      setNote('Not enough credits for that bet.');
      return;
    }
    S.balance -= amt;
    S.queued = amt;
    setNote(S.phase === 'betting' ? "You're on the next wave." : 'Queued for the next wave.');
    paint();
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      ui.action.click();
    }
  });

  // ---------------------------------------------------------------- loop
  const ease = (t: number): number => t * t * (3 - 2 * t);
  let last = performance.now();

  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    S.t += dt;
    waveT += dt * (S.phase === 'riding' ? (S.standing ? 2.0 : 1.1) : 0.55);

    if (S.phase === 'betting') {
      const left = Math.max(0, BETTING_SECONDS - S.t);
      setState(`Next wave in ${left.toFixed(1)}s`);
      S.u += (0.14 - S.u) * Math.min(1, dt * 2);
      if (left <= 0) {
        startRide();
      }
    } else if (S.phase === 'riding') {
      const rate = S.standing ? BONUS_CLIMB_RATE : CLIMB_RATE;
      S.mult *= Math.exp(rate * dt);
      if (S.bonusAt !== null && !S.standing && S.mult >= S.bonusAt) {
        standUp();
      }
      // A frame can overshoot both the target and the crash point at once; the target counts only
      // when it lies below the crash point, and then pays the target, not the overshoot.
      if (S.staked > 0 && S.cashedAt === null && S.auto !== null && S.auto < S.crashAt && S.mult >= S.auto) {
        cashOut(S.auto);
      }
      tickRiders();

      let target: number;
      if (!S.standing) {
        const span = Math.max(0.4, (S.bonusAt ?? Math.min(S.crashAt, 4.5)) - 1);
        const prog = Math.max(0, Math.min(1, (S.mult - 1) / span));
        target = 0.15 + prog * 0.66;
      } else {
        const st = Math.max(0, S.t - S.popAt);
        const drop = Math.min(1, st / 0.8);
        const base = S.popU + (0.26 - S.popU) * ease(drop);
        const carve = st > 0.8 ? 0.15 + 0.19 * Math.sin((st - 0.8) * 1.75) : 0;
        target = base + carve;
      }
      S.u += (target - S.u) * Math.min(1, dt * (S.standing ? 3.6 : 1.9));
      S.face += ((S.standing ? -1 : 1) - S.face) * Math.min(1, dt * 4.5);

      setState(S.standing ? 'Bonus ride · down the line' : 'Climbing the face');
      if (S.mult >= S.crashAt) {
        S.mult = S.crashAt;
        wipeout();
      }
      paint();
    } else {
      const f = S.fall;
      if (f !== null) {
        f.bx += f.bvx * dt;
        f.by += f.bvy * dt;
        f.bvy += 340 * dt;
        f.br += f.bvr * dt;
        f.rx += f.rvx * dt;
        f.ry += f.rvy * dt;
        f.rvy += 340 * dt;
        f.rr += f.rvr * dt;
      }
      setState('Wipeout — resetting the break');
      if (S.t > WIPEOUT_SECONDS) {
        startBetting();
      }
    }

    render(dt);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- boot
  resize();
  S.history = [...OPENING_HISTORY];
  OPENING_FEED.forEach((name, i) => {
    const at = 1.6 + i * 0.9;
    addFeed(name, at, payoutFor(25 + i * 20, at), false, false);
  });
  startBetting();
  requestAnimationFrame(frame);
}

connect(start);
