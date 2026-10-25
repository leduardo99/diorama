import assert from 'node:assert/strict';
import type { SceneryCatalog, ScenePieceInfo } from '../../core/volume';
import {
  anchorFor, canFlip, cellPiece, doorAt, edgeInside, edgeOf, flipDoor, isDoor, isFlipped, moveDoor, placeDoor, sameEdge, setState, clampAnchor, countCells, duplicateProp, emptyScene, fill, footprintOf, lineBetween, moveProp, paint, paintLine, pickAt, pieceOf,
  placeProp, propsAt, moveFigure, moveWall, nudgeSelected, removeFigure, removeMany, removeProp, removeSelected, resize, rolesInScene, rotateProp, setDirection, setPropOption, setSceneMaterial, setVariant, setWallHeight, setWallOption, setWallVariant, toggleFigure, validSelection, vertexPath, wallAt, wallsOnBorders, withLayers,
} from '../../viewer/src/lib/scenery/edit';
import { advance, advanceDoor, draggedGhost, isCarrying, resultOf, startMove, startMoveDoor, startMoveFigure, startMoveWall, startPaint, startSweep, sweepSpots } from '../../viewer/src/lib/scenery/gesture';
import { edgeFromPoint, edgeLine, fitZoom, geometryOf, renderScale, stepZoom, vertexFromPoint, ZOOMS } from '../../viewer/src/lib/scenery/render';

console.log('🧪 Checking the scene painter\'s edits (cells, props, footprints, resize, layers) and its zoom (Fit, steps)...\n');

const piece = (id: string, group: ScenePieceInfo['group'], extra: Partial<ScenePieceInfo> = {}): ScenePieceInfo =>
  ({ id, label: id, group, piece: () => {}, connect: 'none', roles: ['stone'], ...extra });
const catalog = {
  pieces: [
    piece('stone', 'floor', { connect: 'corners', roles: ['stone', 'mortar'] }),
    piece('grass', 'floor', { connect: 'corners', priority: 1, roles: ['moss'] }),
    piece('wall', 'wall', { connect: 'edges' }),
    piece('crate', 'prop', { directions: 4, variants: 3 }),
    piece('tree', 'prop', { footprint: [2, 2], roles: ['wood'] }),
    piece('crack', 'decal'),
    piece('door', 'door', { directions: 4, states: ['closed', 'open'] }),
    piece('urn', 'prop', { states: ['whole', 'broken'] }),
  ],
  materials: {}, defaultMaterials: {},
} as unknown as SceneryCatalog;
const info = (id: string) => catalog.pieces.find((p) => p.id === id)!;

// 1. A new scene is empty and valid in shape; painting changes one cell and leaves the original alone.
const base = emptyScene(catalog, 4, 3);
assert.deepEqual([base.cols, base.rows, base.floor.length, base.floor[0].length, base.props.length], [4, 3, 3, 4, 0]);
const painted = paint(base, 'floor', { col: 1, row: 2 }, 'stone');
assert.equal(painted.floor[2][1], 'stone');
assert.equal(base.floor[2][1], null, 'the scene it was given is untouched');
assert.equal(paint(painted, 'floor', { col: 1, row: 2 }, 'stone'), painted, 'painting what is there changes nothing');
assert.equal(paint(base, 'floor', { col: 9, row: 0 }, 'stone'), base, 'outside the scene changes nothing');
assert.equal(painted.walls, base.walls, 'layers that did not change are shared');

// 2. A stroke fills the cells between two pointer positions.
assert.deepEqual(lineBetween({ col: 0, row: 0 }, { col: 3, row: 0 }).map((c) => c.col), [0, 1, 2, 3]);
assert.equal(lineBetween({ col: 0, row: 0 }, { col: 3, row: 2 }).length, 4);
assert.deepEqual(lineBetween({ col: 2, row: 2 }, { col: 2, row: 2 }), [{ col: 2, row: 2 }]);
assert.equal(countCells(paintLine(base, 'walls', { col: 0, row: 1 }, { col: 3, row: 1 }, 'wall').walls), 4);

// 3. Fill covers the connected region of equal cells only.
let floor = paintLine(base, 'floor', { col: 0, row: 0 }, { col: 3, row: 0 }, 'stone');
floor = fill(floor, 'floor', { col: 0, row: 2 }, 'grass');
assert.deepEqual(floor.floor.map((line) => line.filter((c) => c === 'grass').length), [0, 4, 4], 'the stone row stays, the empty region below is filled');
assert.equal(fill(floor, 'floor', { col: 0, row: 2 }, 'grass'), floor);

// 4. Props: footprints, centring and bounds.
assert.deepEqual(footprintOf(info('tree')), [2, 2]);
assert.deepEqual(anchorFor(base, info('tree'), { col: 3, row: 2 }), { col: 2, row: 1 }, 'a big prop is pulled back inside the scene');
assert.deepEqual(anchorFor(base, info('tree'), { col: 1, row: 1 }), { col: 1, row: 1 });
assert.equal(placeProp(base, info('tree'), { col: 3, row: 2 }), base, 'a footprint that does not fit is refused');
let scene = placeProp(base, info('crate'), { col: 0, row: 0 });
scene = placeProp(scene, info('tree'), { col: 1, row: 0 });
scene = placeProp(scene, info('crack'), { col: 1, row: 1 });
assert.deepEqual(scene.props.map((p) => p.piece), ['crate', 'tree', 'crack']);
assert.deepEqual(propsAt(scene, catalog, { col: 1, row: 1 }), [2, 1], 'the last placed is on top');
assert.deepEqual(propsAt(scene, catalog, { col: 3, row: 2 }), []);

