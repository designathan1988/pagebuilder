// A PNG read in the core, synchronously, for the app icons the exports draw from the project's own logo (packages.ts):
// the export runs in a command, with no canvas and no await. It reads what an icon or a logo is saved as: 8-bit grey,
// RGB, palette (1, 2, 4 or 8 bits), grey with alpha and RGBA, not interlaced; anything else (16-bit, Adam7) reads as
// null, and the export keeps its drawn initial. Inflate (RFC 1951) is its own: stored, fixed and dynamic blocks.

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  // four bytes a pixel, row by row
  readonly pixels: Uint8Array;
}

// ---- inflate (RFC 1951) ----

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman {
  readonly counts: Uint16Array;
  readonly symbols: Uint16Array;
}

function huffman(lengths: readonly number[]): Huffman {
  const counts = new Uint16Array(16);
  for (const length of lengths) counts[length] = (counts[length] ?? 0) + 1;
  counts[0] = 0;
  const offsets = new Uint16Array(16);
  for (let i = 1; i < 16; i += 1) offsets[i] = (offsets[i - 1] ?? 0) + (counts[i - 1] ?? 0);
  const symbols = new Uint16Array(lengths.length);
  lengths.forEach((length, symbol) => {
    if (length !== 0) {
      symbols[offsets[length] ?? 0] = symbol;
      offsets[length] = (offsets[length] ?? 0) + 1;
    }
  });
  return { counts, symbols };
}

function inflate(data: Uint8Array): Uint8Array | null {
  let at = 0;
  let bit = 0;
  let bits = 0;
  let out = new Uint8Array(Math.max(1024, data.length * 4));
  let size = 0;
  const need = (more: number) => {
    if (size + more <= out.length) return;
    const grown = new Uint8Array(Math.max(out.length * 2, size + more));
    grown.set(out);
    out = grown;
  };
  const read = (count: number): number => {
    while (bits < count) {
      if (at >= data.length) throw new Error('end');
      bit |= (data[at] ?? 0) << bits;
      at += 1;
      bits += 8;
    }
    const value = bit & ((1 << count) - 1);
    bit >>>= count;
    bits -= count;
    return value;
  };
  const decode = (table: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let length = 1; length < 16; length += 1) {
      code |= read(1);
      const count = table.counts[length] ?? 0;
      if (code - count < first) return table.symbols[index + (code - first)] ?? 0;
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error('code');
  };
  const fixedLiteral = huffman([...Array<number>(144).fill(8), ...Array<number>(112).fill(9), ...Array<number>(24).fill(7), ...Array<number>(8).fill(8)]);
  const fixedDistance = huffman(Array<number>(30).fill(5));
  try {
    let last = 0;
    while (last === 0) {
      last = read(1);
      const type = read(2);
      if (type === 0) {
        bit = 0;
        bits = 0;
        const length = (data[at] ?? 0) | ((data[at + 1] ?? 0) << 8);
        at += 4;
        need(length);
        out.set(data.subarray(at, at + length), size);
        size += length;
        at += length;
        continue;
      }
      let literal = fixedLiteral;
      let distance = fixedDistance;
      if (type === 2) {
        const literals = read(5) + 257;
        const distances = read(5) + 1;
        const codes = read(4) + 4;
        const codeLengths = Array<number>(19).fill(0);
        for (let i = 0; i < codes; i += 1) codeLengths[ORDER[i] ?? 0] = read(3);
        const codeTable = huffman(codeLengths);
        const lengths: number[] = [];
        while (lengths.length < literals + distances) {
          const symbol = decode(codeTable);
          if (symbol < 16) lengths.push(symbol);
          else if (symbol === 16) {
            const previous = lengths.at(-1) ?? 0;
            for (let n = read(2) + 3; n > 0; n -= 1) lengths.push(previous);
          } else if (symbol === 17) for (let n = read(3) + 3; n > 0; n -= 1) lengths.push(0);
          else for (let n = read(7) + 11; n > 0; n -= 1) lengths.push(0);
        }
        literal = huffman(lengths.slice(0, literals));
        distance = huffman(lengths.slice(literals));
      } else if (type !== 1) return null;
      for (;;) {
        const symbol = decode(literal);
        if (symbol < 256) {
          need(1);
          out[size] = symbol;
          size += 1;
        } else if (symbol === 256) break;
        else {
          const index = symbol - 257;
          const length = (LENGTH_BASE[index] ?? 0) + read(LENGTH_EXTRA[index] ?? 0);
          const code = decode(distance);
          const back = (DIST_BASE[code] ?? 0) + read(DIST_EXTRA[code] ?? 0);
          if (back > size) return null;
          need(length);
          for (let i = 0; i < length; i += 1) {
            out[size] = out[size - back] ?? 0;
            size += 1;
          }
        }
      }
    }
  } catch {
    // a stream cut short or a code no table holds: not a PNG the reader takes, so the export draws its own icon
    return null;
  }
  return out.subarray(0, size);
}

// ---- PNG ----

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const MAX_SIDE = 4096;

export function readPng(bytes: Uint8Array): RgbaImage | null {
  if (bytes.length < 33 || SIGNATURE.some((byte, i) => bytes[i] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  let interlace = 0;
  let palette: Uint8Array = new Uint8Array();
  let alpha: Uint8Array = new Uint8Array();
  const idat: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = body[8] ?? 0;
      colour = body[9] ?? 0;
      interlace = body[12] ?? 0;
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') alpha = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const channels = CHANNELS[colour];
  if (channels === undefined || interlace !== 0 || width === 0 || height === 0 || width > MAX_SIDE || height > MAX_SIDE) return null;
  if (!(depth === 8 || (colour === 3 && (depth === 1 || depth === 2 || depth === 4)))) return null;
  const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of idat) {
    joined.set(part, offset);
    offset += part.length;
  }
  // a zlib stream: its two-byte header, then the deflate data
  const raw = inflate(joined.subarray(2));
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  if (raw === null || raw.length < (stride + 1) * height) return null;
  const step = Math.max(1, bitsPerPixel >> 3);
  const lines = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= step ? (lines[y * stride + x - step] ?? 0) : 0;
      const b = y > 0 ? (lines[(y - 1) * stride + x] ?? 0) : 0;
      const c = x >= step && y > 0 ? (lines[(y - 1) * stride + x - step] ?? 0) : 0;
      const value = line[x] ?? 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      lines[y * stride + x] = (value + predicted) & 0xff;
    }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const s = y * stride + x * step;
      if (colour === 3) {
        const perByte = 8 / depth;
        const byte = lines[y * stride + Math.floor(x / perByte)] ?? 0;
        const index = (byte >> ((perByte - 1 - (x % perByte)) * depth)) & ((1 << depth) - 1);
        pixels.set([palette[index * 3] ?? 0, palette[index * 3 + 1] ?? 0, palette[index * 3 + 2] ?? 0, alpha[index] ?? 255], o);
      } else if (colour === 0) pixels.set([lines[s] ?? 0, lines[s] ?? 0, lines[s] ?? 0, 255], o);
      else if (colour === 4) pixels.set([lines[s] ?? 0, lines[s] ?? 0, lines[s] ?? 0, lines[s + 1] ?? 0], o);
      else if (colour === 2) pixels.set([lines[s] ?? 0, lines[s + 1] ?? 0, lines[s + 2] ?? 0, 255], o);
      else pixels.set([lines[s] ?? 0, lines[s + 1] ?? 0, lines[s + 2] ?? 0, lines[s + 3] ?? 0], o);
    }
  }
  return { width, height, pixels };
}
