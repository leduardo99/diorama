import { isPairedSlot, partRequires, removePiece as takeOut, type GearCatalog, type OutfitData, type PartInfo, type PartOption, type Slot } from '@core/rig';

/** Pure edits of an outfit: every function returns a new outfit and leaves the one it was given alone. */

export type Piece = OutfitData['pieces'][number];
export type Side = 1 | -1;

/** Slots that come in pairs and take a side. */
export const isPaired = isPairedSlot;

/** Rules for a piece's name, which other pieces refer to with `on`. */
function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const idsOf = (outfit: OutfitData) => new Set(outfit.pieces.flatMap((p) => (p.id ? [p.id] : [])));

export const partOf = (catalog: GearCatalog, id: string): PartInfo | undefined => catalog.parts.find((p) => p.id === id);

/** The value an option has when the piece does not set it. */
export const defaultsOf = (info: PartInfo): Record<string, unknown> => Object.fromEntries((info.options ?? []).map((o) => [o.key, o.default]));

export const optionValue = (piece: Piece, option: PartOption): unknown => piece.options?.[option.key] ?? option.default;

/**
 * Adds a part to the outfit, once per side for a paired slot. Every piece gets an id, so another one can rest on it
 * later. `on` is the id of the piece it rests on.
 */
export function addPiece(outfit: OutfitData, info: PartInfo, where: { slot: Slot; sides?: Side[]; on?: string }): OutfitData {
  const taken = idsOf(outfit);
  const sides: Array<Side | undefined> = isPaired(where.slot) ? (where.sides?.length ? where.sides : [1]) : [undefined];
  const pieces = [...outfit.pieces];
  for (const side of sides) {
    const id = uniqueId(side === undefined ? info.id : `${info.id}-${side > 0 ? 'right' : 'left'}`, taken);
    taken.add(id);
    pieces.push({ part: info.id, slot: where.slot, ...(side === undefined ? {} : { side }), id, ...(where.on ? { on: where.on } : {}) });
  }
  return { ...outfit, pieces };
}

/** Removes a piece (the engine's `removePiece`): the add-ons that need it go with it, the other pieces resting on it stay, resting on nothing. Says how many went. */
export function removePiece(outfit: OutfitData, catalog: GearCatalog, index: number): { outfit: OutfitData; removed: number } {
  const edit = takeOut(outfit, catalog, index);
  return { outfit: edit.outfit, removed: edit.removed.length };
}

/** Whether a piece may move one place up (-1) or down (1): a piece never goes before the one it rests on, nor after one resting on it. */
export function canMove(outfit: OutfitData, index: number, delta: -1 | 1): boolean {
  const target = index + delta;
  if (target < 0 || target >= outfit.pieces.length) return false;
  const [first, second] = delta < 0 ? [outfit.pieces[target], outfit.pieces[index]] : [outfit.pieces[index], outfit.pieces[target]];
  return !(second.on && second.on === first.id);
}

export function movePiece(outfit: OutfitData, index: number, delta: -1 | 1): OutfitData {
  if (!canMove(outfit, index, delta)) return outfit;
  const pieces = [...outfit.pieces];
  [pieces[index], pieces[index + delta]] = [pieces[index + delta], pieces[index]];
  return { ...outfit, pieces };
}

/**
 * Moves a piece from one place in the drawing order to another (a drag in the list), as that many single moves: it passes
 * every piece between, so it is refused, and the outfit returned as it was, when one of them is the piece it rests on (going
 * up) or rests on it (going down), the rule `canMove` keeps.
 */
export function reorderPiece(outfit: OutfitData, from: number, to: number): OutfitData {
  if (from === to || from < 0 || to < 0 || from >= outfit.pieces.length || to >= outfit.pieces.length) return outfit;
  const delta = to > from ? 1 : -1;
  let next = outfit;
  for (let at = from; at !== to; at += delta) {
    if (!canMove(next, at, delta)) return outfit;
    next = movePiece(next, at, delta);
  }
  return next;
}

/**
 * A key for each piece that stays with it when the order changes (a drag, the arrows): its id, else its part, place and
 * side with a count for repeats. Two pieces without an id that share all of these are alike, so either key fits either.
 */
export function pieceKeys(outfit: OutfitData): string[] {
  const seen = new Map<string, number>();
  return outfit.pieces.map((piece) => {
    const base = piece.id !== undefined ? `id:${piece.id}` : `part:${piece.part}:${piece.slot}:${piece.side ?? 0}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}#${count + 1}`;
  });
}

function replace(outfit: OutfitData, index: number, piece: Piece): OutfitData {
  return { ...outfit, pieces: outfit.pieces.map((p, i) => (i === index ? piece : p)) };
}