// 5. Moving, rotating and varying a placement.
assert.deepEqual(moveProp(scene, catalog, 0, { col: 3, row: 2 }).props[0], { piece: 'crate', col: 3, row: 2 });
assert.equal(moveProp(scene, catalog, 1, { col: 3, row: 2 }), scene, 'a tree does not move where it would not fit');
assert.equal(moveProp(scene, catalog, 0, { col: 0, row: 0 }), scene, 'moving to the same cell changes nothing');
let turned = rotateProp(scene, catalog, 0, 1);
assert.equal(turned.props[0].dir, 1);
turned = rotateProp(rotateProp(turned, catalog, 0, -1), catalog, 0, -1);
assert.equal(turned.props[0].dir, 3, 'rotation wraps around its 4 facings');
assert.equal('dir' in rotateProp(turned, catalog, 0, 1).props[0], false, 'facing 0 is the default and is not stored');
assert.equal(rotateProp(scene, catalog, 1, 1), scene, 'a piece with one facing does not turn');
assert.equal(setDirection(scene, catalog, 0, 2).props[0].dir, 2);
assert.equal(setDirection(scene, catalog, 0, 9), scene, 'a facing the piece does not have is refused');
assert.equal(setDirection(scene, catalog, 0, 0), scene, 'already facing the camera');
assert.equal(setVariant(scene, 0, 2).props[0].variant, 2);
assert.equal(setVariant(scene, 0, 0).props[0].variant, 0, 'the first look is a choice like the others');
assert.equal('variant' in setVariant(setVariant(scene, 0, 2), 0, undefined).props[0], false, 'no variant: the engine picks one from the position');
assert.equal(placeProp(base, info('crate'), { col: 0, row: 0 }, { variant: 0 }).props[0].variant, 0);
assert.equal('variant' in placeProp(base, info('crate'), { col: 0, row: 0 }).props[0], false);
const optioned = setPropOption(scene, 0, 'height', 2, 1);
assert.deepEqual(optioned.props[0].options, { height: 2 });
assert.equal('options' in setPropOption(optioned, 0, 'height', 1, 1).props[0], false, 'back to the default drops the options');
assert.equal(removeProp(scene, 1).props.length, 2);
assert.equal(removeProp(scene, 7), scene);

// 6. Taking things out of the scene by what is selected; the eyedropper finds the top-most visible thing.
let rich = paint(paint(scene, 'floor', { col: 1, row: 1 }, 'stone'), 'walls', { col: 1, row: 1 }, 'wall');
assert.deepEqual(pickAt(rich, catalog, { col: 1, row: 1 }), { kind: 'prop', index: 2 });
assert.deepEqual(pickAt(rich, catalog, { col: 1, row: 1 }, { floor: true, walls: true, props: false }), { kind: 'wall', id: 'wall' });
assert.deepEqual(pickAt(rich, catalog, { col: 1, row: 1 }, { floor: true, walls: false, props: false }), { kind: 'floor', id: 'stone' });
assert.equal(pickAt(rich, catalog, { col: 3, row: 0 }), null);
assert.equal(removeSelected(rich, { kind: 'prop', index: propsAt(rich, catalog, { col: 1, row: 1 })[0] }).props.length, 2, 'only the one placement goes');
assert.equal(removeSelected(rich, { kind: 'wall', at: { col: 1, row: 1 } }).walls[1][1], null);
assert.equal(removeSelected(rich, { kind: 'floor', at: { col: 1, row: 1 } }).walls[1][1], 'wall', 'the other layers stay');
assert.equal(removeSelected(rich, { kind: 'prop', index: 9 }), rich, 'nothing to take out');

// 7. Resizing keeps the top-left corner and drops what no longer fits.
const grown = resize(rich, catalog, 6, 5);
assert.deepEqual([grown.cols, grown.rows, grown.floor.length, grown.floor[0].length, grown.floor[1][1], grown.props.length], [6, 5, 5, 6, 'stone', 3]);
const shrunk = resize(rich, catalog, 2, 2);
assert.deepEqual(shrunk.props.map((p) => p.piece), ['crate', 'crack'], 'the 2×2 tree at (1, 0) no longer fits in 2 columns');
assert.equal(resize(rich, catalog, 4, 3), rich);
assert.deepEqual([resize(rich, catalog, 0, 999).cols, resize(rich, catalog, 0, 999).rows], [1, 64], 'sizes stay between 1 and 64');

// 8. Materials and roles.
assert.deepEqual(setSceneMaterial(base, 'stone', 'sand').materials, { stone: 'sand' });
assert.equal('materials' in setSceneMaterial(setSceneMaterial(base, 'stone', 'sand'), 'stone', undefined), false);
assert.deepEqual(rolesInScene(rich, catalog), ['stone', 'mortar', 'wood'], 'roles of the pieces in use, in catalog order: the stone floor, the wall, the crate, the tree');
assert.deepEqual(rolesInScene(emptyScene(catalog, 2, 2), catalog), []);

// 9. Hidden layers are left out of what is drawn, not out of the scene.
const hidden = withLayers(rich, { floor: false, walls: true, props: false });
assert.deepEqual([countCells(hidden.floor), countCells(hidden.walls), hidden.props.length], [0, 1, 0]);
assert.equal(withLayers(rich, { floor: true, walls: true, props: true }), rich);
assert.equal(countCells(rich.floor), 1, 'the scene itself keeps its floor');

