# Gear and outfits (`@core/rig`)

**Purpose.** Build armor, weapons, garments and effects once, as parts, and dress any character with them. A soldier and its officer can share a helm in two materials; a new character is a new list of parts. The engine gives the mechanics: where a part sits on a pose, mirroring, held items, materials by role, composition, outfits as data and a catalog for editors. The parts themselves are the project's art and live in its kit.

**API reference:** [`docs/api/rig.md`](../../api/rig.md): `bodyFrames`, `chestJoint`, `slotFrame`, `held`, `outfit`, `outfitFromData`, `validateOutfit`, `Part`, `MaterialSet`, `GearCatalog`, `PartInfo`, `OutfitData`, `OutfitCharacterInfo`. How an item sits in the hand and how the hand closes on it (`Hold`, `Grip`, `PartContext.grip`) is [guide 06](06-holding-items.md).

**Worked kit:** `npm run new-kit -- <project> gear` starts one with a first part, its catalog and its index; this guide explains each piece of it.

---

## 1. The kit

A project keeps its parts in `src/gear/`, one file per family (nothing in `src/` is exported by itself; the sheets in `sheets/` are):
- `heads.ts`: skulls, helms, crowns of fire;
- `shoulders.ts`, `torso.ts`, `garments.ts`: coats, tunics, tabards, belts;
- `weapons.ts`, `shields.ts`, `effects.ts`: smears, palm flames, shockwaves;
- `bodies.ts`: base bodies, such as bone limbs or flesh;
- `index.ts`: re-exports the parts and documents the material roles the kit reads;
- `catalog.ts`: the editor catalog (§5).

`npm run new-kit -- <project> gear` starts the kit in a project that has none: a helm in `heads.ts`, a mannequin body in `bodies.ts`, `index.ts`, and a `catalog.ts` whose `CHARACTERS` lists a mannequin that wears the helm, so `gear-items`, the customizer and `new-outfit-character` work at once. The helm is a block-out to make the project's own.

Each part is a `Part<Options>`: `(ctx, options) => Placed | void`. Its JSDoc gives:
- the slot it is made for;
- the material roles it reads;
- every option with its default;
- the helpers it exports, for sockets and for parts that sit on it.

For example, a helm exports its dome geometry, so a crest can rest on it without copying numbers.

## 2. Writing a part

- **Build in the slot's frame:** `ctx.at.frame`, which is right-handed: forward, right, up.
  - Multiply side offsets by `ctx.at.side` (−1 left, 1 right) for mirrored parts such as pauldrons, bracers and greaves. Never flip an axis instead: a flipped frame turns faces inside out.
  - Limb slots give the bone length in `ctx.at.length`.
  - The chest, back and shoulder slots sit on `chestJoint(skeleton)`, the joint the arms hang from (not a neck above it).
- **Follow the body:** `ctx.body` has `up`, `forward`, `right`, the hip axes, and `lie` (0 standing, 1 lying in a death). Hanging gear drapes by `lie`: capes, tabards, scabbards, lanterns. Never use world up for anything attached to the trunk.
- **Materials by role:** `ctx.materials.metal`, `.cloth`, `.bone` and so on.
  - The vocabulary is the kit's own, listed in `index.ts` (for example metal, metalAccent, blade, cloth, clothAccent, leather, wood, bone, boneLimb, hollow, glow).
  - Fall back where it makes sense (`materials.metalAccent ?? materials.metal`). Throw with the role's name when a required role is missing.
  - Never import `VOLUMES` or palette colors in a part, or it cannot be re-materialed.
- **Return the volume you added** (the `Round`, `Solid`, `Tube` or `Blob`), not what `object.add()` returns. Other parts rest `on` it through `ctx.host`.
- **Sorting:**
  - Something always over its host goes `on` it: a crest on a helm, a boss on a shield.
  - Something on one side of the body (a breastplate over a coat, a nasal bar) sorts by depth, or uses `on` only while its face is towards the camera (`cam.faces`). Otherwise it shows through the body from behind.
  - Bands go through `visibleArc` / `bandOnEllipsoid`.
  - Piece order only breaks exact depth ties.