/** Moves a piece to another of the slots its part fits; a paired slot gets a side, a central one loses it. */
export function setSlot(outfit: OutfitData, index: number, slot: Slot): OutfitData {
  const { side: _side, ...piece } = outfit.pieces[index];
  return replace(outfit, index, { ...piece, slot, ...(isPaired(slot) ? { side: outfit.pieces[index].side ?? 1 } : {}) });
}

export function setSide(outfit: OutfitData, index: number, side: Side): OutfitData {
  return replace(outfit, index, { ...outfit.pieces[index], side });
}

/** Sets an option; a value equal to the part's default is dropped, so the saved outfit only holds what was changed. */
export function setOption(outfit: OutfitData, index: number, option: PartOption, value: unknown): OutfitData {
  const { [option.key]: _old, ...rest } = outfit.pieces[index].options ?? {};
  const options = value === option.default ? rest : { ...rest, [option.key]: value };
  const { options: _options, ...piece } = outfit.pieces[index];
  return replace(outfit, index, Object.keys(options).length ? { ...piece, options } : piece);
}

/** The earlier pieces a piece can rest on: the ones of the part it `requires`, or any earlier piece when none matches. */
export function hostCandidates(outfit: OutfitData, index: number, info: PartInfo): number[] {
  const earlier = outfit.pieces.map((_, i) => i).filter((i) => i < index);
  const required = partRequires(info);
  const named = required.length ? earlier.filter((i) => required.includes(outfit.pieces[i].part) || required.includes(outfit.pieces[i].id ?? '')) : [];
  return named.length ? named : earlier;
}

/** Makes a piece rest on an earlier one (giving that one an id if it had none), or on nothing. */
export function setHost(outfit: OutfitData, index: number, host: number | null): OutfitData {
  const { on: _on, ...piece } = outfit.pieces[index];
  if (host === null) return replace(outfit, index, piece);
  const target = outfit.pieces[host];
  const id = target.id ?? uniqueId(target.part, idsOf(outfit));
  const next = target.id ? outfit : replace(outfit, host, { ...target, id });
  return replace(next, index, { ...piece, on: id });
}

/** Sets which theme material plays a role for the whole outfit; `undefined` takes the role out. */
export function setMaterial(outfit: OutfitData, role: string, name: string | undefined): OutfitData {
  const { [role]: _old, ...rest } = outfit.materials;
  return { ...outfit, materials: name ? { ...rest, [role]: name } : rest };
}

/** The same for one piece: its own material for a role overrides the outfit's. */
export function setPieceMaterial(outfit: OutfitData, index: number, role: string, name: string | undefined): OutfitData {
  const { materials: current, ...piece } = outfit.pieces[index];
  const { [role]: _old, ...rest } = current ?? {};
  const materials = name ? { ...rest, [role]: name } : rest;
  return replace(outfit, index, Object.keys(materials).length ? { ...piece, materials } : piece);
}

export function setBase(outfit: OutfitData, base: string | undefined): OutfitData {
  const { base: _old, ...rest } = outfit;
  return base ? { ...rest, base } : rest;
}

export interface Roles {
  /** Roles a material should be chosen for. */
  main: string[];
  /** Refinements that fall back to another role when left alone: `metalAccent` to `metal`, `woodSeam` to `wood`. */
  advanced: string[];
}

/**
 * Splits the roles one part reads. The kit lists a part's roles with their fallbacks (`['metalAccent', 'metal']`), so a role
 * that extends another one of the list (`metal` + `Accent`) is a refinement: leaving it out costs nothing.
 */
export function splitRoles(roles: string[]): Roles {
  const refines = (role: string) => roles.some((base) => base !== role && role.startsWith(base) && /[A-Z]/.test(role[base.length] ?? ''));
  return { main: roles.filter((r) => !refines(r)), advanced: roles.filter(refines) };
}

/** Roles of the whole outfit: the base's and the parts', a role being advanced only when no piece needs it as a main one. */
export function rolesOf(outfit: OutfitData, catalog: GearCatalog): Roles {
  const body = splitRoles(catalog.bases.find((b) => b.id === outfit.base)?.roles ?? []);
  const main = new Set<string>(body.main);
  const advanced = new Set<string>(body.advanced);
  for (const piece of outfit.pieces) {
    const split = splitRoles(partOf(catalog, piece.part)?.roles ?? []);
    split.main.forEach((role) => main.add(role));
    split.advanced.forEach((role) => advanced.add(role));
  }
  return { main: [...main], advanced: [...advanced].filter((role) => !main.has(role)) };
}

/** The parts that fit a slot, or all of them, grouped for the picker in catalog order. */
export function partsBySlot(catalog: GearCatalog, slot?: Slot): Array<{ group: string; parts: PartInfo[] }> {
  const groups = new Map<string, PartInfo[]>();
  for (const part of catalog.parts) {
    if (slot && !part.slots.includes(slot)) continue;
    groups.set(part.group, [...(groups.get(part.group) ?? []), part]);
  }
  return [...groups].map(([group, parts]) => ({ group, parts }));
}