// 10. A piece turned to face west or east turns its footprint, as the engine lays it out.
const slab = piece('slab', 'prop', { footprint: [2, 1], directions: 4 });
const wide = { ...catalog, pieces: [...catalog.pieces, slab] } as unknown as SceneryCatalog;
assert.deepEqual([0, 1, 2, 3].map((dir) => footprintOf(slab, dir)), [[2, 1], [1, 2], [2, 1], [1, 2]]);
assert.deepEqual(footprintOf(info('tree'), 1), [2, 2], 'a square footprint stays as it is');
assert.deepEqual(clampAnchor(base, slab, { col: 9, row: 9 }), { col: 2, row: 2 }, 'pulled back so the 2 × 1 footprint stays inside 4 × 3');
assert.deepEqual(clampAnchor(base, slab, { col: 9, row: 9 }, 1), { col: 3, row: 1 }, 'facing west it covers 1 × 2');
assert.deepEqual(clampAnchor(base, slab, { col: -3, row: -1 }), { col: 0, row: 0 });
const slabbed = placeProp(base, slab, { col: 2, row: 2 });
assert.equal(setDirection(slabbed, wide, 0, 1), slabbed, 'turned west it would cover row 3, past the last one: refused');
assert.equal(setDirection(slabbed, wide, 0, 2).props[0].dir, 2, 'turned north the footprint is the same: allowed');
assert.equal(placeProp(base, slab, { col: 3, row: 2 }, { dir: 1 }).props.length, 0, 'placed west at the last row it does not fit');
assert.equal(placeProp(base, slab, { col: 3, row: 1 }, { dir: 1 }).props.length, 1);
assert.deepEqual(propsAt(placeProp(base, slab, { col: 3, row: 1 }, { dir: 1 }), wide, { col: 3, row: 2 }), [0], 'the turned footprint is what a click finds');
assert.equal(pieceOf(wide, 'slab'), slab);
assert.equal(pieceOf(wide, 'nothing'), undefined);

// 11. A wall cell may be an id or an object that carries it (a variant or options for that cell).
assert.deepEqual([cellPiece('wall'), cellPiece({ piece: 'wall', variant: 1 }), cellPiece(null)], ['wall', 'wall', null]);
const varied = { ...base, walls: base.walls.map((line, r) => (r === 1 ? line.map((c, i) => (i === 1 ? { piece: 'wall', variant: 1 } : c)) : line)) };
assert.equal(paint(varied, 'walls', { col: 1, row: 1 }, 'wall'), varied, 'painting the same piece leaves the cell\'s variant alone');
assert.deepEqual(pickAt(varied, catalog, { col: 1, row: 1 }), { kind: 'wall', id: 'wall' });
assert.equal(removeSelected(varied, { kind: 'wall', at: { col: 1, row: 1 } }).walls[1][1], null);
assert.equal(countCells(varied.walls), 1);
assert.deepEqual(rolesInScene(varied, catalog), ['stone'], 'the roles of the wall in the object cell count');

// 12. A drag is a pure stroke: every step gives the scene to show, and only its result is committed.
let stroke = startPaint(base, 'floor', 'stone', { col: 0, row: 0 });
assert.equal(stroke.scene.floor[0][0], 'stone', 'the first cell is painted when the pointer goes down');
assert.equal(advance(stroke, { col: 0, row: 0 }, catalog), stroke, 'the same cell is the same stroke');
stroke = advance(stroke, { col: 3, row: 0 }, catalog);
assert.deepEqual(stroke.scene.floor[0], ['stone', 'stone', 'stone', 'stone'], 'a fast move fills the cells between');
assert.equal(resultOf(stroke, catalog), stroke.scene);
assert.equal(base.floor[0][0], null, 'the scene the stroke started from is untouched');
// The eraser sweeps: what the pointer found goes, in one edit, and the cells where something went are remembered.
let sweeping = startSweep(rich) as Extract<ReturnType<typeof startSweep>, { kind: 'sweep' }>;
const topAt = (at: { col: number; row: number }) => ({ kind: 'prop' as const, index: propsAt(rich, catalog, at)[0] });
sweeping = sweepSpots(sweeping, [{ key: '1,1', target: topAt({ col: 1, row: 1 }) }]) as typeof sweeping;
assert.equal(sweeping.scene.props.length, 2, 'the top-most placement under the first spot goes');
assert.equal(sweeping.visited.has('1,1'), true, 'the cell is remembered, for the canvas to leave its floor alone');
assert.equal(sweepSpots(sweeping, []), sweeping, 'nothing found, nothing changes');
assert.equal(sweepSpots(sweeping, [{ key: '9,9', target: { kind: 'prop', index: 9 } }]), sweeping, 'a target that is not there changes nothing');
// Several things found along one line of the pointer go together, whatever order they were found in.
const many = removeMany(rich, [{ kind: 'prop', index: 0 }, { kind: 'prop', index: 2 }, { kind: 'floor', at: { col: 1, row: 1 } }]);
assert.deepEqual(many.props.map((p) => p.piece), ['tree'], 'the placements are numbered: the first and the last go and the middle one stays');
assert.equal(many.floor[1][1], null);
assert.equal(removeMany(rich, []), rich);
const both = sweepSpots(startSweep(rich) as typeof sweeping, [{ key: 'a', target: { kind: 'prop', index: 0 } }, { key: 'b', target: { kind: 'prop', index: 1 } }]);
assert.equal(both.scene.props.length, 1);
assert.equal(resultOf(both, catalog), both.scene);
assert.equal(rich.props.length, 3, 'the scene the sweep started from is untouched');
assert.equal(advance(sweeping, { col: 3, row: 3 }, catalog), sweeping, 'the eraser is moved by the canvas, sample by sample');

