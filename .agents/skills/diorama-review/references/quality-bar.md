# Quality bar for volume assets

The project owner chooses the style: palette, ramps, line widths, form shading, contour, camera. The bar does not pick a style. It has two parts:

- **The floor** is what every style must clear, because it decides whether an asset reads and fits. No style overrides it.
- **The defaults** are what the starting theme does and what `npm run inspect -- <png>` measures. A style may differ on purpose; when it does, the difference is written down, not hidden (see "Differing on purpose").

Numbers marked *Measured* are printed by `inspect`, with warnings that name the fix. Numbers marked *convention* come from practice.

## What the engine already does (do not fight it)

- **Form shading:** every round part (`Round`, `Tube`, `Blob`) gets three tones. They are a core shadow away from the light, the base tone, and a highlight along the lit edge. Each band is a crescent of the silhouette, so a finger and a torso both read. The theme tunes it per material with `VolumeStyle.form`, for example `highlight: false` for matte cloth or a stronger highlight for metal. Leave it at the defaults unless the style asks otherwise.
- **Line hierarchy:** the theme's `Camera` sets one `contour` that inks the whole silhouette of every stage object. The `stroke` of each material is the line *between* parts. The starting theme keeps the contour heavier than the inner lines.
- **Faceted solids:** they take their three tones from face normals and ink their creases.

## The floor

1. **It reads in every facing.**
   - The silhouette alone identifies the object, and the primary feature is visible in every row ([readability](readability.md)).
   - Adjacent parts differ in value, not only in hue (`contact --gray` shows it).
2. **It fits its cell.** Nothing touches the cell edges, no cell is empty, and the pivot is the same across rows and clips (*Measured*: the `cells` block of `inspect`).
3. **One camera, one light, one scale** across the project: the theme's `CAMERA`, the sizes of `STYLE.md` or `src/space.ts`. Compare side by side with a finished asset of the project.
4. **No mannequin shapes.**
   - No egg heads: give a head a face plane, features and something on top (hair, a hat, a hood).
   - No pin limbs: at the export size, limbs are at least about 3 exported px (1.5 logical px at scale 2) wide, measured as the full width (the `width` of a `Tube` is the full width in logical px, not a radius). Add knobs at the joints and masses at the haunches or shoulders.
   - No single convex blob for a body: use a `Blob` of masses so the waist and neck tuck in.
   - Hems, edges and outlines are shaped, not a clean ellipse, unless the style is geometric on purpose.
5. **The right sorting for each attachment.**
   - `on` is for things that are always over their host from every side: a buckle on a belt, a knob on a lid, a boss on a shield seen from the front.
   - Things on one side of a body (a visor, a chest bib, a front apron, a shield strapped outside the arm) are sorted by depth, or switched with `cam.faces(normal)`. With `on`, they would show through the body when it turns away.
   - Bands around a body (belts, bracelets, ribs, hoops) use `visibleArc`, so the back half never crosses the front.
6. **Cheap per frame.**
   - Skins and assets never call shape booleans (`union`, `subtract`, `intersect`) per part per frame. The engine paints form with canvas clipping for this reason.
   - *Convention:* stay under about 30 ms per cell. A character sheet has 64–96 cells and the export has a 15 s budget per asset.
7. **Deterministic:** the same source exports the same pixels (`createRng(seed)`, theme tokens; `npm run check` enforces it).

## The defaults

These suit most styles and are what the starting theme does. Each one is shown in three settings to make clear that it is a choice.

| Default | Soft, shaded | Flat, graphic | Muted, thin-lined |
| :--- | :--- | :--- | :--- |
| **Tones per material** (*Measured*: `value spread ≥ 0.3`, `tone levels ≥ 5`) | Three, with form-shaded crescents | Two bands with a hard edge (`form: { highlight: false }`) and a clear value gap | Three close in value, low saturation |
| **Inner lines** (*Measured*: `ink ≤ 30%` of the opaque pixels) | A dark shade of the material (`lerpColor(ramp.dark, ink, ~0.6)`), thinner than the contour | None: the thick, clean contour alone | Hairline, in the material's dark |
| **Focal accent** (*Measured*: `accent > 0` and `≤ 20%`) | One small saturated color with a pale core | One flat bright shape, no glow | None, or the warmest ramp of the set |
| **Detail tiers** (*convention*) | Primary 2, secondary 4, tertiary 4 for a hero asset | Primary and secondary only | Secondary carried by texture |

