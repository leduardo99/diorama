---
name: diorama-style
description: Choose and prove the look of a Diorama project — the space profile, the theme tokens (palette, ramps, strokes, outline, camera and light, materials), STYLE.md — and probe it with one prop and one character before producing in bulk. Use when a project starts, when the user describes the game or the look, when the palette, the lines, the light or the sizes change, or for ideation between looks. Any genre, any look.
---

# Choosing the look

A project's look is its theme (`src/theme.ts`), its space profile (`src/space.ts`) and its notes (`STYLE.md`). This skill takes a brief to those three, and proves them on a first prop and a first character before anything is made in bulk. It never picks the look for the user: the engine keeps a quality floor ([quality bar](../diorama-review/references/quality-bar.md)), and everything above the floor is the project's choice. Read `diorama` first.

## 1. Read the brief

Ask for what the user has not said, and do not fill gaps from a favourite look. The questions that decide the work:

- **The game and its view.** What is played, from where. The engine draws a tilted top-down 3/4 view on a rectangular grid; a side view, an isometric view or a hex grid is outside it today, and the user should hear that now.
- **The scale.** How tall a character is on screen (the unit everything else is measured against), how big a cell is, whether there are walls, doors and fences.
- **The look in words, and references.** Cute or realistic, flat or shaded, bright or muted, clean lines or textured, with the user's own references. If the user gives none, offer two or three clearly different looks (section 4) and let them choose.
- **What must read.** The one thing the eye has to find (an item, a status, an interactive object), which becomes the accent.

## 2. The space profile

`src/space.ts` is the game's space, declared once: the grid, the scale of everything against the characters, and where walls stand. A preset starts it from proportions, and any number in it can be overridden:

| Preset | What it sets |
| :--- | :--- |
| `jrpg` | a character about two cells tall and one wide; walls 1.25 × the character on cell borders |
| `action-rpg` | a character about 1.5 cells tall; walls about the character's height on cell borders |
| `tactics` | a cell as wide as a character is tall; walls 0.9 × through cell centres |
| `farm-sim` | a dense grid, a character about two cells tall; buildings 1.6 × on cell borders |
| `dungeon-crawler` | a character a little taller than a cell; walls 1.1 × through cell centres |