// 13. Dragging a prop: it leaves the drawing at once and a ghost follows the pointer; the move is committed at the end.
let carried = startMove(scene, 0, { col: 0, row: 0 });
assert.equal(draggedGhost(carried, catalog), null, 'still in its cell: nothing moved');
assert.equal(resultOf(carried, catalog), scene);
carried = advance(carried, { col: 3, row: 2 }, catalog);
assert.equal(carried.scene.props.length, 2, 'the carried prop is not in the scene that is shown');
assert.deepEqual(draggedGhost(carried, catalog)?.at, { col: 3, row: 2 });
assert.deepEqual(resultOf(carried, catalog).props[0], { piece: 'crate', col: 3, row: 2 });
carried = advance(carried, { col: 9, row: 9 }, catalog);
assert.deepEqual(draggedGhost(carried, catalog)?.at, { col: 3, row: 2 }, 'past the edge it stays on the last cell it fits');
carried = advance(carried, { col: 0, row: 0 }, catalog);
assert.equal(carried.scene, scene, 'back in its own cell the scene is whole again');
const offset = startMove(scene, 1, { col: 2, row: 1 });
assert.deepEqual(draggedGhost(advance(offset, { col: 3, row: 1 }, catalog), catalog)?.at, { col: 2, row: 0 }, 'the tree is held where it was grabbed (and cannot go lower than row 0 here)');

// 14. Duplicating copies a placement beside it, below it, or in its place when there is no room; the copy is the last one.
const pair = placeProp(placeProp(base, info('crate'), { col: 0, row: 0 }, { dir: 1, variant: 2 }), info('tree'), { col: 2, row: 0 });
const copied = duplicateProp(pair, catalog, 0);
assert.equal(copied.props.length, 3);
assert.deepEqual(copied.props[2], { piece: 'crate', col: 1, row: 0, dir: 1, variant: 2 }, 'one cell to the right, with its facing and variant');
assert.equal(pair.props.length, 2, 'the scene it was given is untouched');
assert.deepEqual(duplicateProp(placeProp(emptyScene(catalog, 4, 5), info('tree'), { col: 2, row: 0 }), catalog, 0).props[1], { piece: 'tree', col: 2, row: 2 }, 'no room to the right of the tree: below it');
assert.deepEqual(duplicateProp(placeProp(base, info('tree'), { col: 2, row: 1 }), catalog, 0).props[1], { piece: 'tree', col: 2, row: 1 }, 'no room beside or below: in its place');
assert.equal(duplicateProp(pair, catalog, 5), pair, 'nothing to copy');

// 15. Walls on borders: the grid is one larger each way and an entry is the vertex at a cell's top-left corner.
const bordered = { ...catalog, space: { walls: 'border' } } as unknown as SceneryCatalog;
const room = emptyScene(bordered, 4, 3);
assert.deepEqual([room.walls.length, room.walls[0].length, room.floor.length, room.floor[0].length], [4, 5, 3, 4], 'walls are (rows + 1) × (cols + 1), the floor stays rows × cols');
assert.equal(wallsOnBorders(room), true);
assert.equal(wallsOnBorders(base), false);
assert.equal(paint(room, 'walls', { col: 4, row: 3 }, 'wall').walls[3][4], 'wall', 'the last vertex is inside the grid');
assert.equal(paint(room, 'walls', { col: 5, row: 0 }, 'wall'), room, 'past the last vertex is outside');
assert.equal(paint(base, 'walls', { col: 4, row: 0 }, 'wall'), base, 'with walls through cells the grid is the cells');

// 16. A stroke of walls is a connected run of vertices, even where the pointer moves diagonally.
const connected = (path: { col: number; row: number }[]) => path.slice(1).every((v, i) => Math.abs(v.col - path[i].col) + Math.abs(v.row - path[i].row) === 1);
for (const [to, expected] of [[{ col: 3, row: 0 }, 4], [{ col: 2, row: 2 }, 5], [{ col: 3, row: 1 }, 5], [{ col: 0, row: 0 }, 1], [{ col: -2, row: -1 }, 4]] as const) {
  const path = vertexPath({ col: 0, row: 0 }, to);
  assert.equal(connected(path), true, `connected towards ${to.col},${to.row}`);
  assert.equal(path.length, expected, `length towards ${to.col},${to.row}`);
  assert.deepEqual(path.at(-1), to);
}
const run = paintLine(room, 'walls', { col: 0, row: 0 }, { col: 2, row: 2 }, 'wall');
assert.equal(countCells(run.walls), 5, 'a diagonal stroke leaves a staircase of five vertices, not three loose posts');

// 17. Walls come in heights: the default is stored as the plain id, another height as an object, and painting over changes it.
const tall = paint(room, 'walls', { col: 1, row: 1 }, 'wall', 'fence');
assert.deepEqual(tall.walls[1][1], { piece: 'wall', height: 'fence' });
assert.equal(paint(tall, 'walls', { col: 1, row: 1 }, 'wall', 'fence'), tall, 'the same piece at the same height changes nothing');
assert.equal(paint(tall, 'walls', { col: 1, row: 1 }, 'wall').walls[1][1], 'wall', 'back to the default height: the plain id');
const looked = paint(paint(room, 'walls', { col: 1, row: 1 }, 'wall'), 'walls', { col: 1, row: 1 }, 'wall', 'fence');
assert.deepEqual(looked.walls[1][1], { piece: 'wall', height: 'fence' });
const keeps = { ...room, walls: room.walls.map((line, r) => (r === 1 ? line.map((c, i) => (i === 1 ? { piece: 'wall', variant: 1 } : c)) : line)) };
assert.deepEqual(paint(keeps, 'walls', { col: 1, row: 1 }, 'wall', 'fence').walls[1][1], { piece: 'wall', variant: 1, height: 'fence' }, 'a new height keeps the cell\'s variant');
assert.deepEqual(paint(paint(keeps, 'walls', { col: 1, row: 1 }, 'wall', 'fence'), 'walls', { col: 1, row: 1 }, 'wall').walls[1][1], { piece: 'wall', variant: 1 });
assert.equal(startPaint(room, 'walls', 'wall', { col: 0, row: 0 }, 'fence').scene.walls[0][0] instanceof Object, true);
assert.deepEqual(pickAt(tall, catalog, { col: 0, row: 0 }, undefined, { col: 1, row: 1 }), { kind: 'wall', id: 'wall', height: 'fence' }, 'the eyedropper takes the height too');
assert.deepEqual(pickAt(tall, catalog, { col: 0, row: 0 }, undefined, null), null, 'no vertex near: no wall');

