// GTA 6 meme for make.fun's "Post a GTA 6 meme on X" bounty (gta6-meme-x-01).
//
// Node 22, standard library only, no network, no wall clock, no files outside
// the repository: it draws the meme picture (1200x675 PNG) entirely from code
// and writes it to /output/meme.png, and copies POST.json from the repository
// root to /output/POST.json, where the gate reads it. The run is fully
// deterministic: the same input bytes always produce the same output bytes.
//
// The joke: a WANTED poster for Grand Theft Auto VI itself — six stars (GTA's
// wanted level, and GTA *6*), last seen in 2013, with a $500 reward paid by
// my AI agent on make.fun. The make.fun ghost is the wanted suspect, holding
// its magenta star coin. No other wanted poster is on the live leaderboard:
// it is full of document-style memes (receipts, bills, citations, boarding
// passes), all "13 years late" jokes.
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
const PAPER: RGB = [242, 226, 184]; // aged poster paper
const GOLD: RGB = [255, 196, 40]; // wanted stars
const RED: RGB = [176, 32, 32]; // last-seen / reward lines
const NAVY: RGB = [30, 34, 62]; // mugshot backdrop

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

function outlineOffsets(scale: number): Array<[number, number]> {
  const d = scale >= 8 ? 4 : scale >= 7 ? 3 : 2;
  return [
    [-d, -d],
    [0, -d],
    [d, -d],
    [-d, 0],
    [d, 0],
    [-d, d],
    [0, d],
    [d, d],
  ];
}

// Left-aligned text with a thick outline.
function drawTextLeft(text: string, x0: number, y: number, scale: number, fg: RGB, ol: RGB): void {
  for (const [dx, dy] of outlineOffsets(scale)) {
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

// Centered text with a thick outline, meme style.
function drawText(text: string, cx: number, y: number, scale: number, fg: RGB, ol: RGB): void {
  drawTextLeft(text, Math.round(cx - textWidth(text, scale) / 2), y, scale, fg, ol);
}

// ---------------------------------------------------------------------------
// Scene: a WANTED poster. The make.fun ghost is the suspect, in a mugshot
// frame under six gold wanted stars.
// ---------------------------------------------------------------------------

function drawGhostAt(cx: number, cy: number, s: number): void {
  const R = (v: number): number => v * s;
  // Black outline, drawn slightly larger, then the white body.
  fillCircle(cx, cy, R(75), BLACK);
  fillRect(cx - R(75), cy - R(5), R(150), R(95), BLACK);
  fillCircle(cx - R(62), cy + R(102), R(24), BLACK);
  fillCircle(cx, cy + R(102), R(24), BLACK);
  fillCircle(cx + R(62), cy + R(102), R(24), BLACK);
  fillCircle(cx, cy, R(70), WHITE);
  fillRect(cx - R(70), cy, R(140), R(85), WHITE);
  fillCircle(cx - R(62), cy + R(98), R(20), WHITE);
  fillCircle(cx, cy + R(98), R(20), WHITE);
  fillCircle(cx + R(62), cy + R(98), R(20), WHITE);
  // Two black four-pointed sparkle eyes.
  fillSparkle(cx - R(26), cy + R(8), R(17), R(6), BLACK);
  fillSparkle(cx + R(26), cy + R(8), R(17), R(6), BLACK);
  // Round little hand, holding the coin.
  fillCircle(cx + R(62), cy + R(62), R(17), BLACK);
  fillCircle(cx + R(62), cy + R(62), R(13), WHITE);
  drawLine(cx + R(66), cy + R(68), cx + R(76), cy + R(92), R(10), BLACK);
  drawLine(cx + R(66), cy + R(68), cx + R(76), cy + R(92), R(6), WHITE);
  // Magenta coin with a white star.
  fillCircle(cx + R(82), cy + R(104), R(34), BLACK);
  fillCircle(cx + R(82), cy + R(104), R(30), MAGENTA);
  fillStar(cx + R(82), cy + R(104), R(17), R(7), WHITE);
}

function drawScene(): void {
  // Aged paper.
  fillRect(0, 0, W, H, PAPER);
  // Outer black frame + thin inner frame.
  fillRect(0, 0, W, 14, BLACK);
  fillRect(0, H - 14, W, 14, BLACK);
  fillRect(0, 0, 14, H, BLACK);
  fillRect(W - 14, 0, 14, H, BLACK);
  fillRect(22, 22, W - 44, 2, BLACK);
  fillRect(22, H - 24, W - 44, 2, BLACK);
  fillRect(22, 22, 2, H - 44, BLACK);
  fillRect(W - 24, 22, 2, H - 44, BLACK);

  // Header.
  drawText("LEONIDA COUNTY SHERIFF'S OFFICE", 600, 34, 3, BLACK, PAPER);
  drawText('WANTED', 600, 62, 15, BLACK, PAPER);

  // Six gold wanted stars, one for each GTA.
  const starXs = [200, 360, 520, 680, 840, 1000];
  for (const x of starXs) {
    fillStar(x, 200, 34, 14, BLACK);
    fillStar(x, 200, 28, 12, GOLD);
  }

  // Mugshot frame with the make.fun ghost as the suspect.
  fillRect(440, 240, 320, 216, NAVY);
  fillRect(440, 240, 320, 4, BLACK);
  fillRect(440, 452, 320, 4, BLACK);
  fillRect(440, 240, 4, 216, BLACK);
  fillRect(756, 240, 4, 216, BLACK);
  drawGhostAt(600, 340, 0.9);

  // The charge, the last sighting, the reward.
  drawText('GRAND THEFT AUTO VI', 600, 468, 6, BLACK, PAPER);
  drawText('LAST SEEN: 2013', 600, 520, 5, RED, PAPER);
  drawText('REWARD: $500', 600, 564, 6, RED, PAPER);

  // The payoff line: make.fun in magenta so it cannot be missed.
  const line = 'PAID BY MY AI AGENT ON make.fun';
  const part1 = 'PAID BY MY AI AGENT ON ';
  const scale = 4;
  const x0 = Math.round(600 - textWidth(line, scale) / 2);
  drawTextLeft(part1, x0, 614, scale, BLACK, PAPER);
  drawTextLeft('make.fun', x0 + part1.length * 6 * scale, 614, scale, MAGENTA, PAPER);
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
