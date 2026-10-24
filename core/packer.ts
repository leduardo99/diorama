/**
 * Diorama - Sheet & Atlas Packing Algorithms
 * 
 * Provides deterministic layout algorithms for group exports:
 * 1. packGrid: Uniform cell grid with emergent dimensions (increments row first, then col).
 * 2. packCompact: rectangle bin-packing for minimal area without overlaps.
 */

export interface RectItem {
  name?: string;
  width: number;
  height: number;
  [key: string]: any;
}

/** A rectangle placed by a packing algorithm, with its position in the sheet. */
export interface PlacedRect<T extends RectItem = RectItem> {
  item: T;
  x: number;
  y: number;
  width: number;
  height: number;
  cellX?: number;
  cellY?: number;
  cellWidth?: number;
  cellHeight?: number;
}

/** Result of a packing algorithm: the sheet size and the placed rectangles. */
export interface PackResult<T extends RectItem = RectItem> {
  width: number;
  height: number;
  cols?: number;
  rows?: number;
  gap: number;
  items: PlacedRect<T>[];
}

/** Options for `packGrid`: spacing between cells and an optional column count. */
export interface GridPackOptions {
  /** Minimum spacing in pixels between cells (default: 0) */
  gap?: number;
  /** Optional manual column override */
  cols?: number;
  /** Optional manual row override */
  rows?: number;
}

/** Options for `packCompact`: spacing between rectangles. */
export interface CompactPackOptions {
  /** Minimum spacing in pixels between rects (default: 0) */
  gap?: number;
}

/**
 * Grid Packing:
 * 1. Takes the max width and max height among all items to define uniform cell size.
 * 2. Determines optimal rows and columns by increasing rows first, then columns.
 * 3. Centers each item inside its cell.
 * 4. Emergent resolution based on item count and spacing.
 */
export function packGrid<T extends RectItem>(
  items: T[],
  options: GridPackOptions = {}
): PackResult<T> {
  if (items.length === 0) {
    return { width: 0, height: 0, cols: 0, rows: 0, gap: 0, items: [] };
  }

  const gap = Math.max(0, options.gap ?? 0);
  const maxW = Math.max(...items.map((i) => i.width));
  const maxH = Math.max(...items.map((i) => i.height));

  let cols = 1;
  let rows = 1;

  if (options.cols && options.cols > 0) {
    cols = options.cols;
    rows = Math.ceil(items.length / cols);
  } else if (options.rows && options.rows > 0) {
    rows = options.rows;
    cols = Math.ceil(items.length / rows);
  } else {
    // Optimal uniform grid: increases rows first, then columns
    while (cols * rows < items.length) {
      if (cols === rows) {
        rows++;
      } else {
        cols++;
      }
    }
  }

  const totalW = cols * maxW + Math.max(0, cols - 1) * gap;
  const totalH = rows * maxH + Math.max(0, rows - 1) * gap;

  const placedItems: PlacedRect<T>[] = items.map((item, idx) => {
    const c = idx % cols;
    const r = Math.floor(idx / cols);

    const cellX = c * (maxW + gap);
    const cellY = r * (maxH + gap);

    // Center item inside its cell
    const x = cellX + Math.round((maxW - item.width) / 2);
    const y = cellY + Math.round((maxH - item.height) / 2);

    return {
      item,
      x,
      y,
      width: item.width,
      height: item.height,
      cellX,
      cellY,
      cellWidth: maxW,
      cellHeight: maxH,
    };
  });

  return {
    width: totalW,
    height: totalH,
    cols,
    rows,
    gap,
    items: placedItems,
  };
}

// Tree node for Growing Bin Packer
interface PackerNode {
  x: number;
  y: number;
  w: number;
  h: number;
  used?: boolean;
  right?: PackerNode;
  down?: PackerNode;
}

/**
 * Compact Packing (growing rectangle bin packing):
 * Packs rectangles as tightly as possible without overlap.
 * Emergent resolution expanding horizontally or vertically to maintain a balanced aspect ratio.
 */
