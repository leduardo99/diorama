/**
 * The soul potion: a round glass flask corked with a lighter wood, tied at the neck with a leather cord that ends in a
 * bone bead, and filled with soul to the shoulder. 13 units tall without its cork, 15 with it (a flask about twice the size of a real one, so its parts have room).
 *
 * The flask is two volumes: the glass (a lathe, pale cool blue-grey) and the liquid (a smaller lathe of the soul crystal's
 * ramp, drawn over the glass), so a rim of glass stays visible round the liquid and the flask reads as full. The liquid's
 * surface is a flat pale ellipse on its top; the bubbles and the glint on the glass are drawn over the volume. (No blur
 * shadow: the icon measures the item before fitting it, and a halo in px would shrink every fit.) The soul green is the one saturated thing in the icon.
 *
 * Detail tiers: primary = the flask's round belly and the cork; secondary = the liquid with its surface, the neck cord,
 * the lip ring; tertiary = bubbles, the glint, the bone bead, the carved ward on the glass.
 */

import { Polygon, alpha, lerpColor } from '@core/draw';
import type { ItemPiece } from '@core/rig';
import { Blob, Decal, Round, Tube, visibleArc, vec3 } from '@core/volume';
import { STROKES } from '../theme';
import { glint, role } from './util';

/** Height of the flask without its cork. */
const H = 13.2;

export const soulPotion: ItemPiece = ctx => {
  const { object: o, camera: cam, frame: g, materials } = ctx;
  const glass = role(materials, 'glass');
  const liquid = role(materials, 'crystal');
  const cork = role(materials, 'cork', 'wood');
  const leather = role(materials, 'leather');
  const bone = role(materials, 'bone');
  // Centre the flask on the origin: its middle at the item's centre.
  const b = g.moved(0, 0, -(H + 2) / 2);
  // A bulb, a neck and a lip, painted as one mass: a lathe is the hull of its rings and could not tuck in at the neck.
  const flask = new Blob([
    Round.ellipsoid(b.moved(0, 0, 4.5), 4.55, 4.55, 4.5),
    Round.cylinder(b.moved(0, 0, 7.6), 1.6, H - 7.6, 1.5),
    Round.cylinder(b.moved(0, 0, H - 1.2), 1.95, 1.2, 2.05),
  ]);
  o.add(flask, glass);
  // The liquid, a little smaller than the glass and flat on top at 6.1.
  const soul = Round.lathe(b, [[0.6, 0], [0.75, 1.5], [1.5, 2.75], [2.6, 3.5], [3.9, 3.9], [5.0, 3.85], [5.6, 3.65], [5.6, 0]]);
  o.add(soul, liquid, { on: flask });
  // Its surface: a pale ellipse with a lit rim, the meniscus.
  o.add(Decal.onFace(b, 'top', vec3(0, 0, 5.62), Polygon.ellipse(3.3, 3.3, { segments: 24 })), { fill: lerpColor(liquid.ramp.lit, liquid.ramp.base, 0.45), stroke: STROKES.detail.with({ color: alpha(liquid.ramp.dark, 0.8), width: 0.6 }) }, { on: soul });
  // The lip's ring and the cork.
  const stopper = Round.cylinder(b.moved(0, 0, H - 0.6), 1.45, 2.6, 1.8);
  o.add(stopper, cork, { on: flask });
  // The cord: the front half of a ring round the neck, a knot and two ends that hang with a bone bead.
  const cord = visibleArc(cam, b.at(0, 0, 10.4), b.dir(1, 0, 0), b.dir(0, 1, 0), 1.7, 1.7);
  if (cord.length > 1) o.add(new Tube(cord, 0.85), leather, { on: flask });
  const knot = b.at(1.8, 0.3, 10.4);
  o.add(Round.ellipsoid(b.moved(1.8, 0.3, 10.4), 0.7, 0.7, 0.7), leather, { on: flask });
  const tail = (side: number, drop: number) => new Tube([knot, b.at(2.4, 0.3 + side * 0.4, 9.8), b.at(2.7 + side * 0.2, 0.3 + side * 0.9, 9.8 - drop)], { start: 0.7, end: 0.5 });
  o.add(tail(1, 1.8), leather, { on: flask });
  o.add(tail(-1, 3.0), leather, { on: flask });
  o.add(Round.ellipsoid(b.moved(2.5, 0.3 - 0.9, 7.1), 0.55, 0.55, 0.7), bone, { on: flask });
  // Light and bubbles are drawn shapes, sorted over the liquid from every side.
  const at = (f: number, s: number, u: number) => cam.project(b.at(f, s, u));
  o.custom(b.at(0, 0, 4), c => {
    const hi = at(-2.4, -2.6, 5.0);
    glint(c, cam.scale, hi, { w: 0.5, h: 2.2, angle: 25, strength: 0.75 });
    glint(c, cam.scale, at(-2.6, -2.9, 2.4), { w: 0.4, h: 0.4, strength: 0.7 });
    for (const [f, s, u, r] of [[0.4, 0.8, 3.2, 0.62], [-0.6, -0.4, 4.4, 0.45], [0.9, -1.0, 2.3, 0.36]] as const) {
      const p = at(f, s, u);
      Polygon.circle(r * cam.scale * 0.9, { cx: p.x, cy: p.y, segments: 10 }).fill(c, alpha(liquid.ramp.lit, 0.85));
    }
  }, { on: soul });
};