// 18. Resizing keeps the vertex grid one larger; the vertex a cell's top-left corner names stays where it is.
const bigger = resize(run, bordered, 6, 4);
assert.deepEqual([bigger.walls.length, bigger.walls[0].length], [5, 7]);
assert.equal(countCells(bigger.walls), 5, 'the walls drawn are kept');
const smaller = resize(run, bordered, 2, 2);
assert.deepEqual([smaller.walls.length, smaller.walls[0].length], [3, 3]);
assert.equal(smaller.walls[2][2], 'wall', 'the vertex at (2, 2) is the scene\'s corner');
assert.deepEqual([withLayers(run, { floor: true, walls: false, props: true }).walls.length, withLayers(run, { floor: true, walls: false, props: true }).walls[0].length], [4, 5], 'hidden walls keep the grid\'s shape');
const swept = sweepSpots(startSweep(run) as Extract<ReturnType<typeof startSweep>, { kind: 'sweep' }>, [{ key: 'v0,0', target: { kind: 'wall', at: { col: 0, row: 0 } } }]);
assert.equal(swept.scene.walls[0][0], null, 'a wall on a vertex is taken out by its vertex');
assert.equal(countCells(swept.scene.walls), 4);
const stroked = advance(startPaint(room, 'walls', 'wall', { col: 0, row: 0 }, 'fence'), { col: 2, row: 1 }, bordered);
assert.equal(countCells(stroked.scene.walls), 4);
assert.equal(stroked.scene.walls.flat().filter((e) => typeof e === 'object' && e?.height === 'fence').length, 4, 'every vertex of the stroke has the height');

// 19. The vertex nearest a point, and how far it is.
const geo = { width: 0, height: 0, origin: { x: 100, y: 100 }, cell: { w: 48, h: 36 } };
assert.deepEqual(vertexFromPoint(geo, 76, 82).vertex, { col: 0, row: 0 }, 'cell (0, 0)\'s top-left corner is half a cell up and left of its centre');
assert.equal(vertexFromPoint(geo, 76, 82).distance, 0);
assert.deepEqual(vertexFromPoint(geo, 110, 110).vertex, { col: 1, row: 1 }, 'past the middle of a cell the nearest corner is the next one');
assert.equal(vertexFromPoint(geo, 100, 100).distance > 0.4, true, 'the centre of a cell is far from all four corners');

// 20. Scale figures: one per cell, toggled; they follow a resize.
const figured = toggleFigure(base, { col: 1, row: 1 });
assert.deepEqual(figured.figures, [{ col: 1, row: 1 }]);
assert.equal('figures' in toggleFigure(figured, { col: 1, row: 1 }), false, 'the same cell takes it away, and the empty list goes with it');
assert.equal(toggleFigure(base, { col: 9, row: 9 }), base, 'outside the scene changes nothing');
assert.deepEqual(resize(toggleFigure(figured, { col: 3, row: 2 }), catalog, 3, 2).figures, [{ col: 1, row: 1 }], 'a figure outside the new size goes');

// 21. Everything can be selected, and what is selected can be taken out; a selection that points at nothing is dropped.
const stuff = toggleFigure(paint(paint(placeProp(base, info('crate'), { col: 0, row: 0 }), 'floor', { col: 2, row: 1 }, 'stone'), 'walls', { col: 3, row: 2 }, 'wall'), { col: 1, row: 1 });
assert.deepEqual(validSelection(stuff, { kind: 'prop', index: 0 }), { kind: 'prop', index: 0 });
assert.equal(validSelection(stuff, { kind: 'prop', index: 1 }), null);
assert.deepEqual(validSelection(stuff, { kind: 'wall', at: { col: 3, row: 2 } }), { kind: 'wall', at: { col: 3, row: 2 } });
assert.equal(validSelection(stuff, { kind: 'wall', at: { col: 0, row: 0 } }), null, 'an empty cell is not a wall');
assert.equal(validSelection(stuff, { kind: 'floor', at: { col: 2, row: 1 } })?.kind, 'floor');
assert.equal(validSelection(stuff, { kind: 'floor', at: { col: 0, row: 0 } }), null);
assert.equal(validSelection(stuff, { kind: 'figure', index: 0 })?.kind, 'figure');
assert.equal(validSelection(stuff, { kind: 'figure', index: 1 }), null);
assert.equal(validSelection(stuff, null), null);
assert.equal(removeSelected(stuff, { kind: 'prop', index: 0 }).props.length, 0);
assert.equal(removeSelected(stuff, { kind: 'wall', at: { col: 3, row: 2 } }).walls[2][3], null);
assert.equal(removeSelected(stuff, { kind: 'floor', at: { col: 2, row: 1 } }).floor[1][2], null);
assert.equal('figures' in removeSelected(stuff, { kind: 'figure', index: 0 }), false, 'the last figure takes the list with it');
assert.equal(removeFigure(stuff, 5), stuff);

