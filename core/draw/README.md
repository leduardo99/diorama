# `@core/draw`

The drawing layer of Diorama. `@core/volume` projects every solid, round volume, tube and decal into these shapes, so a project's ramps, strokes, textures and `inside` callbacks style them; effects and the HUD (`core/ui.ts`) draw with them directly.

- **Geometry:** `Polygon`, `Path` and `Shape` (booleans, offsets, rounded corners, deformations, anchors), plus `scatterAlong` and `attach` for placement.
- **Styles:** `ShapeStyle` (fill, cel shading, shadow, textures, `inside`, stroke) and `StrokeStyle` with two renderers: `'ribbon'` (calligraphic, the default) and `'clean'` (uniform, used for volume edges and outlines).
- **Textures and color:** `Stipple`, `Hatch`, `Grit`; `alpha`, `lerpColor`, `parseColor`.

Import only from `@core/draw`; files under `internal/` are private. Signatures are in the generated reference, [`docs/api/`](../../docs/api/) (`draw-*.md`); run `npm run docs:api` after changing exported symbols.
