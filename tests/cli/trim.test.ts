import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { decodePng, encodePng } from '../../tools/png';
import { PIECE_GAP, drawnBounds, isExtraPage, pageFile, trimSheet, type Cell } from '../../tools/trim';

console.log('🧪 Checking the trimmed export (tools/trim.ts) and the PNG codec (tools/png.ts)...\n');

/** A sheet of `cols` × `rows` cells of `size` px, each with an opaque `w` × `h` block at (`x`, `y`) of its cell. */
function sheet(cols: number, rows: number, size: number, block: (index: number) => { x: number; y: number; w: number; h: number } | null) {
  const width = cols * size;
  const height = rows * size;
  const pixels = Buffer.alloc(width * height * 4);
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      cells.push({ name: `cell_${index}`, x: c * size, y: r * size, width: size, height: size });
      const b = block(index);
      if (!b) continue;
      for (let y = 0; y < b.h; y++) {
        for (let x = 0; x < b.w; x++) {
          const at = ((r * size + b.y + y) * width + c * size + b.x + x) * 4;
          pixels.set([index * 7 % 256, x * 3 % 256, y * 5 % 256, 255], at);
        }
      }
    }
  }
  return { image: { width, height, channels: 4, pixels }, cells };
}

/** Every cell rebuilt from its trimmed piece equals the cell of the untrimmed sheet, pixel for pixel. */
function rebuildsExactly(image: ReturnType<typeof sheet>['image'], cells: Cell[], result: ReturnType<typeof trimSheet>) {
  for (const cell of cells) {
    const cut = result.frames[cell.name];
    const page = result.pages[cut.page];
    for (let y = 0; y < cell.height; y++) {
      for (let x = 0; x < cell.width; x++) {
        const inPiece = x >= cut.ox && x < cut.ox + cut.width && y >= cut.oy && y < cut.oy + cut.height;
        const want = image.pixels.subarray(((cell.y + y) * image.width + cell.x + x) * 4, ((cell.y + y) * image.width + cell.x + x) * 4 + 4);
        const got = inPiece ? page.pixels.subarray(((cut.y + y - cut.oy) * page.width + cut.x + x - cut.ox) * 4, ((cut.y + y - cut.oy) * page.width + cut.x + x - cut.ox) * 4 + 4) : Buffer.alloc(4);
        assert.deepEqual([...got], [...want], `${cell.name} at ${x},${y}`);
      }
    }
  }
}

// 1. A cell's drawn bounds; an empty cell has none.
{
  const { image, cells } = sheet(2, 1, 16, (i) => (i === 0 ? { x: 3, y: 5, w: 4, h: 6 } : null));
  assert.deepEqual(drawnBounds(image, cells[0]), { x: 3, y: 5, width: 4, height: 6 });
  assert.equal(drawnBounds(image, cells[1]), null);
}

// 2. Trimming keeps every pixel where it was: each piece, put back at (ox, oy) in a cell of cellW × cellH, is the cell.
{
  const { image, cells } = sheet(4, 3, 32, (i) => (i === 5 ? null : { x: i % 7, y: (i * 3) % 9, w: 6 + (i % 5) * 3, h: 4 + (i % 4) * 5 }));
  const result = trimSheet(image, cells);
  assert.equal(result.pages.length, 1);
  rebuildsExactly(image, cells, result);
  assert.deepEqual(result.frames.cell_5, { page: 0, ...result.frames.cell_5, width: 1, height: 1, ox: 0, oy: 0, cellW: 32, cellH: 32 }, 'an empty cell keeps a 1 × 1 transparent piece');
  for (const cut of Object.values(result.frames)) assert.deepEqual([cut.cellW, cut.cellH], [32, 32], 'each frame says the size of its cell');
  const area = result.pages[0].width * result.pages[0].height;
  assert.ok(area < image.width * image.height, `the page (${area} px) is smaller than the sheet (${image.width * image.height} px)`);
}

