// GTA 6 meme for make.fun's "Post a GTA 6 meme on X" bounty (gta6-meme-x-01).
//
// Node 22, standard library only, no network, no wall clock, no files outside
// the repository: it draws the meme picture (1200x675 PNG) entirely from code
// and writes it to /output/meme.png, and copies POST.json from the repository
// root to /output/POST.json, where the gate reads it. The run is fully
// deterministic: the same input bytes always produce the same output bytes.
//
// The joke: GTA 6 has Bigfoot (Windah Basudara found him live in the swamp),
// and my AI agent already clipped him for money. The make.fun ghost floats
// in the scene holding its magenta star coin, with make.fun written under it.
//
// Outside the grader's container, MAKEFUN_BOT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /bot and /output:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const W = 1200;
const H = 675;

// ---------------------------------------------------------------------------
// Tiny RGB canvas
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const MAGENTA: RGB = [224, 33, 138];
const BODY: RGB = [18, 12, 26]; // Bigfoot / tree silhouette
const TREELINE: RGB = [23, 16, 46];

const px = new Uint8Array(W * H * 3);

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPx(x, y, c);
    }
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(x, y, c);
    }
  }
}

// Thick line: stamp circles along the segment.
function drawLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c);
  }
}

// Scanline polygon fill (even-odd).
function fillPoly(pts: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.ceil(minY); y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      fillRect(Math.round(xs[i]), y, Math.round(xs[i + 1]) - Math.round(xs[i]), 1, c);
    }
  }
}

// Five-pointed star, rotation points up.
function fillStar(cx: number, cy: number, outer: number, inner: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  fillPoly(pts, c);
}

// Four-pointed sparkle: long vertical, short horizontal arms.
function fillSparkle(cx: number, cy: number, long: number, short: number, c: RGB): void {
  fillPoly(
    [
      [cx, cy - long],
      [cx + short, cy - short],
      [cx + long, cy],
      [cx + short, cy + short],
      [cx, cy + long],
      [cx - short, cy + short],
      [cx - long, cy],
      [cx - short, cy - short],
    ],
    c,
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

// ---------------------------------------------------------------------------
// Bitmap font: 5x7, one string per row. '#' is on, '.' is off.
// ---------------------------------------------------------------------------

const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.###.'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##.', '.#...', '.#...', '####.', '.#...', '.#...', '.#...'],
  k: ['.....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '##.#.', '#..##', '#...#', '#...#', '#...#'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
};

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function drawGlyph(ch: string, x: number, y: number, scale: number, c: RGB): void {
  const rows = FONT[ch] ?? FONT['?'];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (rows[r][col] === '#') {
        fillRect(x + col * scale, y + r * scale, scale, scale, c);
      }
    }
  }
}

// Centered text with a thick outline, meme style.
function drawText(text: string, cx: number, y: number, scale: number, fg: RGB, ol: RGB): void {
  const w = textWidth(text, scale);
  const x0 = Math.round(cx - w / 2);
  const d = scale >= 8 ? 4 : scale >= 7 ? 3 : 2;
  const offsets: Array<[number, number]> = [
    [-d, -d],
    [0, -d],
    [d, -d],
    [-d, 0],
    [d, 0],
    [-d, d],
    [0, d],
    [d, d],
  ];
  for (const [dx, dy] of offsets) {
    let x = x0 + dx;
    for (const ch of text) {
      drawGlyph(ch, x, y + dy, scale, ol);
      x += 6 * scale;
    }
  }
  let x = x0;
  for (const ch of text) {
    drawGlyph(ch, x, y, scale, fg);
    x += 6 * scale;
  }
}

// ---------------------------------------------------------------------------
// Scene: Leonida swamp at sunset. Bigfoot wades in the water, the make.fun
// ghost floats at the right holding its magenta star coin.
// ---------------------------------------------------------------------------

const HORIZON = 430;