// 22. A wall's height, look and options are edited where it stands; a cell back to the defaults is the plain id again.
const gate = paint(room, 'walls', { col: 2, row: 2 }, 'wall');
assert.deepEqual(wallAt(gate, { col: 2, row: 2 }), { piece: 'wall' });
assert.equal(wallAt(gate, { col: 0, row: 0 }), null);
const lowGate = setWallHeight(gate, { col: 2, row: 2 }, 'fence');
assert.deepEqual(lowGate.walls[2][2], { piece: 'wall', height: 'fence' });
assert.equal(setWallHeight(lowGate, { col: 2, row: 2 }, undefined).walls[2][2], 'wall');
const looked2 = setWallVariant(lowGate, { col: 2, row: 2 }, 0);
assert.deepEqual(looked2.walls[2][2], { piece: 'wall', height: 'fence', variant: 0 }, 'the first look is a choice');
assert.deepEqual(setWallVariant(looked2, { col: 2, row: 2 }, undefined).walls[2][2], { piece: 'wall', height: 'fence' }, 'automatic: the engine picks');
const optioned2 = setWallOption(gate, { col: 2, row: 2 }, 'moss', true, false);
assert.deepEqual(optioned2.walls[2][2], { piece: 'wall', options: { moss: true } });
assert.equal(setWallOption(optioned2, { col: 2, row: 2 }, 'moss', false, false).walls[2][2], 'wall', 'back to the default drops the options and the object');
assert.equal(setWallHeight(room, { col: 1, row: 1 }, 'fence'), room, 'nothing there to change');

// 23. Scale figures move one cell at a time and never onto another.
const two = toggleFigure(toggleFigure(base, { col: 1, row: 1 }), { col: 2, row: 1 });
assert.deepEqual(moveFigure(two, 0, { col: 1, row: 2 }).figures, [{ col: 1, row: 2 }, { col: 2, row: 1 }]);
assert.equal(moveFigure(two, 0, { col: 2, row: 1 }), two, 'not onto another figure');
assert.equal(moveFigure(two, 0, { col: 9, row: 1 }), two, 'not out of the scene');
assert.deepEqual(nudgeSelected(two, catalog, { kind: 'figure', index: 0 }, { col: 0, row: 1 }).figures?.[0], { col: 1, row: 2 });
assert.equal(nudgeSelected(stuff, catalog, { kind: 'prop', index: 0 }, { col: 1, row: 0 }).props[0].col, 1);
assert.equal(nudgeSelected(stuff, catalog, { kind: 'wall', at: { col: 3, row: 2 } }, { col: 1, row: 0 }), stuff, 'a wall stays on its vertex');

// 24. Walls are carried like props: the wall moves with its look, the run it joins redraws as it goes, and a taken or outside place leaves it where it was.
const twoWalls = setWallHeight(paint(paint(room, 'walls', { col: 1, row: 1 }, 'wall'), 'walls', { col: 3, row: 1 }, 'wall'), { col: 1, row: 1 }, 'fence');
assert.deepEqual(moveWall(twoWalls, { col: 1, row: 1 }, { col: 2, row: 2 }).walls[2][2], { piece: 'wall', height: 'fence' }, 'it keeps its height');
assert.equal(moveWall(twoWalls, { col: 1, row: 1 }, { col: 2, row: 2 }).walls[1][1], null);
assert.equal(moveWall(twoWalls, { col: 1, row: 1 }, { col: 3, row: 1 }), twoWalls, 'not onto another wall');
assert.equal(moveWall(twoWalls, { col: 1, row: 1 }, { col: 9, row: 1 }), twoWalls, 'not outside the grid');
assert.equal(moveWall(twoWalls, { col: 0, row: 0 }, { col: 2, row: 2 }), twoWalls, 'nothing to move');
let wallDrag = startMoveWall(twoWalls, { col: 1, row: 1 }, { col: 1, row: 1 });
assert.equal(isCarrying(wallDrag), false, 'still on its vertex');
wallDrag = advance(wallDrag, { col: 2, row: 2 }, bordered);
assert.equal(isCarrying(wallDrag), true);
assert.deepEqual(wallDrag.scene.walls[2][2], { piece: 'wall', height: 'fence' }, 'the scene shows it where it would land');
assert.equal(wallDrag.base, twoWalls);
assert.equal(advance(wallDrag, { col: 3, row: 1 }, bordered), wallDrag, 'a taken vertex leaves it at the last good one');
assert.equal(resultOf(advance(wallDrag, { col: 1, row: 1 }, bordered), bordered), twoWalls, 'back where it started: nothing changed');
// Grabbed away from its vertex, it keeps the offset to the pointer.
const grabbed = advance(startMoveWall(twoWalls, { col: 1, row: 1 }, { col: 2, row: 1 }), { col: 3, row: 3 }, bordered);
assert.deepEqual(grabbed.scene.walls[3][2], { piece: 'wall', height: 'fence' });

// 25. Scale figures are carried too.
const figs = toggleFigure(toggleFigure(base, { col: 1, row: 1 }), { col: 3, row: 2 });
let figDrag = startMoveFigure(figs, 0, { col: 1, row: 1 });
figDrag = advance(figDrag, { col: 2, row: 0 }, catalog);
assert.deepEqual(figDrag.scene.figures, [{ col: 2, row: 0 }, { col: 3, row: 2 }]);
assert.equal(advance(figDrag, { col: 3, row: 2 }, catalog), figDrag, 'not onto another figure');
assert.deepEqual(resultOf(figDrag, catalog).figures?.[0], { col: 2, row: 0 });
assert.equal(resultOf(advance(figDrag, { col: 1, row: 1 }, catalog), catalog), figs, 'back where it started: nothing changed');

