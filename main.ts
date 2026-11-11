// Cutest Cat — a program that draws the cutest cat it can, in pure Node 22
// standard library, and writes it to /output/entry.png.
//
// A small software renderer (supersampled SDF shapes, analytic
// anti-aliasing) draws a storybook ginger kitten: big round head tilted to
// one side, huge sparkling eyes, a little pink nose and tongue, a curled
// tail and a ball of yarn at its clumsy oversized paws, on a soft cream
// background. No network, no randomness, no dependencies: two runs write
// byte-identical PNGs.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// PNG encoder (RGB, 8-bit, filter 0), standard library only.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: None
    rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Canvas: an RGB float buffer at SSx supersampling, with SDF shape fills.
// All drawing coordinates are in the final 1024x1024 space.
// ---------------------------------------------------------------------------

const SIZE = 1024;
const SS = 2; // supersample factor
const W = SIZE * SS;

function hex(rgb) {
  return [parseInt(rgb.slice(1, 3), 16), parseInt(rgb.slice(3, 5), 16), parseInt(rgb.slice(5, 7), 16)];
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

class Canvas {
  constructor() {
    this.buf = new Float32Array(W * W * 3);
  }
  // Blend one supersampled pixel.
  px(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= W || y >= W || a <= 0) return;
    const i = (y * W + x) * 3;
    const inv = 1 - a;
    this.buf[i] = r * a + this.buf[i] * inv;
    this.buf[i + 1] = g * a + this.buf[i + 1] * inv;
    this.buf[i + 2] = b * a + this.buf[i + 2] * inv;
  }
  // Vertical linear gradient fill of the whole canvas.
  vgrad(top, bottom) {
    const [tr, tg, tb] = hex(top);
    const [br, bg, bb] = hex(bottom);
    for (let y = 0; y < W; y++) {
      const t = y / (W - 1);
      const r = tr + (br - tr) * t, g = tg + (bg - tg) * t, b = tb + (bb - tb) * t;
      const row = y * W * 3;
      for (let x = 0; x < W; x++) {
        const i = row + x * 3;
        this.buf[i] = r; this.buf[i + 1] = g; this.buf[i + 2] = b;
      }
    }
  }
  // Ellipse (rot in radians) filled with a solid colour or a vertical gradient.
  ellipse(cx, cy, rx, ry, rot, fill, alpha = 1) {
    const [r0, g0, b0] = hex(typeof fill === 'string' ? fill : fill.top);
    const grad = typeof fill === 'object' ? [hex(fill.top), hex(fill.bottom)] : null;
    const gradY = grad && fill.y0 !== undefined ? [fill.y0, fill.y1] : null;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const x0 = Math.max(0, Math.floor((cx - rx - 3) * SS));
    const x1 = Math.min(W - 1, Math.ceil((cx + rx + 3) * SS));
    const y0 = Math.max(0, Math.floor((cy - ry - 3) * SS));
    const y1 = Math.min(W - 1, Math.ceil((cy + ry + 3) * SS));
    const aa = 1.6 / Math.min(rx, ry); // edge width in normalised radius units
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5) / SS - cx, dy = (y + 0.5) / SS - cy;
        const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
        const q = Math.sqrt((lx / rx) ** 2 + (ly / ry) ** 2);
        if (q > 1 + aa) continue;
        const cov = alpha * (1 - smoothstep(1 - aa, 1 + aa, q));
        if (cov <= 0.003) continue;
        let r = r0, g = g0, b = b0;
        if (grad) {
          // Absolute-canvas gradient when y0/y1 are given, so overlapping
          // shapes (body, haunches, legs) shade seamlessly; else local.
          const t = gradY
            ? clamp01(((y + 0.5) / SS - gradY[0]) / (gradY[1] - gradY[0]))
            : clamp01((dy / ry + 1) / 2);
          r = grad[0][0] + (grad[1][0] - grad[0][0]) * t;
          g = grad[0][1] + (grad[1][1] - grad[0][1]) * t;
          b = grad[0][2] + (grad[1][2] - grad[0][2]) * t;
        }
        this.px(x, y, r, g, b, cov);
      }
    }
  }
  circle(cx, cy, r, fill, alpha = 1) { this.ellipse(cx, cy, r, r, 0, fill, alpha); }
  // Ellipse outline: a band around the normalised radius 1.
  ellipseStroke(cx, cy, rx, ry, rot, width, colour, alpha = 1) {
    const [r, g, b] = hex(colour);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const x0 = Math.max(0, Math.floor((cx - rx - width) * SS));
    const x1 = Math.min(W - 1, Math.ceil((cx + rx + width) * SS));
    const y0 = Math.max(0, Math.floor((cy - ry - width) * SS));
    const y1 = Math.min(W - 1, Math.ceil((cy + ry + width) * SS));
    const edge = 1.4 / Math.min(rx, ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5) / SS - cx, dy = (y + 0.5) / SS - cy;
        const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
        const q = Math.sqrt((lx / rx) ** 2 + (ly / ry) ** 2);
        const dist = Math.abs(q - 1) * Math.min(rx, ry);
        const cov = alpha * (1 - smoothstep(width / 2 - 1.2, width / 2 + 1.2, dist));
        if (cov <= 0.003) continue;
        this.px(x, y, r, g, b, cov);
      }
    }
  }
  // Filled polygon (SDF, rounded joins via an under-stroke when `round` > 0).
  polygon(points, fill, alpha = 1, round = 0) {
    const [r, g, b] = hex(fill);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const [x, y] of points) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (round > 0) {
      const closed = [...points, points[0]];
      this.stroke(closed, round * 2, fill, alpha);
    }
    const n = points.length;
    const x0 = Math.max(0, Math.floor((minX - 3) * SS));
    const x1 = Math.min(W - 1, Math.ceil((maxX + 3) * SS));
    const y0 = Math.max(0, Math.floor((minY - 3) * SS));
    const y1 = Math.min(W - 1, Math.ceil((maxY + 3) * SS));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) / SS, py = (y + 0.5) / SS;
        let d = Infinity, s = 1;
        for (let i = 0, j = n - 1; i < n; j = i, i++) {
          const [ix, iy] = points[i], [jx, jy] = points[j];
          const ex = jx - ix, ey = jy - iy;
          const wx = px - ix, wy = py - iy;
          const t = clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey));
          const bx = wx - ex * t, by = wy - ey * t;
          d = Math.min(d, bx * bx + by * by);
          const c1 = py >= iy, c2 = py < jy, c3 = ex * wy > ey * wx;
          if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s *= -1;
        }
        const dist = s * Math.sqrt(d);
        const cov = alpha * (1 - smoothstep(-1.2, 1.2, dist));
        if (cov <= 0.003) continue;
        this.px(x, y, r, g, b, cov);
      }
    }
  }
  // Polyline stroke with round caps/joins: distance to segments.
  stroke(points, width, colour, alpha = 1) {
    const [r, g, b] = hex(colour);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const [x, y] of points) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const hw = width / 2 + 2;
    const x0 = Math.max(0, Math.floor((minX - hw) * SS));
    const x1 = Math.min(W - 1, Math.ceil((maxX + hw) * SS));
    const y0 = Math.max(0, Math.floor((minY - hw) * SS));
    const y1 = Math.min(W - 1, Math.ceil((maxY + hw) * SS));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) / SS, py = (y + 0.5) / SS;
        let d2 = Infinity;
        for (let i = 0; i < points.length - 1; i++) {
          const [ax, ay] = points[i], [bx, by] = points[i + 1];
          const ex = bx - ax, ey = by - ay;
          const t = clamp01(((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey));
          const dx = px - (ax + ex * t), dy = py - (ay + ey * t);
          d2 = Math.min(d2, dx * dx + dy * dy);
        }
        const dist = Math.sqrt(d2);
        const cov = alpha * (1 - smoothstep(width / 2 - 1.2, width / 2 + 1.2, dist));
        if (cov <= 0.003) continue;
        this.px(x, y, r, g, b, cov);
      }
    }
  }
  // Tapered stroke: circles of shrinking radius along a polyline, so a tail
  // is thick at its base and round-tipped at its end.
  taperedStroke(points, w0, w1, colour, alpha = 1) {
    const [r, g, b] = hex(colour);
    const total = points.length - 1;
    for (let i = 0; i <= total; i++) {
      const t = i / total;
      const w = (w0 + (w1 - w0) * t) / 2;
      const [cx, cy] = points[i];
      const x0 = Math.max(0, Math.floor((cx - w - 1) * SS));
      const x1 = Math.min(W - 1, Math.ceil((cx + w + 1) * SS));
      const y0 = Math.max(0, Math.floor((cy - w - 1) * SS));
      const y1 = Math.min(W - 1, Math.ceil((cy + w + 1) * SS));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = (x + 0.5) / SS - cx, dy = (y + 0.5) / SS - cy;
          const q = Math.sqrt(dx * dx + dy * dy) / w;
          if (q > 1.05) continue;
          const cov = alpha * (1 - smoothstep(0.92, 1.05, q));
          if (cov <= 0.003) continue;
          this.px(x, y, r, g, b, cov);
        }
      }
    }
  }
  // Downsample SSx -> 1x and return an RGB Buffer.
  toRGB() {
    const out = Buffer.alloc(SIZE * SIZE * 3);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const i = ((y * SS + sy) * W + x * SS + sx) * 3;
            r += this.buf[i]; g += this.buf[i + 1]; b += this.buf[i + 2];
          }
        }
        const o = (y * SIZE + x) * 3, n = SS * SS;
        out[o] = Math.round(clamp01(r / n / 255) * 255);
        out[o + 1] = Math.round(clamp01(g / n / 255) * 255);
        out[o + 2] = Math.round(clamp01(b / n / 255) * 255);
      }
    }
    return out;
  }
}

