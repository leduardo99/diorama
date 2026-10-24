# Volumes and the Stage (`@core/volume`)

**Purpose.** Build objects from solids, round volumes, tubes and decals, and let the `Stage` draw them back to front. Every projected part is a `@core/draw` shape, so the project's ramps, strokes, textures and `inside` callbacks apply.

**API reference:** [`docs/api/volume.md`](../../api/volume.md). Signatures are not repeated here.

---

## 1. Choosing a volume

| Part looks like | Prefer | Why |
| :--- | :--- | :--- |
| Planks, crates, walls, steps, roofs, blades seen edge-on | `Solid.box`, `Solid.extrude` | Flat faces take a ramp tone each, which reads as hard material. |
| An arched lid, a gable, a headstone, a shield, a cross-section along another axis | `Solid.extrude` in `frame.profile('front' \| 'side')` | The profile stands upright (x along a horizontal axis, y up) and is extruded along the other horizontal axis. |
| Bodies, heads, pots, rocks, barrels | `Round.ellipsoid`, `Round.loft`, `Round.lathe` | A smooth silhouette with form shading (core shadow, base, highlight). |
| A creature's body, a skull with a jaw, any mass that tucks in (waist, neck) | `Blob` of `Round`s and `Tube`s | A loft is the convex hull of its rings and cannot tuck in; a blob is the union of convex masses with one outline. |
| Columns, candles, bottles, legs of furniture | `Round.cylinder`, `Round.lathe` | The top cap is drawn as a lit face when the camera sees it. |
| Limbs, ropes, horns, handles, roots | `Tube` | A tapered ribbon through 3D points. |
| Emblems, keyholes, seams, windows, runes on a surface | `Decal` | A `@core/draw` shape laid on the surface, hidden when the surface faces away. |
| Belts, bracelets, ribs, collars, barrel hoops | `Tube` through `visibleArc(cam, center, a, b, rx, ry)` | Only the half of the ring that faces the camera, so the back half never crosses the front. |
| The same band around an ellipsoid (rib hoops on an abdomen, a collar on a round body) | `Tube` through `bandOnEllipsoid(cam, frame, forward, side, up, at, { axis })` | The ring follows the curved surface (`ringOnEllipsoid` gives the ring itself). |

A curved surface built from many faces is fine: inner edges are only inked at creases (faces turned more than ~30°), so smooth surfaces stay clean. Use 12 to 24 segments for an arc; more adds slivers without making it rounder at export size.

Extruding a headstone along the object's forward axis, its profile drawn with x to the right and y up, starting at the back face:

```ts
import { Frame3, Solid, vec3 } from '@core/volume';
import { Polygon } from '@core/draw';
const slab = Solid.extrude(Frame3.facing(vec3(0, 0, 0), 0).moved(-2, 0, 4).profile('front'), Polygon.rect(16, 24, { cy: 12 }), 4);
```

## 2. Build order

1. Block out the big volumes in a local frame and check the silhouette from every facing before adding detail.
2. Attach secondary parts (bands, rims, handles, candles). Give each one `{ on: part }` when it rests on or is fixed to another part.
3. Add decals and textures last, at a low density tuned at export size.

## 3. How the Stage sorts

The stage sorts in two levels, like sprites in an isometric game:

- **Objects** are sorted by where they stand on the ground. One object is one physical thing: start it with `stage.object()` and add all of its parts to it. A candle standing in front of a tall headstone is a separate object, so it is drawn in front even though the headstone's face is higher.
- **Parts inside an object** are sorted among themselves: solids face by face (a band around a lid is right from every side), round volumes, tubes, decals and `custom` drawings as one piece at their centre.
- `stage.add(item)` without an object makes a one-part object. Parts of one thing added this way are sorted as separate objects and can overlap wrongly: group them with `stage.object()`.
- `on` puts an item in the object of the part it rests on and draws it after every piece of that part, from every facing (a candle on a lid, a lock on a door). The host must be an item you added to that object before: a `Blob` is one item, so rest things on the `Blob`, not on a `Round` inside it (the stage throws otherwise). Chains are transitive: items `on` a decal are drawn over that decal. Siblings `on` the same host sort among themselves by depth; a decal sorts at its origin.
- `layer` separates objects that never interleave: ground marks (0), objects (1), overlays (2).
- `bias` shifts one part's depth inside its object. Use it to break ties between coplanar pieces, or with a large negative value for clumps that should only poke out behind a body (fur tufts); for attachments use `on`.
- **`on` versus depth.** `on` means "over its host from every side": a buckle on a belt, a candle on a lid. A part that sits on *one side* of a body (a nasal bar, a chest bib, a front tabard, a shield on the outside of an arm) must hide when the body turns away. Leave it to depth sorting, or add it with `on` only while its surface faces the camera (`cam.faces(normal)`).

## 4. Styling

- Keep materials in the theme as `VolumeStyle` tokens (`VOLUMES.wood`): a ramp, the outline stroke, and an `edge` stroke for creases.
- **Form shading** of round parts uses all three tones of the ramp. The core shadow, on the side away from the light, and the highlight, along the lit edge, are crescents whose width follows the part's thickness within a min/max. Small parts still read, and big ones get a broad shadow. Tune it per material with `form` (`FORM_DEFAULTS` are the engine's): `highlight: false` for matte cloth, a wider highlight for polished metal, a `rim` color for reflected light.
- **Line hierarchy.** The project's `Camera` takes `contour: { width, color }`: one ink line around the silhouette of every stage object, under its parts. Each material's `stroke` is then the line *between* parts. Make it a darker shade of the material (selective outline), thinner than the contour, so inner details separate without black wires. Round parts draw their own line under their fill, so the visible width is the stroke width and the shading bands stay visible. `stage.object({ contour })` overrides the contour per object.
- Decals take plain `@core/draw` `ShapeStyle` tokens (`SHAPE_STYLES.*`) or small style objects built from theme tokens, the same as the rest of the art. A decal is flat: on a curved surface keep it small or it floats off the body. A decal is laid out as a viewer looking at that face reads it: x to the viewer's right, y down, so runes and text are never mirrored. Remember the face's own tone (see guide 01): a carving filled with the ramp's `dark` disappears on a face that is already dark.
- Drawn effects that belong to the object (a flame, a glow, a smear) go through `stage.custom(at, draw, { on })`, so they sort with the object.

## 5. Quick decision table

| Situation | Recommended | Avoid | Reason |
| :--- | :--- | :--- | :--- |
| Parts of one physical thing | One `stage.object()` | Separate `stage.add` calls | They sort among themselves, face by face. |
| A small thing standing next to a tall one | Separate objects | Putting both in one object | Objects sort by where they stand. |
| A part sitting on another | `{ on: part }` | A large `bias` | Correct from every facing. |
| Lock, emblem, seam on a face | `Decal.onFace` | A separate thin solid | Flat on the surface, culled when it faces away. |
| Soft contact with the floor | `stage.custom(vec3(0, 0, 0), c => groundShadow(cam, vec3(0, 0, 0), rx, ry).fill(c, GLOWS.ground), { layer: 0 })` | A drop shadow on the volume | Shadows lie on the ground plane. `groundShadow` returns a `Shape`, not a stage item: fill it inside `custom` in layer 0. `.fill` takes a paint, a translucent theme color (`GLOWS.ground` in a new project's theme, or `alpha(PALETTES.ink, 0.35)`); the theme's `SHAPE_STYLES.groundShadow` is a style, so it goes to `.draw(c, SHAPE_STYLES.groundShadow)` instead, which paints the same pixels. |
| Inner lines on a curved surface | Default creases | An `edge` stroke on every face | Only creases are inked. |