// 26. The scene is drawn at the export scale at most, and shown larger with hard edges.
assert.deepEqual([1, 1.5, 2].map(renderScale), [1, 1.5, 2], 'up to the export scale it is drawn as asked');
assert.deepEqual([4, 6, 8].map(renderScale), [2, 2, 2], 'beyond it, at the export scale: a whole block of screen pixels for each drawn one');
assert.deepEqual([3, 5].map(renderScale), [1, 1], 'an odd whole ratio is drawn at 1, which divides it');
assert.equal(renderScale(3.5), 2, 'a fractional ratio is drawn at the export scale and shown a little larger');

// 27. Doors stand on cell edges: placed on the nearest one, never twice on one, carried along the edges.
const door = info('door');
const hall = emptyScene(bordered, 4, 3);
assert.equal(edgeInside(hall, { col: 3, row: 3, edge: 'N' }), true, 'the north edge of a cell below the last row is the scene border');
assert.equal(edgeInside(hall, { col: 4, row: 2, edge: 'W' }), true, 'so is the west edge of a cell right of the last column');
assert.equal(edgeInside(hall, { col: 4, row: 0, edge: 'N' }), false);
assert.equal(edgeInside(hall, { col: 0, row: 4, edge: 'W' }), false);
const doored = placeDoor(hall, door, { col: 1, row: 0, edge: 'N' }, { state: 'open' });
assert.deepEqual(doored.props, [{ piece: 'door', col: 1, row: 0, edge: 'N', state: 'open' }]);
assert.equal(placeDoor(hall, door, { col: 1, row: 0, edge: 'N' }).props[0].state, undefined, 'the first state is the default and is not stored');
assert.equal(placeDoor(doored, door, { col: 1, row: 0, edge: 'N' }), doored, 'an edge holds one door');
assert.equal(placeDoor(doored, door, { col: 1, row: 0, edge: 'W' }).props.length, 2, 'the west edge of the same cell is another edge');
assert.equal(placeDoor(hall, door, { col: 9, row: 0, edge: 'N' }), hall, 'not outside the scene');
assert.equal(doorAt(doored, { col: 1, row: 0, edge: 'N' }), 0);
assert.equal(doorAt(doored, { col: 1, row: 0, edge: 'W' }), -1);
assert.equal(isDoor(doored.props[0]), true);
assert.deepEqual(edgeOf(doored.props[0]), { col: 1, row: 0, edge: 'N' });
assert.equal(sameEdge(edgeOf(doored.props[0]), { col: 1, row: 0, edge: 'N' }), true);
// The side a door faces: the engine's default faces across the edge, the other side is a stored facing.
assert.equal(canFlip(door), true);
assert.equal(canFlip(info('wall')), false, 'a piece with one facing has nothing to flip');
const flippedN = flipDoor(doored, catalog, 0);
assert.equal(flippedN.props[0].dir, 2, 'a north edge faces north when flipped (of four facings)');
assert.equal(isFlipped(door, flippedN.props[0]), true);
assert.equal(isFlipped(door, doored.props[0]), false);
assert.equal(flipDoor(flippedN, catalog, 0).props[0].dir, undefined, 'flipped again, it is back to the default');
const westDoor = placeDoor(hall, door, { col: 0, row: 1, edge: 'W' }, { flip: true });
assert.equal(westDoor.props[0].dir, 1, 'a west edge faces west when flipped');
assert.equal(rotateProp(doored, catalog, 0, 1).props[0].dir, 2, 'R on a door turns it to its other side');
assert.equal(setDirection(doored, catalog, 0, 1), doored, 'a door is not given any facing');
// Moving a door: it keeps its state and side, and goes only to a free edge on the scene.
assert.deepEqual(moveDoor(flippedN, catalog, 0, { col: 3, row: 3, edge: 'N' }).props[0], { piece: 'door', col: 3, row: 3, edge: 'N', state: 'open', dir: 2 });
assert.equal(moveDoor(doored, catalog, 0, { col: 1, row: 0, edge: 'N' }), doored, 'not onto itself');
assert.equal(moveDoor(doored, catalog, 0, { col: 5, row: 0, edge: 'N' }), doored, 'not outside');
const twoDoors = placeDoor(doored, door, { col: 2, row: 0, edge: 'N' });
assert.equal(moveDoor(twoDoors, catalog, 0, { col: 2, row: 0, edge: 'N' }), twoDoors, 'not onto another door');
const turnedCorner = moveDoor(flippedN, catalog, 0, { col: 1, row: 1, edge: 'W' });
assert.equal(turnedCorner.props[0].dir, 1, 'moved to a west edge it faces west: the same side, turned with the edge');
assert.equal(turnedCorner.props[0].edge, 'W');
assert.equal(validSelection(turnedCorner, { kind: 'prop', index: 0 })?.kind, 'prop');
// Arrows push a door a cell along; it never changes edge that way.
assert.deepEqual(edgeOf(nudgeSelected(doored, catalog, { kind: 'prop', index: 0 }, { col: 1, row: 0 }).props[0]), { col: 2, row: 0, edge: 'N' });
assert.equal(nudgeSelected(doored, catalog, { kind: 'prop', index: 0 }, { col: 0, row: -1 }), doored, 'a north edge above the scene is not there');
assert.equal(moveProp(doored, catalog, 0, { col: 0, row: 0 }), doored, 'moveProp is for cells, not doors');
// A door is neither copied nor found by cell: it is found by its picture.
assert.equal(duplicateProp(doored, catalog, 0), doored);
assert.deepEqual(propsAt(doored, catalog, { col: 1, row: 0 }), []);
// Its state, like any placement's.
const chest = placeProp(emptyScene(catalog, 3, 3), info('urn'), { col: 0, row: 0 }, { state: 'broken' });
assert.equal(chest.props[0].state, 'broken');
assert.equal(setState(chest, catalog, 0, undefined).props[0].state, undefined, 'the default state is dropped');
assert.equal(setState(doored, catalog, 0, 'closed').props[0].state, undefined);
assert.equal(setState(doored, catalog, 0, 'ajar'), doored, 'only the piece\'s own states');
assert.equal(setState(placeProp(emptyScene(catalog, 3, 3), info('crate'), { col: 0, row: 0 }), catalog, 0, 'open').props[0].state, undefined, 'a piece without states has none');
// Resizing drops the doors that fall off the scene, keeps the ones on its new border.
const border = placeDoor(placeDoor(hall, door, { col: 4, row: 1, edge: 'W' }), door, { col: 1, row: 3, edge: 'N' });
assert.equal(resize(border, bordered, 4, 3).props.length, 2);
assert.deepEqual(resize(border, bordered, 3, 3).props.map((p) => p.edge), ['N'], 'the west edge at column 4 is outside 3 columns');
assert.deepEqual(resize(border, bordered, 4, 2).props.map((p) => p.edge), ['W'], 'the north edge at row 3 is outside 2 rows');
// Dragging: the door follows the pointer's edges, the scene shows it where it would land.
let carry = startMoveDoor(doored, 0);
assert.equal(isCarrying(carry), false);
carry = advanceDoor(carry as Extract<typeof carry, { kind: 'move-door' }>, { col: 3, row: 1, edge: 'W' }, catalog);
assert.equal(isCarrying(carry), true);
assert.deepEqual(edgeOf(carry.scene.props[0]), { col: 3, row: 1, edge: 'W' });
assert.equal(carry.base, doored);
assert.equal(advanceDoor(carry as Extract<typeof carry, { kind: 'move-door' }>, { col: 9, row: 1, edge: 'W' }, catalog), carry, 'an edge outside leaves it at the last good one');
assert.equal(resultOf(advanceDoor(carry as Extract<typeof carry, { kind: 'move-door' }>, { col: 1, row: 0, edge: 'N' }, catalog), catalog), doored, 'back where it started: nothing changed');
// The edge under a point of the drawing: the nearest of the horizontal and vertical ones.
const sheetGeo = { width: 0, height: 0, origin: { x: 100, y: 100 }, cell: { w: 40, h: 30 } };
const edgeLeft = 100 - 20;
const edgeTop = 100 - 15;
assert.deepEqual(edgeFromPoint(sheetGeo, edgeLeft + 60, edgeTop + 31).edge, { col: 1, row: 1, edge: 'N' }, 'just under a horizontal edge');
assert.deepEqual(edgeFromPoint(sheetGeo, edgeLeft + 79, edgeTop + 40).edge, { col: 2, row: 1, edge: 'W' }, 'just left of a vertical one');
assert.deepEqual(edgeFromPoint(sheetGeo, edgeLeft + 60, edgeTop + 29).edge, { col: 1, row: 1, edge: 'N' }, 'and just above it');
assert.equal(edgeFromPoint(sheetGeo, edgeLeft + 60, edgeTop + 31).distance < 0.1, true);
assert.deepEqual(edgeLine(sheetGeo, { col: 1, row: 1, edge: 'N' }), { x1: edgeLeft + 40, y1: edgeTop + 30, x2: edgeLeft + 80, y2: edgeTop + 30 });
assert.deepEqual(edgeLine(sheetGeo, { col: 2, row: 0, edge: 'W' }), { x1: edgeLeft + 80, y1: edgeTop, x2: edgeLeft + 80, y2: edgeTop + 30 });

