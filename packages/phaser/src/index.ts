/**
 * @diorama/phaser - Diorama's exported sheets in Phaser 4
 *
 * A scene plugin (`this.diorama`, in a game made with `withDiorama`) that loads sheets by the atlas contract, with what
 * they need (other clips, cued effects, `follows`), as textures whose frames keep the atlas names and their pivots; a
 * `DioramaCharacter` Sprite played by `@diorama/runtime`'s clip player, not by Phaser's animations; the effects its clips
 * cue; keyboard controls from its manifest; one depth order (`depthKey`); and nine-slices from the runtime's geometry.
 * What needs no Phaser (the closure of a set of sheets, how a picture is cut into textures) is `@diorama/phaser/sheets`.
 */

export { DioramaCharacter, type CharacterOptions } from './character.js';
export { manualClock, sleepOnStart } from './clock.js';
export { KeyboardControls } from './controls.js';
export { EVENTS } from './events.js';
export { addSheetTexture, libraryOf, loadSheets, maxTextureSizeOf, type LoadOptions } from './loader.js';
export { DioramaNineSlice } from './nine-slice.js';
export { DEPTH, DIORAMA_PLUGIN, DioramaPlugin, withDiorama } from './plugin.js';
export { Closure, atlasURL, cellsOf, closure, cutsOf, frameNameOf, imageURL, planTexture, type FramePlan, type TexturePlan } from './sheets.js';
