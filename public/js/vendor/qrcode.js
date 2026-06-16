// Minimal QR Code generator (byte mode, error-correction level M, auto version).
// Vendored, dependency-free, MIT-style. Exposes generate(text) -> boolean[][] matrix.
// Adapted to a small ES module for Bevane's "My QR" profile feature.
//
// Supports versions 1..10 (up to ~150 bytes at ECC level M) which is ample for a
// `bevane:user/<uuid>` string. Renders via toCanvas() / toSvg() helpers.

/* ---- Galois field (GF(256)) tables for Reed-Solomon ---- */
const EXP = new Array(512);
const LOG = new Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

function rsGenPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}
function rsEncode(data, ecCount) {
  const gen = rsGenPoly(ecCount);
  const res = new Array(ecCount).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let i = 0; i < gen.length; i++) res[i] ^= gfMul(gen[i], factor);
    }
  }
  return res;
}

/* ---- Version capacity (ECC level M), byte-mode data codewords + EC params ---- */
// [version]: { totalCodewords, ecPerBlock, group1Blocks, group1DataCw, group2Blocks, group2DataCw }
const VERSIONS = {
  1:  { ec: 10, g1: 1, d1: 16, g2: 0, d2: 0 },
  2:  { ec: 16, g1: 1, d1: 28, g2: 0, d2: 0 },
  3:  { ec: 26, g1: 1, d1: 44, g2: 0, d2: 0 },
  4:  { ec: 18, g1: 2, d1: 32, g2: 0, d2: 0 },
  5:  { ec: 24, g1: 2, d1: 43, g2: 0, d2: 0 },
  6:  { ec: 16, g1: 4, d1: 27, g2: 0, d2: 0 },
  7:  { ec: 18, g1: 4, d1: 31, g2: 0, d2: 0 },
  8:  { ec: 22, g1: 2, d1: 38, g2: 2, d2: 39 },
  9:  { ec: 22, g1: 3, d1: 36, g2: 2, d2: 37 },
  10: { ec: 26, g1: 4, d1: 43, g2: 1, d2: 44 },
};
function dataCapacity(v) {
  const s = VERSIONS[v];
  return s.g1 * s.d1 + s.g2 * s.d2;
}

/* ---- Alignment pattern centers per version ---- */
const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/* ---- BCH format/version info ---- */
function bchFormat(data) {
  let d = data << 10;
  const g = 0x537;
  while ((Math.floor(Math.log2(d)) || 0) >= 10 && d >= 0x400) {
    d ^= g << (Math.floor(Math.log2(d)) - 10);
  }
  return ((data << 10) | d) ^ 0x5412;
}