How to read them:

- **Tones.** Every material ramp has a clearly darker `dark` and a clearly lighter `lit`; adjacent materials differ in value. Hollows (openings, sockets, the inside of a pot) use a dark *color* (a `hollow` token), not ink.
- **Lines.** A part thinner than about three line widths gets a thinner line, or none.
- **Accent.** A small saturated color marks where the eye goes: a gem, a lamp, a flag, a status light. Use the ramp's saturated `base` with a pale core; a pale `lit` alone does not saturate.
- **Detail tiers.** Minimums for a character or a hero prop; a small prop needs fewer, but never zero secondary:
  - **Primary, at least 2:** what makes the silhouette, recognizable in every facing (a hat, a backpack, a tool, a mane, a crest);
  - **Secondary, at least 4:** material breakup that tells the story (a belt, straps, an apron, cuffs, a pale belly, a patch);
  - **Tertiary, at least 4:** small marks seen up close (rivets, stitches, plank seams, labels, scuffs, wraps).
- **A ragged silhouette where the material is ragged.** Fur, torn cloth and foliage break the outline with tufts, notches or strips. Sort clumps by depth when they should cover the body, and use `bias` far behind the body when only their tips should poke out.

## Differing on purpose

`inspect` measures the defaults, so a flat, monochrome or hairline style will trip warnings. A warning is a question, not a verdict:

- Fix the asset when the warning is right (a flat blob, a missing accent in a style that has one).
- Keep the asset when the style differs on purpose: write the difference and the reason under "Quality overrides" in `STYLE.md` (the template has the heading), and repeat it in the review report. `inspect` does not read that file; the explanation is what makes the warning acceptable.
- The floor is never overridden.

## Scenery

Scenery sits under the actors, so some numbers change (guide 04 §6):

- **Floors** read calmer than the characters on them: lower contrast, smaller details, no accent of their own. `inspect` judges floor tile sheets (`role: tile`) on a value spread from 0.12 to 0.45 and at least 4 tone levels.
  - A field of one floor must not show a repeating lattice or motif at 1× (`npm run scenery-test -- <p> <floor> --field`): 4–6 variants, soft large features sized to the room they have, small details on `t.spread`, and a distinctive motif (a flower, a ripple, a pair of pebbles) in one or two variants only.
  - Details stay under about 8 px; a floor's own glow (glints on water) has cores under a pixel, a few per tile.
- **Decals** are quiet marks; an accent is optional.
- **Scale against the characters** comes from the project's space profile (`src/space.ts`, guide 04 §1): walls, doors and fences take its sizes, props are sized against `SPACE.scale.character`, and `inspect` warns about off-scale sheets. Judge every kit piece next to a scale figure (`scenery-test`) before calling it done.
- **Walls, fences and props** follow every rule above. Their detail tiers are those of a small prop, and the accent stays rare, so a lamp or a signal flag reads as the focal point.

## Review loop

1. Export, then run `npm run inspect -- <png>`. Fix every warning or say why it does not apply.
2. Run `npm run contact -- <png>` and `--gray`. Look at every row at the export size, then zoom the weak rows and frames with `--rows ... --frames ... --zoom 3`.
3. Compare it side by side with one finished asset of the project (`npm run contact -- <png> --with <other.png>`; add `--zoom N` when the cells differ in size). It must look like it belongs to the same game and to the same level of finish.
4. Name the primary, secondary and tertiary details you added in the report, or the tiers the style keeps. If a tier the style keeps is short, the asset is not done.