function drawSky(): void {
  const stops: Array<[number, RGB]> = [
    [0, [36, 27, 77]],
    [0.35, [107, 45, 109]],
    [0.65, [201, 79, 109]],
    [0.85, [240, 138, 75]],
    [1, [255, 196, 107]],
  ];
  for (let y = 0; y < HORIZON; y++) {
    const t = y / HORIZON;
    let c: RGB = stops[stops.length - 1][1];
    for (let i = 0; i + 1 < stops.length; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
        c = mix(stops[i][1], stops[i + 1][1], f);
        break;
      }
    }
    fillRect(0, y, W, 1, c);
  }
}

function drawSun(): void {
  // Glow rings, then the disc.
  fillCircle(330, 390, 120, [242, 163, 94]);
  fillCircle(330, 390, 95, [255, 210, 122]);
  fillCircle(330, 390, 64, [255, 233, 168]);
  // A couple of birds.
  drawLine(650, 140, 662, 132, 3, BODY);
  drawLine(662, 132, 674, 140, 3, BODY);
  drawLine(700, 112, 710, 105, 3, BODY);
  drawLine(710, 105, 720, 112, 3, BODY);
  drawLine(760, 158, 770, 151, 3, BODY);
  drawLine(770, 151, 780, 158, 3, BODY);
}

function drawTreeLine(): void {
  // Jagged distant treeline along the horizon.
  const peaks: Array<[number, number]> = [
    [0, 448], [60, 424], [120, 444], [190, 422], [250, 446], [320, 420],
    [390, 446], [460, 424], [530, 448], [600, 422], [670, 446], [740, 424],
    [810, 448], [880, 422], [950, 446], [1020, 424], [1090, 446], [1150, 426],
    [1200, 446],
  ];
  const pts: Array<[number, number]> = [[0, HORIZON + 24]];
  for (const [x, y] of peaks) pts.push([x, y]);
  pts.push([W, HORIZON + 24]);
  fillPoly(pts, TREELINE);
}

function drawWater(): void {
  for (let y = HORIZON; y < H; y++) {
    const t = (y - HORIZON) / (H - HORIZON);
    fillRect(0, y, W, 1, mix([27, 42, 58], [10, 18, 32], t));
  }
  // Sunset reflection under the sun.
  const streaks: Array<[number, number, number, RGB]> = [
    [292, 455, 60, [217, 138, 74]],
    [318, 455, 90, [176, 106, 53]],
    [352, 455, 55, [217, 138, 74]],
    [305, 520, 45, [176, 106, 53]],
    [338, 520, 70, [217, 138, 74]],
    [322, 580, 40, [176, 106, 53]],
  ];
  for (const [x, y, h, c] of streaks) fillRect(x, y, 12, h, c);
  // Ripples.
  const ripples: Array<[number, number, number]> = [
    [120, 480, 180], [620, 492, 220], [980, 486, 160], [80, 540, 150],
    [700, 552, 240], [1050, 545, 120], [200, 610, 200], [820, 620, 180],
    [40, 650, 160], [560, 648, 200],
  ];
  for (const [x, y, w] of ripples) fillRect(x, y, w, 2, [44, 66, 88]);
}

function drawCypress(x0: number, flip: boolean): void {
  // Trunk and canopy at the frame edge, with hanging moss strands.
  const s = flip ? -1 : 1;
  fillRect(x0, 250, 44, 200, TREELINE);
  fillCircle(x0 + 22, 260, 58, TREELINE);
  fillCircle(x0 - 12, 305, 42, TREELINE);
  fillCircle(x0 + 56, 300, 44, TREELINE);
  const moss: Array<[number, number]> = [
    [8, 42], [26, 30], [44, 48], [62, 26], [80, 38],
  ];
  for (const [dx, len] of moss) {
    const x = flip ? x0 + 88 - dx : x0 + dx;
    drawLine(x, 330, x, 330 + len, 2, TREELINE);
  }
  void s;
}

