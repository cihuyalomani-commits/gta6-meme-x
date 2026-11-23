// GTA 6 meme for make.fun's "Post a GTA 6 meme on X" bounty (gta6-meme-x-01).
//
// Node 22, standard library only, no network, no wall clock, no files outside
// the repository: it draws the meme picture (1200x675 PNG) entirely from code
// and writes it to /output/meme.png, and copies POST.json from the repository
// root to /output/POST.json, where the gate reads it. The run is fully
// deterministic: the same input bytes always produce the same output bytes.
//
// The joke: a VICE CITY BANK mortgage statement for a house in Vice City
// that has been paid for 13 years and still cannot be moved into, because
// GTA VI still is not out. The live leaderboard is dominated by
// document-style memes (receipts, bills, citations, boarding passes, all
// "13 years late" jokes) — a mortgage statement is a document type not on
// it yet, with the same punch: mortgage started 17 Sep 2013, 13 years
// paying, moved in never, balance $0.00 paid by my AI agent on make.fun,
// stamped PAID IN FULL. The make.fun ghost signs the bottom of the sheet.
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

const BLACK: RGB = [0, 0, 0];
const MAGENTA: RGB = [224, 33, 138];
const PAPER: RGB = [250, 246, 234]; // off-white delivery-notice paper
const RED: RGB = [176, 32, 32]; // stamp + standout figures
const NAVY: RGB = [30, 34, 62]; // sheet frame fallback
const GREEN: RGB = [18, 92, 60]; // bank header + sheet frame
const INK: RGB = [25, 25, 25]; // body text
const SLATE: RGB = [35, 41, 56]; // desk background behind the sheet
const GREY: RGB = [96, 96, 96]; // small reference line
const SENTINEL: RGB = [255, 0, 255]; // transparent marker in the stamp buffer

interface Canvas {
  w: number;
  h: number;
  px: Uint8Array;
}

function makeCanvas(w: number, h: number, fill: RGB): Canvas {
  const px = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    px[i * 3] = fill[0];
    px[i * 3 + 1] = fill[1];
    px[i * 3 + 2] = fill[2];
  }
  return { w, h, px };
}

function setPx(cv: Canvas, x: number, y: number, c: RGB): void {
  if (x < 0 || x >= cv.w || y < 0 || y >= cv.h) return;
  const i = (y * cv.w + x) * 3;
  cv.px[i] = c[0];
  cv.px[i + 1] = c[1];
  cv.px[i + 2] = c[2];
}

function fillRect(cv: Canvas, x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(cv.w, Math.ceil(x + w));
  const y1 = Math.min(cv.h, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPx(cv, xx, yy, c);
  }
}

function fillCircle(cv: Canvas, cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPx(cv, x, y, c);
    }
  }
}

// Thick line: stamp circles along the segment.
function drawLine(cv: Canvas, x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    fillCircle(cv, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c);
  }
}

// Scanline polygon fill (even-odd).
function fillPoly(cv: Canvas, pts: Array<[number, number]>, c: RGB): void {
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
      fillRect(cv, Math.round(xs[i]), y, Math.round(xs[i + 1]) - Math.round(xs[i]), 1, c);
    }
  }
}

// Five-pointed star, rotation points up.
function fillStar(cv: Canvas, cx: number, cy: number, outer: number, inner: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  fillPoly(cv, pts, c);
}

