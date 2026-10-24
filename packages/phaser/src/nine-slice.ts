/**
 * A nine-slice interface piece (`role: 'ui'` with `nineSlice` insets) drawn at any size from the runtime's `nineSlice()`
 * parts: nine Images in a Container, each a frame of the sheet's texture cut to its part. Phaser's own NineSlice draws
 * nothing with the canvas renderer; these draw the same pixels with both renderers.
 */

import Phaser from 'phaser';
import { clipFrames, clipNames, nineSlice, type UiSheet } from '@diorama/runtime';
import { frameNameOf } from './sheets.js';

export class DioramaNineSlice extends Phaser.GameObjects.Container {
  /** The piece: its sheet, insets, scale and states. */
  readonly ui: UiSheet;
  /** The size it is drawn at, in the sheet's px (a size under the insets is raised to them). */
  sliceWidth: number;
  sliceHeight: number;
  /** The state it shows: one of `ui.states`, a row of the sheet. */
  shown: string;

  constructor(scene: Phaser.Scene, x: number, y: number, ui: UiSheet, width: number, height: number, state?: string) {
    super(scene, x, y);
    if (!ui.nineSlice) throw new Error(`@diorama/phaser: ${ui.asset.path} is not a nine-slice (its meta.data has no nineSlice insets)`);
    this.ui = ui;
    this.sliceWidth = width;
    this.sliceHeight = height;
    this.shown = state ?? ui.states[0] ?? 'normal';
    this.layout();
  }

  /** Draws it at another size (the sheet's px). */
  resize(width: number, height: number): this {
    this.sliceWidth = width;
    this.sliceHeight = height;
    return this.layout();
  }

  /** Shows another state of the piece (`hover`, `pressed`...). */
  showState(state: string): this {
    this.shown = state;
    return this.layout();
  }

  /** The nine parts again: each source rectangle a frame of the texture (added once), each drawn at its place and size. */
  private layout(): this {
    this.removeAll(true);
    const { atlas, asset } = this.ui;
    const row = Math.max(0, this.ui.states.indexOf(this.shown));
    const rect = clipFrames(atlas, clipNames(atlas)[0], row)[0];
    const name = frameNameOf(atlas, rect);
    const texture = this.scene.sys.textures.get(asset.path);
    const base = texture.get(name);
    for (const part of nineSlice(rect, this.ui.nineSlice!, this.ui.scale, this.sliceWidth, this.sliceHeight)) {
      const key = `${name}#${part.sx},${part.sy},${part.sw},${part.sh}`;
      // On the band (texture source) its frame is on, at the same offset from the frame.
      if (!texture.has(key)) texture.add(key, base.sourceIndex, base.cutX + part.sx - rect.x, base.cutY + part.sy - rect.y, part.sw, part.sh);
      this.add(new Phaser.GameObjects.Image(this.scene, part.dx, part.dy, asset.path, key).setOrigin(0, 0).setDisplaySize(part.dw, part.dh));
    }
    return this;
  }
}