- **Held items** (weapons, staves, lanterns) use `held(pose, skeleton, hand, { rest, length, butt })`:
  - It reads the clip's `weaponYaw` / `weaponPitch`, lays the item on the floor in a death, and keeps the tip above the floor.
  - With the item's `hold` (`held(..., { hold })`) the grip sits in the palm of the hand, not at the wrist, and the part draws its handle round `grip`. Without one the grip is the wrist, as before. Guide 06 has the rules and §4 of it the declaration.
  - Items that extend on both sides of the hand (staves, snaths, spears) set `butt`: the end behind the grip shortens to touch the floor instead of sinking.
  - The frame's roll is stable. A blade that must face a given way reads its heading from the clip, by convention `extra.bladeAim` (radians in the creature's frame, 0 = forward).
  - Give the part's `PartInfo.wield.sockets` a `tip` that calls the same `held`, so the drawing and the socket agree and the socket follows the weapon into any outfit (see Holding in §5).
  - In the left hand an item reads the off-hand channels: pass `channel: weaponChannel(ctx.at.side)`.
  - A longer weapon is an option of the part (`length`), passed to its effects and its socket helper too.
- **Hands:** a part in the `hand` slot receives `ctx.grip` while its hand holds something, and draws a closed fist round it. Without it, it draws exactly what it drew before (guide 06 §5).
- **Drawn effects** (flames, glows, smears) go through `object.custom(at, draw, { on })`:
  - A custom drawing sorts at its own point, so fire behind a skull is placed behind the head along `camera.viewDir`.
  - A lick of flame over a surface checks `cam.faces` so it does not show through from behind.
  - Effects that start at events (a smear before `hit`, a shockwave after `release`) read `ctx.kit.clip.events` and `ctx.kit.t`.
- **Long props and the cell:** a weapon that falls to the floor in a death needs room. A lying humanoid with a long scythe or spear needs about 0.67 × height below the pivot (0.3 × height without it).

## 3. Outfits