// Four-pointed sparkle: long vertical, short horizontal arms.
function fillSparkle(cv: Canvas, cx: number, cy: number, long: number, short: number, c: RGB): void {
  fillPoly(
    cv,
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
};

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function drawGlyph(cv: Canvas, ch: string, x: number, y: number, scale: number, c: RGB): void {
  const rows = FONT[ch] ?? FONT['?'];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (rows[r][col] === '#') {
        fillRect(cv, x + col * scale, y + r * scale, scale, scale, c);
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

// Left-aligned text. With an outline color it gets a thick halo; without one
// it is drawn flat (used for the stamp, where the halo would smear the paper).
function drawTextLeft(
  cv: Canvas,
  text: string,
  x0: number,
  y: number,
  scale: number,
  fg: RGB,
  ol: RGB | null,
): void {
  if (ol !== null) {
    for (const [dx, dy] of outlineOffsets(scale)) {
      let x = x0 + dx;
      for (const ch of text) {
        drawGlyph(cv, ch, x, y + dy, scale, ol);
        x += 6 * scale;
      }
    }
  }
  let x = x0;
  for (const ch of text) {
    drawGlyph(cv, ch, x, y, scale, fg);
    x += 6 * scale;
  }
}

// Centered text with a thick outline.
function drawText(cv: Canvas, text: string, cx: number, y: number, scale: number, fg: RGB, ol: RGB): void {
  drawTextLeft(cv, text, Math.round(cx - textWidth(text, scale) / 2), y, scale, fg, ol);
}

// Centered line made of several colored parts (e.g. a black label and a red
// figure). Outlines for all parts are drawn first so no halo paints over a
// neighbour's letters.
function drawCenteredParts(
  cv: Canvas,
  parts: Array<{ text: string; fg: RGB }>,
  cx: number,
  y: number,
  scale: number,
  ol: RGB,
): void {
  const total = parts.reduce((acc, p) => acc + textWidth(p.text, scale), 0) + (parts.length - 1) * scale;
  let x = Math.round(cx - total / 2);
  for (const [dx, dy] of outlineOffsets(scale)) {
    let px = x + dx;
    for (const p of parts) {
      for (const ch of p.text) {
        drawGlyph(cv, ch, px, y + dy, scale, ol);
        px += 6 * scale;
      }
      px += scale;
    }
  }
  for (const p of parts) {
    for (const ch of p.text) {
      drawGlyph(cv, ch, x, y, scale, p.fg);
      x += 6 * scale;
    }
    x += scale;
  }
}

// ---------------------------------------------------------------------------
// Scene: a VICE CITY BANK mortgage statement. The make.fun ghost signs the sheet.
// ---------------------------------------------------------------------------

function drawGhostAt(cv: Canvas, cx: number, cy: number, s: number): void {
  const R = (v: number): number => v * s;
  // Black outline, drawn slightly larger, then the white body.
  fillCircle(cv, cx, cy, R(75), BLACK);
  fillRect(cv, cx - R(75), cy - R(5), R(150), R(95), BLACK);
  fillCircle(cv, cx - R(62), cy + R(102), R(24), BLACK);
  fillCircle(cv, cx, cy + R(102), R(24), BLACK);
  fillCircle(cv, cx + R(62), cy + R(102), R(24), BLACK);
  fillCircle(cv, cx, cy, R(70), [255, 255, 255]);
  fillRect(cv, cx - R(70), cy, R(140), R(85), [255, 255, 255]);
  fillCircle(cv, cx - R(62), cy + R(98), R(20), [255, 255, 255]);
  fillCircle(cv, cx, cy + R(98), R(20), [255, 255, 255]);
  fillCircle(cv, cx + R(62), cy + R(98), R(20), [255, 255, 255]);
  // Two black four-pointed sparkle eyes.
  fillSparkle(cv, cx - R(26), cy + R(8), R(17), R(6), BLACK);
  fillSparkle(cv, cx + R(26), cy + R(8), R(17), R(6), BLACK);
  // Round little hand, holding the coin.
  fillCircle(cv, cx + R(62), cy + R(62), R(17), BLACK);
  fillCircle(cv, cx + R(62), cy + R(62), R(13), [255, 255, 255]);
  drawLine(cv, cx + R(66), cy + R(68), cx + R(76), cy + R(92), R(10), BLACK);
  drawLine(cv, cx + R(66), cy + R(68), cx + R(76), cy + R(92), R(6), [255, 255, 255]);
  // Magenta coin with a white star.
  fillCircle(cv, cx + R(82), cy + R(104), R(34), BLACK);
  fillCircle(cv, cx + R(82), cy + R(104), R(30), MAGENTA);
  fillStar(cv, cx + R(82), cy + R(104), R(17), R(7), [255, 255, 255]);
}

// The red PAID IN FULL stamp, drawn flat on its own buffer (sentinel =
// transparent) and then blitted rotated onto the sheet.
function makeStamp(): Canvas {
  const SW = 350;
  const SH = 96;
  const st = makeCanvas(SW, SH, SENTINEL);
  // Double border.
  fillRect(st, 0, 0, SW, 3, RED);
  fillRect(st, 0, SH - 3, SW, 3, RED);
  fillRect(st, 0, 0, 3, SH, RED);
  fillRect(st, SW - 3, 0, 3, SH, RED);
  fillRect(st, 7, 7, SW - 14, 2, RED);
  fillRect(st, 7, SH - 9, SW - 14, 2, RED);
  fillRect(st, 7, 7, 2, SH - 14, RED);
  fillRect(st, SW - 9, 7, 2, SH - 14, RED);
  // Two lines, no outline: the stamp ink sits straight on the paper.
  drawTextLeft(st, 'PAID IN FULL', Math.round((SW - textWidth('PAID IN FULL', 4)) / 2), 12, 4, RED, null);
  drawTextLeft(st, 'STILL NO KEYS', Math.round((SW - textWidth('STILL NO KEYS', 2)) / 2), 52, 2, RED, null);
  return st;
}

function blitRotated(cv: Canvas, src: Canvas, cx: number, cy: number, angleDeg: number): void {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hw = (src.w * Math.abs(cos) + src.h * Math.abs(sin)) / 2;
  const hh = (src.w * Math.abs(sin) + src.h * Math.abs(cos)) / 2;
  for (let dy = Math.floor(cy - hh); dy <= Math.ceil(cy + hh); dy++) {
    for (let dx = Math.floor(cx - hw); dx <= Math.ceil(cx + hw); dx++) {
      const rx = dx - cx;
      const ry = dy - cy;
      const sx = Math.round(cos * rx + sin * ry + src.w / 2);
      const sy = Math.round(-sin * rx + cos * ry + src.h / 2);
      if (sx < 0 || sx >= src.w || sy < 0 || sy >= src.h) continue;
      const si = (sy * src.w + sx) * 3;
      if (src.px[si] === SENTINEL[0] && src.px[si + 1] === SENTINEL[1] && src.px[si + 2] === SENTINEL[2]) continue;
      setPx(cv, dx, dy, [src.px[si], src.px[si + 1], src.px[si + 2]]);
    }
  }
}

function drawScene(cv: Canvas): void {
  // Desk background, then the paper sheet.
  fillRect(cv, 0, 0, W, H, SLATE);
  fillRect(cv, 90, 25, 1020, 635, PAPER);
  // Sheet frame: 3px green border + thin inner line.
  fillRect(cv, 90, 25, 1020, 3, GREEN);
  fillRect(cv, 90, 657, 1020, 3, GREEN);
  fillRect(cv, 90, 25, 3, 635, GREEN);
  fillRect(cv, 1107, 25, 3, 635, GREEN);
  fillRect(cv, 102, 37, 996, 1, GREEN);
  fillRect(cv, 102, 648, 996, 1, GREEN);
  fillRect(cv, 102, 37, 1, 612, GREEN);
  fillRect(cv, 1097, 37, 1, 612, GREEN);

  // Header.
  drawText(cv, 'VICE CITY BANK', 600, 52, 7, GREEN, PAPER);
  drawText(cv, 'MORTGAGE STATEMENT', 600, 118, 5, GREEN, PAPER);
  fillRect(cv, 150, 133, 160, 2, GREEN);
  fillRect(cv, 890, 133, 160, 2, GREEN);
  fillRect(cv, 130, 170, 940, 3, GREEN);

  // The statement rows.
  drawText(cv, 'PROPERTY: HOUSE IN VICE CITY', 600, 198, 5, INK, PAPER);
  drawText(cv, 'MORTGAGE STARTED: 17 SEP 2013', 600, 258, 5, INK, PAPER);
  drawText(cv, 'YEARS PAYING: 13', 600, 318, 5, INK, PAPER);
  drawCenteredParts(
    cv,
    [
      { text: 'MOVED IN: ', fg: INK },
      { text: 'NEVER', fg: RED },
    ],
    600,
    378,
    5,
    PAPER,
  );
  drawCenteredParts(
    cv,
    [
      { text: 'BALANCE DUE: ', fg: INK },
      { text: '$0.00', fg: RED },
    ],
    600,
    438,
    5,
    PAPER,
  );
  drawCenteredParts(
    cv,
    [
      { text: 'PAID BY MY AI AGENT ON ', fg: INK },
      { text: 'MAKE.FUN', fg: MAGENTA },
    ],
    600,
    498,
    5,
    PAPER,
  );

  // The make.fun ghost signs the bottom-left of the sheet.
  drawGhostAt(cv, 200, 590, 0.44);

  // Small reference line, bottom-right.
  drawTextLeft(cv, 'ACCT: GTA-VI-2013', 1050 - textWidth('ACCT: GTA-VI-2013', 2), 622, 2, GREY, null);

  // The red stamp, slightly rotated, across the bottom centre.
  blitRotated(cv, makeStamp(), 600, 598, -5);
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

function encodePNG(cv: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const raw = Buffer.alloc(cv.h * (1 + cv.w * 3));
  for (let y = 0; y < cv.h; y++) {
    raw[y * (1 + cv.w * 3)] = 0; // filter: none
    raw.set(cv.px.subarray(y * cv.w * 3, (y + 1) * cv.w * 3), y * (1 + cv.w * 3) + 1);
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

const main = makeCanvas(W, H, SLATE);
drawScene(main);
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'meme.png'), encodePNG(main));
try {
  copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
} catch (err) {
  console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
  process.exit(1);
}
console.log(`wrote ${join(OUTPUT_DIR, 'meme.png')} and ${join(OUTPUT_DIR, 'POST.json')}`);