Pick by these proportions, not by the name. If none fits, start from the closest and override `scale` and `walls` in `defineSpace` ([volume guide 04 §1](../../../docs/guides/volume/04-scenery-kits.md#1-the-space-profile)). A project with only props and characters (no grid, no walls) needs no profile.

## 3. Create the project and build the theme

```bash
npm run new-project -- my-game --style --genre tactics --character 64
```

`--style` adds `STYLE.md`, `--genre` the space profile, `--character` the character height in world units (default 80). The theme starts as a neutral template: muted materials, one warm accent. Replace its values, keep its order, and edit `src/theme.ts` only (colors are literals nowhere else; `npm run check` enforces it):

1. **`PALETTES`**: named colors, each material with a `Lit`, a base and a `Dark` step that differ clearly in value.
2. **`RAMPS`**: the three tones per material.
3. **`STROKES`**: line weights and the renderer (`'ribbon'`, calligraphic, or `'clean'`, uniform).
4. **`CONTOUR` and `CAMERA`**: the outline around every object, and the `tilt`, `heightBoost` and `light` (`azimuth`, `elevation`, `ambient`) of the view. One camera and one light for the whole project.
5. **`VOLUMES`**: the materials of volume assets, each with a `ramp`, an inner-line `stroke`, a crease `edge` and optional form shading (`form`, `bands`, `texture`).
6. **`GLOWS` and `SHAPE_STYLES`**: glows, soft shadows and flat marks.

The theme can express the sets below and many more. They are examples of how far apart the parameters can sit, not suggestions; the user's brief decides.

| | Flat, graphic | Soft, textured | Muted, thin-lined |
| :--- | :--- | :--- | :--- |
| Palette | 5 to 6 saturated hues, a wide value step per ramp | warm mid-values, a pale lit step | desaturated, ramps close in value, one warm accent |
| `CONTOUR` | thick (about 2.2), a clean dark color | medium (about 1.25) | hairline (about 0.8) |
| Strokes | `'clean'` renderer; no inner lines (leave `stroke` out of `VOLUMES`) | `'ribbon'` renderer; inner lines in a dark shade of each material | `'clean'` renderer; inner lines at about 0.5 |
| Form shading | two bands (`bands: 2`, `form: { highlight: false }`) | the defaults: core shadow, base, highlight | the defaults with a narrow highlight |
| `CAMERA` light | high (elevation about 60), strong ambient (about 0.5) | `azimuth` 140, `elevation` 45, `ambient` 0.35 | lower (elevation about 35), `ambient` 0.25 |
| Textures | none | `Grit` or `Stipple` on stone and wood | none, or a faint `Hatch` |
| Accent | one flat bright shape | a glow (`GLOWS.accent`) | the single warmest ramp, small |

## 4. Write `STYLE.md`

Fill the template's sections (the file says what each holds); keep it short and true:

- **Summary of the theme**, in words: the palette, the camera and light, the materials and what each is for, the lines.
- **What the theme cannot express**: export scale, facings per kind of asset, layering, motion, where the accent is allowed and where it is not.
- **Reference sizes**: character height, door, wall, fence and cell, from `SPACE.scale` and `SPACE.grid.cell` in `src/space.ts`. The template's table is the `jrpg` preset at height 80 whatever `--genre` you passed: replace it with the project's own numbers, and keep it in step with `src/space.ts`.
- **Quality overrides**: where this style differs on purpose from the defaults of the [quality bar](../diorama-review/references/quality-bar.md), with the reason. `inspect` does not read it; it is what lets a warning be explained instead of fixed.

Two flows reach the same files. *Style first*: write `STYLE.md` from the brief, then build the theme from it. *Theme first*: the theme exists (an older project, a copied look), `STYLE.md` is optional and holds only a summary plus what the theme cannot express. Do not write `STYLE.md` only to have one; the reference sizes are the exception, because every asset shares one world scale.

## 5. Probe the look

Prove the look on two assets before making more. A look that fails on a prop and a character fails everywhere, and a theme change is cheap now and expensive later.

**A prop** (four facings):

```bash
npm run new-asset -- my-game props/crate --engine volume --directions 4
```

`new-asset` writes the drawing in `projects/my-game/src/props/crate.ts` and its sheet in `projects/my-game/sheets/props/crate.ts`, which only re-exports it. The template places the camera at the pivot and declares `frame`, the local frame turned by `facing`, and leaves the stage empty. Replace the comment before `stage.draw(ctx)` with one `stage.object()` holding the volume, a material from `VOLUMES` (import `Solid` from `@core/volume` next to `Frame3`, `Stage` and `vec3`, and `VOLUMES` from `../theme` next to `CAMERA`):

```
const crate = stage.object();
crate.add(Solid.box(frame, 40, 30, 26), VOLUMES.wood);
```

The accent material is for the one focal detail, not a whole body. Then the loop:

```bash
npm run check -- my-game
npm run --silent export -- my-game props/crate --json
npm run inspect -- projects/my-game/assets/props/crate.png
npm run contact -- projects/my-game/assets/props/crate.png
```

**A character** (the first clip creates it; later clips print the line to add to `clips`):

```bash
npm run new-asset -- my-game characters/hero/walk --engine rig --skeleton humanoid
npm run new-asset -- my-game characters/hero/idle --engine rig
```

Add the line the second command prints to `clips` in `src/characters/hero/character.ts`, give the character a `label` (the name people read), and export:

```bash
npm run check -- my-game
npm run --silent export -- my-game characters/hero/ --json
npm run inspect -- projects/my-game/assets/characters/hero/walk.png
npm run contact -- projects/my-game/assets/characters/hero/walk.png
```

The mannequin skin is a blockout: it shows the palette, the lines and the light on a body, not a finished character (`diorama-rig` covers the skin). Also probe the scale: with a space profile, `npm run new-kit -- my-game scenery` then `npm run scenery-test -- my-game crate` draws the crate beside a scale figure of the profile's character height.

Judge the probes with `diorama-review`: `contact --gray` for the value structure, every row for the light, the figure beside the crate for the scale. If the look is wrong, change the theme tokens (never a probe asset), export again and compare with `contact --with`. Show the user the probes before going on, and keep the ones that stay as the project's first assets.

## 6. Detail and richness

The theme sets the style; it does not make an asset rich. Five projects that differ only in tokens look like one model painted five ways. Richness comes from geometry, tiers of detail and variation, and it is decided per asset, after the probes. Build it in this order, and check each tier in a contact sheet before adding the next.

1. **Silhouette first.** Each character and big prop needs a shape of its own at 1×: proportions that differ from the others, and accessories that break the outline (a scarf tail, a bag, a hat brim, a cloak, a tool). Check it with `contact --gray`, and with the figure filled in your head: two characters that share a silhouette read as one.
2. **Macro, meso, micro.** The big forms carry the read, the middle tier (planks, stones, battens, straps, folds, seams, hems, buckles) carries the richness, and the micro tier (grain, cracks, stitches, pebbles) is the finish. Make the middle tier real geometry: many small solids rather than one box with lines drawn on it, each set slightly proud or sunk and given a small tone variation from `pieceRng`. That way every piece catches its own lit edge. Put the most detail where the eye should go, and keep the rest calmer.
3. **Marks on surfaces.** Lay cracks, grain, stitches and emblems on the face they belong to with `Decal.onFace` (any compound shape, for example a `Path` turned into a fill with `toShape`), rather than drawing projected lines by hand. Two or three decals per mark (a dark line and a lit lip) give relief. Bands go round the body with `visibleArc` and `bandOnEllipsoid`: belts, hems, sashes, barrel hoops, a cross-body strap as a tilted ring.
4. **Materials that read as materials.**
   - A ramp per material, with hue shifting: warmer toward the light, cooler in shadow.
   - Cloth without a highlight (`form: { highlight: false }`); metal with a narrow, strong one.
   - Reflected light at the edge with `form.rim`.
   - An inner `stroke` per material, a darker shade of it, for selective lines.
   - Textures (`Grit`, `Stipple`, `Hatch`) on stone, wood and earth, at a density that survives 1×.
5. **Grounding and light.** Every standing thing has a contact shadow (`groundShadow`, and `floorGlow` for light sources in scenery). Darken the foot of walls and big props. Keep one light direction for everything.
6. **Variation.**
   - Floors in 4 to 6 variants (`floorTile` helpers: `spread`, `fit`, `bevelEdge` with `recessed` for a sunk path, `floorBlob`, tufts along `t.edge`). Check repetition with `scenery-test --field`.
   - Walls and props in variants that tell a story (`variants` with `variantLabels`: plain, mossy, cracked, a window).
   - Decals bigger than a tile for large patches, and small clutter decals on top.
   - Foliage as clumps of round volumes, darker at the back and lighter on top, sorted back to front; leaf edges from `displace` on a `Path`.
7. **Motion detail.** Secondary parts (a scarf, a tail, hair, a ribbon) follow the body with a lag read from the clip itself (`kit.poseAt(t - lag)`), so loops stay closed. Avoid one-pixel details that change shape every frame: they boil.

Judge richness at the size the game shows. Detail that disappears at 1× is wasted, and detail that turns to noise at 1× hurts the read: test with `contact` at 1× and with `--gray`. When the project's references are rich (a dense pixel game, a painted one), compare a contact sheet with them side by side. If one tier is missing, add that tier; do not change the theme.

## 7. Ideation between looks

Only when the user asks to explore ("let's brainstorm", "show me variations"). Draft two or three looks as `src/drafts/<draft>.ts` with a sheet `sheets/drafts/<draft>.ts` (`npm run new-asset -- <project> drafts/<draft> --engine volume`), export them as mockups (`npm run export -- <project> drafts/<draft> --mockup`, written to `review/mockups/`, never to `assets/`), and put them side by side in contact sheets. Formalize `STYLE.md` and `src/theme.ts` only after the user chooses, then delete `src/drafts/` and `sheets/drafts/`. Without a request for it, go straight to the brief.

## 8. Changing the look later

Change tokens in `src/theme.ts` (and the notes in `STYLE.md`), never an asset. A theme edit makes every sheet stale, so export everything (`npm run export -- <project> --changed` exports them all) and compare a few assets before and after with `contact --with`. A change to the space profile or the character height also changes sizes: update the reference sizes, then check every kit piece against the figure.

## Rules

- The look comes from the user's brief and the project's files, not from another project and not from a default of this repository. The template's palette is a neutral start, not a recommendation.
- Colors, line weights and the camera live in `src/theme.ts` only. An asset that needs a new color gets a token.
- One camera, one light and one world scale per project.
- Do not ship a look the user has not seen on the probes.

## Checks that must pass

1. `npm run check -- <project>` is clean (types, layout, determinism).
2. The probes export, and `inspect` is clean or each warning is explained under "Quality overrides" in `STYLE.md`.
3. `contact --gray` shows the value structure, and every row of the prop shows the light on the same side.
4. The reference sizes in `STYLE.md` match `src/space.ts`.
5. The user has seen the probes.
6. Each asset has the tiers of detail it needs at 1× (section 6), checked in a contact sheet at 1× and with `--gray`.

## Reporting

Report the brief as you understood it, the preset and overrides chosen and why, the theme decisions in a few lines, the probes with their `inspect` results, and what the user still has to decide.