function buildMatrix(text) {
  const bytes = new TextEncoder().encode(text);

  // pick smallest version that fits (byte mode, ECC M)
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const lenBits = v >= 10 ? 16 : 8;
    const needBits = 4 + lenBits + bytes.length * 8;
    if (needBits <= dataCapacity(v) * 8) { version = v; break; }
  }
  if (!version) throw new Error('QR content too long');

  const spec = VERSIONS[version];
  const totalData = dataCapacity(version);
  const lenBits = version >= 10 ? 16 : 8;

  // ---- bitstream ----
  const bits = [];
  const pushBits = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  pushBits(0b0100, 4); // byte mode
  pushBits(bytes.length, lenBits);
  for (const b of bytes) pushBits(b, 8);
  // terminator
  const capBits = totalData * 8;
  for (let i = 0; i < 4 && bits.length < capBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  // pad bytes
  const padBytes = [0xec, 0x11];
  let pi = 0;
  while (bits.length < capBits) { pushBits(padBytes[pi % 2], 8); pi++; }

  // bits -> data codewords
  const dataCw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataCw.push(b);
  }

  // ---- split into blocks, compute EC ----
  const blocks = [];
  let idx = 0;
  for (let i = 0; i < spec.g1; i++) { blocks.push(dataCw.slice(idx, idx + spec.d1)); idx += spec.d1; }
  for (let i = 0; i < spec.g2; i++) { blocks.push(dataCw.slice(idx, idx + spec.d2)); idx += spec.d2; }
  const ecBlocks = blocks.map((b) => rsEncode(b, spec.ec));

  // interleave data
  const finalCw = [];
  const maxData = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) finalCw.push(b[i]);
  for (let i = 0; i < spec.ec; i++) for (const eb of ecBlocks) finalCw.push(eb[i]);

  // ---- module matrix ----
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  function placeFinder(r, c) {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const inSq = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const ring = (dr === 0 || dr === 6 || dc === 0 || dc === 6);
      const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      m[rr][cc] = inSq && (ring || core) ? 1 : 0;
      reserved[rr][cc] = true;
    }
  }
  placeFinder(0, 0); placeFinder(0, size - 7); placeFinder(size - 7, 0);

  // timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) { m[6][i] = i % 2 === 0 ? 1 : 0; reserved[6][i] = true; }
    if (!reserved[i][6]) { m[i][6] = i % 2 === 0 ? 1 : 0; reserved[i][6] = true; }
  }

  // alignment patterns
  const centers = ALIGN[version];
  for (const r of centers) for (const c of centers) {
    if (reserved[r][c]) continue; // skip overlaps with finders
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr, cc = c + dc;
      const edge = Math.max(Math.abs(dr), Math.abs(dc));
      m[rr][cc] = (edge === 2 || edge === 0) ? 1 : 0;
      reserved[rr][cc] = true;
    }
  }

  // dark module
  m[size - 8][8] = 1; reserved[size - 8][8] = true;

  // reserve format info areas
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { reserved[8][i] = true; reserved[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) { reserved[8][size - 1 - i] = true; reserved[size - 1 - i][8] = true; }

  // ---- place data with zig-zag, applying mask 0 ----
  let bitIdx = 0;
  const dataBits = [];
  for (const cw of finalCw) for (let i = 7; i >= 0; i--) dataBits.push((cw >> i) & 1);

  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip timing column
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        let bit = bitIdx < dataBits.length ? dataBits[bitIdx] : 0;
        bitIdx++;
        // mask 0: (row + col) % 2 === 0
        if ((row + cc) % 2 === 0) bit ^= 1;
        m[row][cc] = bit;
      }
    }
    upward = !upward;
  }

  // ---- format info (ECC level M = 0b00, mask 0 = 0b000) ----
  const fmt = bchFormat((0b00 << 3) | 0b000);
  const fmtBits = [];
  for (let i = 14; i >= 0; i--) fmtBits.push((fmt >> i) & 1);

  // place 15 format bits (f[0] = MSB) at the two standard copies.
  const place = (r, c, b) => { m[r][c] = b === 1; };
  const f = fmtBits; // f[0]..f[14], f[0] is the MSB (bit 14)

  // Copy 1 (around top-left finder):
  // bits 0..5 -> (8, 0..5) skipping col 6
  for (let i = 0; i <= 5; i++) place(8, i, f[i]);
  place(8, 7, f[6]);
  place(8, 8, f[7]);
  place(7, 8, f[8]);
  // bits 9..14 -> (5..0, 8)
  for (let i = 9; i <= 14; i++) place(14 - i, 8, f[i]);

  // Copy 2 (split across top-right + bottom-left):
  // bits 0..7 -> (size-1 .. size-8, 8)  bottom-left vertical
  for (let i = 0; i <= 7; i++) place(size - 1 - i, 8, f[i]);
  // bits 8..14 -> (8, size-7 .. size-1) top-right horizontal
  for (let i = 8; i <= 14; i++) place(8, size - 15 + i, f[i]);

  // convert to boolean
  return m.map((row) => row.map((v) => v === 1));
}

export function generate(text) {
  return buildMatrix(String(text || ''));
}

export function toCanvas(canvas, text, opts = {}) {
  const { scale = 6, margin = 4, dark = '#000000', light = '#ffffff' } = opts;
  const matrix = generate(text);
  const n = matrix.length;
  const dim = (n + margin * 2) * scale;
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (matrix[r][c]) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
  }
  return canvas;
}