// 28. The painter opens fitted: Fit is the largest zoom step at which the whole drawing (the room for tall pieces included) fits the canvas box.
// Only `grid.screen` is read: Soulkeeper's cells are 48 × 36.
const kit48 = { grid: { screen: { w: 48, h: 36 } } } as unknown as SceneryCatalog;
const drawing = geometryOf({ cols: 16, rows: 12 }, kit48);
assert.deepEqual([drawing.width, drawing.height], [960, 672], 'the default scene and its room for tall pieces');
assert.equal(fitZoom(drawing, { width: 1072, height: 600 }), 0.75, 'a laptop canvas: at 1× the drawing would scroll (672 > 568)');
assert.equal(fitZoom(drawing, { width: 2200, height: 1500 }), 2, 'the largest step that fits');
assert.equal(fitZoom(geometryOf({ cols: 4, rows: 3 }, kit48), { width: 1600, height: 1200 }), 3, 'a small scene is shown large (384 × 348 at 4× is too tall)');
assert.equal(fitZoom(geometryOf({ cols: 64, rows: 64 }, kit48), { width: 1000, height: 600 }), ZOOMS[0], 'when nothing fits, the smallest step');
// Fit only ever takes a step, so a resize changes the drawing scale (and empties the renderer's cache) only at a step.
for (const [width, height] of [[300, 200], [1072, 600], [1366, 700], [2560, 1400]]) {
  assert.ok((ZOOMS as readonly number[]).includes(fitZoom(drawing, { width, height })), `${width} × ${height} fits at a step`);
}
// − and + step from the zoom on screen, Fit's included, and hold at both ends.
assert.deepEqual([stepZoom(0.75, 1), stepZoom(1, -1), stepZoom(2, 1), stepZoom(4, 1), stepZoom(0.25, -1)], [1, 0.75, 3, 4, 0.25]);

console.log('✅ viewer scenery edit checks passed');
