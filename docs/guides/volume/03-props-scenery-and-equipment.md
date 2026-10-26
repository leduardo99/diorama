# Props, Scenery and Equipment (`@core/volume`)

**Purpose.** How each kind of 2.5D asset is planned so a whole project reads as one game: shared scale, modular scenery, and equipment pieces (worn, carried or held) reused between characters and icons.

**API reference:** [`docs/api/volume.md`](../../api/volume.md). Signatures are not repeated here.

---

## 1. One world scale per project

Fix a reference size and write it in `STYLE.md` before the first volume asset: for example "a character is 80 units tall, a door is 92, a floor cell is 48 × 36 on screen" (one starting point, the `jrpg` preset at that height), or "a character is 64 tall and a floor cell is 64 × 48 on screen, as wide as the character is tall" (the `tactics` preset); the presets and how to override them are in guide 04 §1. If `STYLE.md` has no sizes yet and other volume assets exist, measure them in their exported sheets and write the sizes down; do not leave the next asset to guess. Every asset is built in those units, so a chest next to a character has the right size without guessing. Changing the size of one asset to "make it read" breaks the set; change the cell or the export scale instead.

## 2. Props

- Start from the silhouette: one or two big volumes that identify the object from every facing (a chest is a box plus an arched lid).
- Give the object one primary feature that stays visible in every facing, plus a secondary feature that tells front from back (a lock in front, hinges at the back).
- Interactive props (doors, chests, levers) usually animate: build the moving part in its own frame and drive it with `frameIndex` (see the motion reference in the `diorama-volume` skill).

## 3. Scenery kits

- Build scenery as a kit of modules on the project grid (floor, wall straight, wall corner, wall end, door frame), each in its own asset or as rows of one sheet.
- Every module shares the grid size, wall height and the same light, so modules tile without seams. Check the joins by placing the modules side by side in a scene (the viewer's Scenery tab, or `npm run scenery-test`).
- Walls use 4 directions; floors usually 1. Large background pieces with no facing use 1.

## 4. Equipment

- Write each piece (a hat, a backpack, a jacket, a lantern, a watering can, a sword) as a helper in `src/` that takes a frame and returns its volumes. A project with many pieces keeps them as a gear kit (`diorama-kits` skill, rig guide 05). Code in `src/` is never exported by itself: only the sheets in `sheets/` are.
- The same helper renders the piece on a character, on its own as a world prop, and as an inventory icon. Icons use the same camera turned to the facing that shows the piece best, so the icon and the equipped piece always match.
- Variants come from parameters (size, trim, trim material) and from the theme's ramps, not from copies of the helper.

## 5. Quick decision table

| Situation | Recommended | Avoid | Reason |
| :--- | :--- | :--- | :--- |
| Sizing a new prop | The reference size in `STYLE.md` | Eyeballing per asset | The set keeps one scale. |
| A wall that must tile | Modules on the project grid | One long unique wall | Kits tile and recombine. |
| An equipment piece used in three places | One helper in `src/` | Three copies | Icon, prop and equipped piece stay identical. |
| Front versus back of a prop | A secondary feature (hinges, handle) | A symmetric design | Players read orientation from it. |
