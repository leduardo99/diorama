# Guides

How to use each module of the engine, and when. A guide explains the choices the engine cannot make for you; the exact signatures are in the generated [API reference](../api/), and the layout of a project is in [ARCHITECTURE.md](../ARCHITECTURE.md). The skills in `.agents/skills/` read these guides for you: start from [`diorama`](../../.agents/skills/diorama/SKILL.md).

## `@core/draw`: the drawing layer

[`core/draw/README.md`](../../core/draw/README.md) stays with its module. Geometry, paths, styles and procedural textures; volumes, effects and the HUD draw with them. Reference: [geometry](../api/draw-geometry.md), [paths](../api/draw-paths.md), [styles](../api/draw-styles.md), [textures](../api/draw-textures.md).

## `@core/volume`: props, scenery, effects, items and the HUD

| Guide | Read it to |
| :--- | :--- |
| [01 Space, camera and facings](volume/01-space-camera-and-facings.md) | place volumes in the shared camera and light, choose the number of facings, set the pivot and read the sheet layout |
| [02 Volumes and the stage](volume/02-volumes-and-stage.md) | choose between solids, round volumes, tubes and decals, and know how the stage sorts them |
| [03 Props, scenery and armor](volume/03-props-scenery-and-armor.md) | plan a prop, a scenery piece or an armor piece against the project's world scale |
| [04 Scenery kits](volume/04-scenery-kits.md) | declare the game's space profile and build floors, walls and fences that connect, scenes as data and tile sets |
| [05 Living scenery](volume/05-living-scenery.md) | give pieces states and clips (doors, chests, levers, breakables, flames) and export the navigation |
| [06 Effects, items and the HUD](volume/06-effects-items-and-hud.md) | write effects cued on character events, items and inventory icons, and the HUD (nine-slice panels, bars, bitmap fonts, cursors) |

Reference: [volume](../api/volume.md), and [core](../api/core.md) for the HUD helpers.

## `@core/rig`: characters and creatures

| Guide | Read it to |
| :--- | :--- |
| [01 Skeletons and creatures](rig/01-skeletons-and-creatures.md) | choose or write a skeleton: humanoid, quadruped, spider, bird, serpent or your own |
| [02 Gaits and clips](rig/02-gaits-and-clips.md) | make a skeleton move: locomotion, idles, attacks, events and the motion check |
| [03 Skins and character assets](rig/03-skins-and-character-assets.md) | declare a character with `defineCharacter`, draw its skin, sockets, cells and pivot |
| [04 The atlas contract](rig/04-atlas-contract.md) | what a game or the viewer's Playground can rely on in the exported files, and the playing rules |
| [05 Gear and outfits](rig/05-gear-and-outfits.md) | build armor, weapons and garments as reusable parts and dress characters with them |

Reference: [rig](../api/rig.md).

## `@diorama/runtime`: playing the exports

[`packages/runtime/README.md`](../../packages/runtime/README.md) stays with its package. It reads exported sheets and plays them in a game, as rig guide 04 says: characters, the effects they cue, movement on a scene's navigation, the depth order and the geometry of interface pieces. Reference: [runtime](../api/runtime.md).

## Where a guide ends

The quality bar, the readability checks and the motion rules every style must clear are not guides: they are references of the [`diorama-volume` skill](../../.agents/skills/diorama-volume/SKILL.md) (`references/quality-bar.md`, `references/readability.md`, `references/motion.md`), because they are checked on every asset.