// 3. Pieces never overlap and keep PIECE_GAP between them.
{
  const { image, cells } = sheet(5, 4, 24, (i) => ({ x: 1, y: 2, w: 10 + (i % 6) * 2, h: 8 + (i % 3) * 4 }));
  const result = trimSheet(image, cells);
  const pieces = Object.values(result.frames);
  for (const [i, a] of pieces.entries()) {
    for (const b of pieces.slice(i + 1)) {
      if (a.page !== b.page) continue;
      const apart = a.x + a.width + PIECE_GAP <= b.x || b.x + b.width + PIECE_GAP <= a.x || a.y + a.height + PIECE_GAP <= b.y || b.y + b.height + PIECE_GAP <= a.y;
      assert.ok(apart, `pieces at ${a.x},${a.y} and ${b.x},${b.y} keep ${PIECE_GAP} px apart`);
    }
  }
}

// 4. No page is larger than maxPage: what does not fit goes to the next page, and still rebuilds exactly.
{
  const { image, cells } = sheet(6, 4, 40, (i) => ({ x: 2, y: 2, w: 30, h: 30 + (i % 3) }));
  const result = trimSheet(image, cells, 80);
  assert.ok(result.pages.length > 1, `small pages split the sheet (${result.pages.length} pages)`);
  for (const page of result.pages) assert.ok(page.width <= 80 && page.height <= 80, `a page is ${page.width} × ${page.height}, at most 80`);
  rebuildsExactly(image, cells, result);
  assert.throws(() => trimSheet(image, cells, 20), /larger than a page of 20 px/, 'a piece larger than a page is refused');
}

// 5. The same sheet always packs the same way.
{
  const { image, cells } = sheet(3, 3, 20, (i) => ({ x: i, y: 1, w: 8, h: 6 + i }));
  assert.deepEqual(trimSheet(image, cells), trimSheet(image, cells));
}

// 6. Page files, and which files of assets/ are extra pages.
assert.equal(pageFile('idle', 0, 'png'), 'idle.png');
assert.equal(pageFile('idle', 2, 'png'), 'idle.2.png');
const files = new Set(['characters/a/idle.json', 'characters/a/idle.png', 'characters/a/idle.1.png', 'props/v2.1.png']);
assert.equal(isExtraPage('characters/a/idle.1.png', (rel) => files.has(rel)), true);
assert.equal(isExtraPage('characters/a/idle.png', (rel) => files.has(rel)), false, 'the first page is the asset itself');
assert.equal(isExtraPage('props/v2.1.png', (rel) => files.has(rel)), false, 'a name with a number but no atlas is an asset');

// 7. The codec: what it encodes, it reads back, with either filter; the adaptive filter is deterministic.
{
  const { image } = sheet(3, 2, 12, (i) => ({ x: 1, y: 1, w: 9, h: 6 + (i % 3) }));
  for (const filter of ['none', 'adaptive'] as const) {
    const decoded = decodePng(encodePng(image.width, image.height, image.pixels, { filter, level: 9 }));
    assert.deepEqual([decoded.width, decoded.height, decoded.channels], [image.width, image.height, 4]);
    assert.ok(decoded.pixels.equals(image.pixels), `the ${filter} filter round-trips`);
  }
  assert.ok(encodePng(image.width, image.height, image.pixels, { filter: 'adaptive' }).equals(encodePng(image.width, image.height, image.pixels, { filter: 'adaptive' })));
  assert.throws(() => decodePng(Buffer.from('not a png')), /not a PNG/);
  // Soft gradients and noise, where every row filter wins somewhere: each must decode back exactly.
  const w = 64;
  const h = 48;
  const busy = Buffer.alloc(w * h * 4);
  let seed = 7;
  const noise = () => (seed = (seed * 1103515245 + 12345) % 2147483648) % 9;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * 4;
      busy.set([(x * 4 + y * 2 + noise()) & 255, (x * y) & 255, y < 16 ? 40 : (x * 5 + noise()) & 255, x % 7 === 0 ? 0 : 255], at);
    }
  }
  const encoded = encodePng(w, h, busy, { filter: 'adaptive' });
  assert.ok(decodePng(encoded).pixels.equals(busy), 'a busy image round-trips with the adaptive filter');
  const idat = inflateSync(encoded.subarray(8 + 25 + 8, encoded.length - 12 - 4));
  const used = new Set(Array.from({ length: h }, (_, y) => idat[y * (w * 4 + 1)]));
  assert.ok(used.size >= 2 && used.has(4), `the adaptive filter mixes filters, Paeth among them (${[...used].sort()})`);
}

console.log('✅ Trimmed export checks passed');
