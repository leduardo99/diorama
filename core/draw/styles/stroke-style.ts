/**
 * @core/draw - StrokeStyle Class
 *
 * Encapsulates stroke visual attributes and provides immutable derivation (.with).
 * Delegates rendering to the stroke renderer named in `renderer` ('ribbon' by default, or 'clean').
 */

import type { Point, StrokeOptions } from '../types.js';
import { renderStroke } from '../internal/renderers/index.js';

/** A stroke: width, color, renderer and options. Immutable; derive variants with `.with`. */
export class StrokeStyle<P extends object = {}> {
  public readonly attrs: Readonly<StrokeOptions & P>;

  constructor(attrs: (StrokeOptions & P) = {} as (StrokeOptions & P)) {
    this.attrs = Object.freeze({ ...attrs });
  }

  get width(): number | undefined {
    return this.attrs.width;
  }

  get color(): string | undefined {
    return this.attrs.color;
  }

  get renderer(): string | undefined {
    return this.attrs.renderer;
  }

  /**
   * Derives a new StrokeStyle with specific attribute overrides.
   * Keys that are not StrokeOptions keys are kept and merged too.
   */
  with<P2 extends object = P>(overrides: Partial<StrokeOptions & P & P2>): StrokeStyle<P & P2> {
    const merged = {
      ...this.attrs,
      ...overrides,
    } as unknown as (StrokeOptions & P & P2);
    return new StrokeStyle<P & P2>(merged);
  }

  /**
   * Renders a polyline or closed loop onto the canvas context using this style,
   * with the renderer named in attrs.renderer ('ribbon' when unset).
   */
  render(ctx: CanvasRenderingContext2D, points: Point[], closed = false): void {
    if (!points || points.length < 2) return;
    const isClosed = this.attrs.closed ?? closed;
    renderStroke(this.attrs.renderer ?? 'ribbon', ctx, points, isClosed, this.attrs);
  }
}