function drawBigfoot(): void {
  // Legs in the water.
  fillRect(438, 480, 28, 70, BODY);
  fillRect(474, 480, 28, 70, BODY);
  // Splash rings at the waterline.
  fillEllipse(452, 452, 30, 6, [127, 168, 201]);
  fillEllipse(488, 452, 26, 5, [127, 168, 201]);
  fillCircle(428, 438, 4, [127, 168, 201]);
  fillCircle(512, 436, 4, [127, 168, 201]);
  // Arms.
  drawLine(424, 345, 394, 452, 24, BODY);
  drawLine(516, 345, 546, 452, 24, BODY);
  // Torso and head.
  fillEllipse(470, 400, 62, 105, BODY);
  fillCircle(470, 285, 34, BODY);
  // Glowing amber eyes.
  fillCircle(458, 282, 4, [255, 179, 71]);
  fillCircle(482, 282, 4, [255, 179, 71]);
  // Sunset rim light on the right side: a continuous arc, not dots.
  let prevT: [number, number] | null = null;
  let prevH: [number, number] | null = null;
  for (let a = -50; a <= 50; a += 5) {
    const rad = (a * Math.PI) / 180;
    const t: [number, number] = [470 + 62 * Math.cos(rad), 400 + 105 * Math.sin(rad)];
    const h: [number, number] = [470 + 34 * Math.cos(rad), 285 + 34 * Math.sin(rad)];
    if (prevT) drawLine(prevT[0], prevT[1], t[0], t[1], 3, [255, 158, 87]);
    if (prevH) drawLine(prevH[0], prevH[1], h[0], h[1], 3, [255, 158, 87]);
    prevT = t;
    prevH = h;
  }
}

function drawGhost(): void {
  const cx = 930;
  const cy = 280;
  // Black outline, drawn slightly larger and lower, then the white body.
  fillCircle(cx, cy, 75, BLACK);
  fillRect(cx - 75, cy - 5, 150, 95, BLACK);
  fillCircle(cx - 62, cy + 102, 24, BLACK);
  fillCircle(cx, cy + 102, 24, BLACK);
  fillCircle(cx + 62, cy + 102, 24, BLACK);
  fillCircle(cx, cy, 70, WHITE);
  fillRect(cx - 70, cy, 140, 85, WHITE);
  fillCircle(cx - 62, cy + 98, 20, WHITE);
  fillCircle(cx, cy + 98, 20, WHITE);
  fillCircle(cx + 62, cy + 98, 20, WHITE);
  // Two black four-pointed sparkle eyes.
  fillSparkle(cx - 26, cy + 8, 17, 6, BLACK);
  fillSparkle(cx + 26, cy + 8, 17, 6, BLACK);
  // Round little hand, holding the coin.
  fillCircle(cx + 62, cy + 62, 17, BLACK);
  fillCircle(cx + 62, cy + 62, 13, WHITE);
  drawLine(cx + 66, cy + 68, 1006, 372, 10, BLACK);
  drawLine(cx + 66, cy + 68, 1006, 372, 6, WHITE);
  // Magenta coin with a white star.
  fillCircle(1012, 384, 34, BLACK);
  fillCircle(1012, 384, 30, MAGENTA);
  fillStar(1012, 384, 17, 7, WHITE);
  // The name under the ghost.
  drawText('make.fun', cx, 420, 5, WHITE, BLACK);
}

function drawScene(): void {
  drawSky();
  drawSun();
  drawTreeLine();
  drawWater();
  drawCypress(0, false);
  drawCypress(1156, true);
  drawBigfoot();
  drawGhost();
  // Captions.
  drawText('GTA 6 HAS BIGFOOT', 600, 28, 8, WHITE, BLACK);
  drawText('MY AI AGENT ALREADY', 600, 562, 7, WHITE, BLACK);
  drawText('CLIPPED HIM FOR MONEY', 600, 618, 7, WHITE, BLACK);
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGB, filter 0, zlib deflate).
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

drawScene();
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'meme.png'), encodePNG());
try {
  copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
} catch (err) {
  console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
  process.exit(1);
}
console.log(`wrote ${join(OUTPUT_DIR, 'meme.png')} and ${join(OUTPUT_DIR, 'POST.json')}`);