// Quadratic bezier sampled to a polyline.
function quad(p0, p1, p2, steps = 24) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
              u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const FUR = '#f2a24b';
const FUR_DARK = '#dd8731';
const FUR_LIGHT = '#f9be6e';
const CREAM = '#fff3dc';
const STRIPE = '#d97e2b';
const PINK = '#f7a8b8';
const NOSE = '#e86a7a';
const TONGUE = '#f28b9b';
const OUTLINE = '#7a4a21';
const WHISKER = '#8a5a30';
const IRIS = '#2fa08c';
const IRIS_DARK = '#1f7a68';

// ---------------------------------------------------------------------------
// The cat
// ---------------------------------------------------------------------------

function drawCat(cv) {
  // Soft cream background, warm at the edges, with a pale halo behind the cat.
  cv.vgrad('#fff9ee', '#f6dfb8');
  cv.circle(512, 500, 430, '#ffefd2', 0.55);
  cv.circle(512, 500, 330, '#fff6e2', 0.45);

  // Soft floor shadow.
  cv.ellipse(512, 892, 330, 42, 0, '#b98a5a', 0.16);
  cv.ellipse(512, 888, 260, 32, 0, '#b98a5a', 0.16);

  // ---- Tail: curled up the right side, behind the body, tapering to a
  // round tip. ----
  const tail = quad([690, 800], [830, 810], [872, 690], 20)
    .concat(quad([872, 690], [878, 606], [806, 578], 20).slice(1));
  cv.taperedStroke(tail, 48, 26, FUR);
  // Tail stripes.
  cv.stroke(quad([742, 812], [758, 786], [742, 762], 8), 12, STRIPE, 0.85);
  cv.stroke(quad([812, 786], [838, 758], [830, 726], 8), 12, STRIPE, 0.85);
  cv.stroke(quad([856, 700], [870, 668], [854, 642], 8), 11, STRIPE, 0.85);

  // ---- Body: sitting, haunches wide, chest cream. One shared gradient
  // (absolute y) so the pieces shade as a single body. ----
  const BODY_GRAD = { top: FUR_LIGHT, bottom: FUR, y0: 525, y1: 915 };
  cv.ellipse(512, 720, 235, 195, 0, BODY_GRAD, 1);
  cv.ellipse(330, 795, 112, 96, 0.25, BODY_GRAD, 1);
  cv.ellipse(694, 795, 112, 96, -0.25, BODY_GRAD, 1);
  cv.ellipse(512, 705, 132, 152, 0, CREAM, 1);
  cv.ellipseStroke(512, 720, 235, 195, 0, 5, OUTLINE, 0.28);

  // Hind paws with toe lines, set a little lower and wider than the front
  // paws so the two pairs read separately.
  cv.ellipse(352, 874, 82, 42, -0.08, CREAM, 1);
  cv.ellipse(672, 874, 82, 42, 0.08, CREAM, 1);
  cv.ellipseStroke(352, 874, 82, 42, -0.08, 4, '#e8cfa5', 0.9);
  cv.ellipseStroke(672, 874, 82, 42, 0.08, 4, '#e8cfa5', 0.9);
  cv.stroke([[338, 858], [338, 882]], 5, '#e8cfa5', 0.9);
  cv.stroke([[366, 858], [366, 882]], 5, '#e8cfa5', 0.9);
  cv.stroke([[658, 858], [658, 882]], 5, '#e8cfa5', 0.9);
  cv.stroke([[686, 858], [686, 882]], 5, '#e8cfa5', 0.9);

  // Front legs and clumsy oversized paws.
  cv.stroke([[442, 640], [445, 826]], 64, FUR, 1);
  cv.stroke([[582, 640], [579, 826]], 64, FUR, 1);
  cv.ellipse(445, 852, 64, 40, -0.06, CREAM, 1);
  cv.ellipse(579, 852, 64, 40, 0.06, CREAM, 1);
  cv.ellipseStroke(445, 852, 64, 40, -0.06, 4, '#e8cfa5', 0.9);
  cv.ellipseStroke(579, 852, 64, 40, 0.06, 4, '#e8cfa5', 0.9);
  cv.stroke([[432, 842], [432, 868]], 5, '#e8cfa5', 0.9);
  cv.stroke([[458, 842], [458, 868]], 5, '#e8cfa5', 0.9);
  cv.stroke([[566, 842], [566, 868]], 5, '#e8cfa5', 0.9);
  cv.stroke([[592, 842], [592, 868]], 5, '#e8cfa5', 0.9);

  // ---- Head group: everything rotates a little around the neck, the tilt
  // that makes the kitten look curious. ----
  const PIVOT = [512, 575];
  const ANG = -0.17; // radians, head tilts to the viewer's left
  const cos = Math.cos(ANG), sin = Math.sin(ANG);
  const T = ([x, y]) => {
    const dx = x - PIVOT[0], dy = y - PIVOT[1];
    return [PIVOT[0] + dx * cos - dy * sin, PIVOT[1] + dx * sin + dy * cos];
  };
  const E = (cx, cy, rx, ry, rot, fill, alpha = 1) =>
    cv.ellipse(...T([cx, cy]), rx, ry, rot + ANG, fill, alpha);
  const C = (cx, cy, r, fill, alpha = 1) => E(cx, cy, r, r, 0, fill, alpha);
  const S = (pts, w, col, alpha = 1) => cv.stroke(pts.map(T), w, col, alpha);

  // Ears (outer ginger, inner pink), slightly asymmetric for charm.
  cv.polygon([T([338, 305]), T([392, 148]), T([472, 262])], FUR, 1, 14);
  cv.polygon([T([686, 305]), T([632, 148]), T([552, 262])], FUR, 1, 14);
  cv.polygon([T([372, 272]), T([398, 192]), T([446, 252])], PINK, 1, 10);
  cv.polygon([T([652, 272]), T([626, 192]), T([578, 252])], PINK, 1, 10);

  // Head: big and round, lighter on top.
  E(512, 388, 218, 202, 0, { top: FUR_LIGHT, bottom: FUR }, 1);
  cv.ellipseStroke(...T([512, 388]), 218, 202, ANG, 5, OUTLINE, 0.25);

  // Forehead stripes, on the forehead itself, following the head's curve.
  S(quad([466, 252], [474, 232], [490, 226], 8), 15, STRIPE, 0.9);
  S(quad([512, 244], [512, 224], [512, 222], 8), 15, STRIPE, 0.9);
  S(quad([558, 252], [550, 232], [534, 226], 8), 15, STRIPE, 0.9);
  // Cheek stripes.
  S(quad([322, 420], [342, 414], [356, 402], 8), 11, STRIPE, 0.8);
  S(quad([330, 452], [348, 448], [360, 438], 8), 11, STRIPE, 0.8);
  S(quad([702, 420], [682, 414], [668, 402], 8), 11, STRIPE, 0.8);
  S(quad([694, 452], [676, 448], [664, 438], 8), 11, STRIPE, 0.8);

  // Blush.
  E(382, 472, 36, 21, -0.15, '#f6a8a0', 0.5);
  E(642, 468, 36, 21, 0.15, '#f6a8a0', 0.5);

  // Eyes: huge, bright, sparkling. White, teal iris, pupil, two highlights.
  for (const [ex, ey] of [[424, 368], [604, 362]]) {
    E(ex, ey, 57, 69, 0, '#ffffff', 1);
    E(ex, ey + 8, 37, 37, 0, IRIS, 1);
    E(ex, ey + 8, 26, 26, 0, IRIS_DARK, 0.55);
    E(ex, ey + 8, 18, 20, 0, '#1b1b1b', 1);
    E(ex - 13, ey - 8, 13, 13, 0, '#ffffff', 1);
    E(ex + 13, ey + 22, 6, 6, 0, '#ffffff', 0.95);
  }

  // Muzzle, nose, mouth and a tiny peeking tongue.
  E(480, 470, 48, 34, 0, CREAM, 1);
  E(544, 470, 48, 34, 0, CREAM, 1);
  cv.polygon([T([488, 430]), T([536, 430]), T([512, 462])], NOSE, 1, 8);
  E(504, 440, 6, 4, -0.3, '#ffffff', 0.7);
  S(quad([512, 466], [500, 486], [480, 490], 10), 6, OUTLINE, 0.85);
  S(quad([512, 466], [524, 486], [544, 490], 10), 6, OUTLINE, 0.85);
  E(512, 502, 15, 19, 0, TONGUE, 1);

  // Whiskers.
  for (const dir of [-1, 1]) {
    const bx = 512 + dir * 108;
    S(quad([bx, 452], [bx + dir * 60, 438], [bx + dir * 118, 424], 12), 5, WHISKER, 0.75);
    S(quad([bx, 474], [bx + dir * 62, 474], [bx + dir * 122, 470], 12), 5, WHISKER, 0.75);
    S(quad([bx, 494], [bx + dir * 58, 508], [bx + dir * 114, 528], 12), 5, WHISKER, 0.75);
  }

  // ---- Ball of yarn by the right paw, string curling to the paw. ----
  cv.stroke(quad([742, 838], [690, 880], [612, 868], 20), 7, '#c05a52', 1);
  cv.circle(798, 842, 58, '#d95f57', 1);
  cv.ellipse(798, 842, 58, 58, 0, { top: '#e87a6e', bottom: '#c94f47' }, 0.6);
  cv.stroke(quad([748, 812], [790, 830], [836, 816], 16), 8, '#b84a44', 0.8);
  cv.stroke(quad([744, 852], [792, 868], [842, 852], 16), 8, '#b84a44', 0.8);
  cv.stroke(quad([760, 884], [800, 892], [836, 880], 16), 8, '#b84a44', 0.8);
}

// ---------------------------------------------------------------------------

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const cv = new Canvas();
drawCat(cv);
const png = encodePNG(SIZE, SIZE, cv.toRGB());
writeFileSync(join(outDir, 'entry.png'), png);
console.log(`wrote ${join(outDir, 'entry.png')} (${png.length} bytes, ${SIZE}x${SIZE})`);