export function packCompact<T extends RectItem>(
  items: T[],
  options: CompactPackOptions = {}
): PackResult<T> {
  if (items.length === 0) {
    return { width: 0, height: 0, gap: 0, items: [] };
  }

  const gap = Math.max(0, options.gap ?? 0);

  // Sort items by max dimension descending, then by area descending
  const sorted = [...items]
    .map((item, index) => ({ item, origIndex: index }))
    .sort((a, b) => {
      const maxA = Math.max(a.item.width, a.item.height);
      const maxB = Math.max(b.item.width, b.item.height);
      if (maxB !== maxA) return maxB - maxA;
      return b.item.width * b.item.height - a.item.width * a.item.height;
    });

  const first = sorted[0].item;
  let root: PackerNode = {
    x: 0,
    y: 0,
    w: first.width + gap,
    h: first.height + gap,
  };

  function findNode(node: PackerNode, w: number, h: number): PackerNode | null {
    if (node.used) {
      return (node.right ? findNode(node.right, w, h) : null) ||
             (node.down ? findNode(node.down, w, h) : null);
    } else if (w <= node.w && h <= node.h) {
      return node;
    }
    return null;
  }

  function splitNode(node: PackerNode, w: number, h: number): PackerNode {
    node.used = true;
    node.down = {
      x: node.x,
      y: node.y + h,
      w: node.w,
      h: node.h - h,
    };
    node.right = {
      x: node.x + w,
      y: node.y,
      w: node.w - w,
      h: h,
    };
    return node;
  }

  function growNode(w: number, h: number): PackerNode | null {
    const canGrowDown = w <= root.w;
    const canGrowRight = h <= root.h;

    const shouldGrowRight = canGrowRight && root.h >= root.w + w;
    const shouldGrowDown = canGrowDown && root.w >= root.h + h;

    if (shouldGrowRight) {
      return growRight(w, h);
    } else if (shouldGrowDown) {
      return growDown(w, h);
    } else if (canGrowRight && canGrowDown) {
      // Pick the growth that keeps aspect ratio closest to 1.0 (square)
      const ratioRight = Math.abs((root.w + w) / root.h - 1);
      const ratioDown = Math.abs(root.w / (root.h + h) - 1);
      return ratioRight <= ratioDown ? growRight(w, h) : growDown(w, h);
    } else if (canGrowRight) {
      return growRight(w, h);
    } else if (canGrowDown) {
      return growDown(w, h);
    }

    return null;
  }

  function growRight(w: number, h: number): PackerNode {
    root = {
      used: true,
      x: 0,
      y: 0,
      w: root.w + w,
      h: root.h,
      down: root,
      right: { x: root.w, y: 0, w, h: root.h },
    };
    const node = findNode(root, w, h);
    return node ? splitNode(node, w, h) : root;
  }

  function growDown(w: number, h: number): PackerNode {
    root = {
      used: true,
      x: 0,
      y: 0,
      w: root.w,
      h: root.h + h,
      down: { x: 0, y: root.h, w: root.w, h },
      right: root,
    };
    const node = findNode(root, w, h);
    return node ? splitNode(node, w, h) : root;
  }

  const placedResults: { item: T; x: number; y: number; width: number; height: number; origIndex: number }[] = [];

  for (const entry of sorted) {
    const itemW = entry.item.width;
    const itemH = entry.item.height;
    const neededW = itemW + gap;
    const neededH = itemH + gap;

    let node = findNode(root, neededW, neededH);
    if (node) {
      node = splitNode(node, neededW, neededH);
    } else {
      node = growNode(neededW, neededH);
    }

    if (node) {
      placedResults.push({
        item: entry.item,
        x: node.x,
        y: node.y,
        width: itemW,
        height: itemH,
        origIndex: entry.origIndex,
      });
    }
  }

  // Restore original order
  placedResults.sort((a, b) => a.origIndex - b.origIndex);

  const placedItems: PlacedRect<T>[] = placedResults.map((p) => ({
    item: p.item,
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
  }));

  // Emergent bounding box (without trailing outer gap)
  const totalW = Math.max(...placedItems.map((p) => p.x + p.width));
  const totalH = Math.max(...placedItems.map((p) => p.y + p.height));

  return {
    width: totalW,
    height: totalH,
    gap,
    items: placedItems,
  };
}