`outfit({ base, materials, pieces })` returns a skin:
- **`base`** draws the body (bones, flesh, fur) and receives the outfit's materials as a fourth argument.
- **`materials`** maps roles to theme materials: `{ metal: VOLUMES.iron, cloth: VOLUMES.sash, bone: VOLUMES.bone }`.
- **`pieces`** are drawn after the base. Each piece has:
  - `part`, `slot`, `side`, `options`;
  - its own `materials`, merged role by role over the outfit's (a gilded pauldron on an iron suit);
  - an `id`, needed for other pieces to rest on it, and `on`, the `id` of an earlier piece;
  - `hidden`: placed for the pieces resting on it, but not drawn (an inventory icon's helm without its skull).

## 4. Outfits as data and variants

`OutfitData` is the same thing in JSON: parts by catalog id, materials by name. `outfitFromData(data, CATALOG)` turns it into a skin, filling in each part's declared option defaults. `validateOutfit(data, CATALOG)` lists every problem: unknown part or material, a slot the part does not fit, a missing host or one of a part it does not accept, two pieces with one `id`, two parts in one equipment slot on one side, an option out of range.

- **One source of truth:** keep each character's outfit as data (`src/characters/<name>/outfit.ts` exporting `OUTFIT`). Build its skin with `outfitFromData(OUTFIT, CATALOG)`, so the viewer's customizer edits exactly what the game exports.
- **A variant** is a new character with the same skeleton, clips and cell and another outfit:
  - With the viewer's Customize tab: pick a character, change pieces, options and materials, save.
  - From the command line: `npm run new-outfit-character -- <project> <name> --from <character> --outfit <file.json>` writes `src/characters/<name>/outfit.ts`, `character.ts` and one sheet per clip in `sheets/characters/<name>/`.
  - Clip factories shared by several characters live in one module (`src/characters/shared/humanoid-clips.ts`), not inside another character's folder.
- **A new material for a variant** (steel, brass) is a new key in the theme's `VOLUMES`. Check it against the style (a style that keeps one saturated accent keeps it for one thing) and write it in `STYLE.md`.

## 5. The catalog

`src/gear/catalog.ts` exports two things:
- **`CATALOG: GearCatalog`:**
  - `parts`: one `PartInfo` per part, with id, label, group, the slots it fits, the roles it reads, `options` metadata (number with min/max, boolean or select, each with the part's own default), and:
    - `requires` for add-ons: the part, or list of parts, it must rest on (a crest on a helm, a smear on any blade);
    - `kind`: `gear` (default), `body` (the creature under the gear: bone limbs, a rib cage, a skull) or `effect` (a flourish played by clips). Without it, the groups `bodies` and `effects` count as body and effect. Editors fold bodies away; `gear-items` and item lists skip bodies and effects;
    - `equip`: the equipment slot the part takes alone (`helm`, `weapon`, `shield`, `pauldron`). Two parts with the same `equip` on one side replace each other. Parts without one are layers that stack: a tunic under a tabard, a pouch beside a belt. A slot is a place on the body, not an exclusive spot: one pelvis can carry a tunic, a tabard, a belt and a pouch;
  - `bases`;
  - `materials` (the theme's `VOLUMES`).
- **`CHARACTERS: OutfitCharacterInfo[]`:** the characters an outfit can be put on, each with skeleton, clips, cell, pivot, sockets and its default outfit. Its `label` is the name the customizer shows: keep it in the rig spec that `defineCharacter` spreads too (`label` in `characters/<name>/spec.ts`, as the sample does), so the customizer and the exported manifest say the same name.

Editors read this. Whenever you add or change a part, update its `PartInfo` in the same change: an option missing from the catalog cannot be edited, and a wrong default changes saved outfits.

**Editing outfits.** Editors and games change an outfit with the same rules (`@core/rig`):
- `slotsOf(skeleton)`: the slots a skeleton has, with sides (a wolf has no arm slots);
- `swapCandidates(catalog, outfit, index)`: the parts that can take a piece's place: same kind, fitting its slot, the same `equip` (or, without one, the same group and the same `requires`);
- `swapPiece(outfit, catalog, index, part)`: the part in the piece's place. It keeps the side, `id` and host, the piece's materials for the roles the part reads, and the options it shares (clamped). The add-ons that do not accept the new part go (a crest when a helm becomes a crown); the pieces resting on it without `requires` stay on it (a belt on a tunic that becomes a tabard). It throws rather than leave two pieces in one equipment slot or one hand: a part whose `equip` another piece holds on that side, or a held part the hands cannot take (`swapBlocker(catalog, outfit, index, part)` names the piece in the way, so an editor can say "taken by the helm"; `equipPart` replaces it);
- `equipPart(outfit, catalog, part, { slot, side })`: what a game does when a player equips an item. It replaces whatever holds the part's `equip` on that side (in that piece's slot, unless `slot` names another), or adds the part, on the host it needs. A held part takes its hand: what else is held in that hand goes, and a two-handed part empties the other hand too (a shield equipped beside a two-handed scythe takes the scythe out);
- `removePiece(outfit, catalog, index)`: the piece and the add-ons that need it go; the others resting on it stay, resting on nothing.

Each returns `{ outfit, removed, index, notes }`: a new outfit (the one given is never changed), the indices taken out, where the swapped or equipped piece is now, and what changed in words an editor can show. A host comes before the pieces resting on it: when the new part's host is later in the list, the piece moves to just after it.

**Holding: weapons, shields and the clips made for them.** A character's attacks are made for what it holds: a slash for a blade, a reap for a scythe. So held parts and clips both say it:
- **`PartInfo.wield`:** `class` (`blade`, `polearm`, `staff`, `bow`, `shield`, or the project's own), `hands` (2 leaves nothing in the other hand), `offHand` (`hold` for what may simply be held in the left hand, a shield or a lantern; `swing`, the default, for what needs clips that swing it), and `sockets`: points on the item, from the same `held` call the part draws with (a blade's `tip`, using the piece's `length` option). Three more fields say how it is held (guide 06 §4): `hold` (a `Hold`: the handle and where the hands close on it, for tools; the engine reads the hold from what `held` returns), `held` (that same `held` call, with the hold, so the hand parts on that side close on the item and an item that takes both hands brings the other hand to its second grip) and `grip` (for an item on the forearm, where the hand closes). A part with neither `held` nor `grip` is placed and drawn as before and its hands are not checked.
- **A hand holds one part.** Its hand and forearm slots together hold one wielded part (a sword in the hand, or a shield on the forearm), and a two-handed part leaves the other hand empty. `validateOutfit` reports both; `equipPart` settles them.
- **The main hand is the right one.** A held item reads the clip's `weaponYaw` / `weaponPitch` in the right hand and `offWeaponYaw` / `offWeaponPitch` in the left (`held(..., { channel: weaponChannel(ctx.at.side) })`), and likewise `weaponRelease` / `offWeaponRelease` to let go, so a second weapon keeps its rest instead of copying the main hand's swing.
- **`CharacterClip.wields`:** `{ main: ['blade'] }` for a slash, `{ off: ['shield'] }` for a shield bash, `{ main: ['blade'], off: ['blade'] }` for a two-weapon combo; `unarmed` stands for an empty hand. Clips without it (walk, hit, a spell) suit anything.
- **`defineCharacter({ outfit: { data, catalog } })`** (the skin then defaults to `outfitFromData`): the held items' sockets replace the character's sockets of the same name (the off hand's are `off-<name>`), so sparks and smears follow the weapon it holds. The export also measures how its hands hold what it holds (`meta.data.grips`; guide 06 §6). Clips made for something else are marked `usable: false` and left out of `controls`, and `warnings` says what does not match: an attack for a blade on a character holding a scythe, or a second sword no clip swings.
- **Editors and games** call `checkWield(clips, outfit, catalog)` after an edit (the usable and unusable clips, the warnings) and `wieldOf(outfit, catalog)` for what each hand holds. A character that should fight with a new class of weapon needs clips made for it, usually shared clip factories (`src/characters/shared/humanoid-clips.ts`).

**Gear assets.** Every part is also exported on its own: `defineGearAsset({ catalog, character, part })` draws the part alone in every facing, worn by `character`, whose body is not drawn. The sheet shares that character's cell and pivot, so it lines up with the character's sheets. Add-ons are drawn with the piece they rest on. `npm run gear-items -- <project>` writes one generated sheet per catalog part in `sheets/gear/` (effects and base bodies are skipped; `--force` rewrites existing files). Run it after adding parts, then export `gear/`. The viewer lists these sheets with `role: 'gear'` (with the part's `kind` and `equip`), and the customizer can use them as thumbnails.

## 6. Checklist for a part

- It reads right in all 8 facings, on both sides (mirrored), during a twist (attack), a pitch (hit) and lying down (death).
- It uses only material roles; no raw colors, no `VOLUMES` import.
- It is in the catalog with its true slots, roles and option defaults.
- It adds to the detail tiers of the quality bar. A part is usually one primary or secondary feature plus its tertiary details: rivets, straps, runes.
- It costs a few milliseconds per cell at most.
- A held part declares its `hold`, places itself with it and closes the hands on it, and `npm run inspect` prints `grips: clean` for the characters that wear it (guide 06 §7).
- Review sheets: `npm run contact` writes them under `<project>/review/contact/`. Pass `--out <file.png>` to keep scratch sheets elsewhere.
