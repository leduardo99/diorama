/**
 * Plate: armour of fitted steel plates with gilded edges, made for the living body of `flesh.ts` —
 * a winged helm over the hair, a cuirass over the torso, plate pauldrons, tassets over a skirt and
 * plate greaves.
 *
 * Every plate follows the skeleton's scale (`scaleOf`) like the flesh it covers, and the trunk
 * through `ctx.body`, so a hit recoils it and a death lays it flat; the helm is built on the shared
 * `headFrame`, so it turns with the face.
 *
 * Materials by role:
 * - `metal`: the plates;
 * - `trim` (optional): the gilded edges, bands and bosses (falls back to `metal`, so an outfit with
 *   no gilt gets plain steel).
 */

import { Polygon } from '@core/draw';
import { partFrame, type Part } from '@core/rig';
import { Frame3, Round, Solid, Tube, add3, cross3, dot3, norm3, scale3, sub3, visibleArc, type Vec3 } from '@core/volume';
import { headFrame } from './heads';
import { role, scaleOf } from './util';

/** The gilded edge of a plate: the `trim` role, or the plate's own metal when the outfit has none. */
const gilt = (materials: Parameters<typeof role>[0]) => role(materials, 'trim', 'metal');

// ----------------------------------------------------------------------------------------------
// The winged helm
// ----------------------------------------------------------------------------------------------

/** Options of `wingedHelm`. */
export interface WingedHelmOptions {
  /** Scale of the dome, its rim and the wings. Default 1. */
  size?: number;
  /** The wings at the temples. Default true. */
  wings?: boolean;
  /** Scale of the wings alone. Default 1. */
  wingSize?: number;
  /** A raised ridge over the crown, front to back. Default true. */
  ridge?: boolean;
}

/** The dome as [height along its axis, half-length forward, half-width], from the rim up. */
const DOME: [number, number, number][] = [[0, 5, 4.8], [1.2, 4.9, 4.7], [2.6, 4.3, 4.15], [3.8, 3, 2.9], [4.5, 1.45, 1.4], [4.75, 0.05, 0.05]];
/**
 * A wing's feathers, leading first: [elevation from the sweep towards the crown, how far the feather
 * turns out from straight back (radians, 0 back, π/2 out to the side), length, width].
 */
const WING_FEATHERS: [number, number, number, number][] = [[1.25, 0.75, 8.6, 2.1], [0.85, 1, 7.8, 2], [0.45, 1.2, 6.8, 1.9], [0.08, 1.35, 5.6, 1.7]];
/** How far the dome's axis leans back (radians): the rim rides above the brows and dips over the nape. */
const DOME_TILT = 0.32;

/**
 * A winged helm: a rounded steel dome whose rim rides high over the brow and low over the nape, so
 * the whole face reads under it and the hair falls out from under it at the sides and the back; a
 * gilded band round the rim, a raised ridge over the crown, and a wing at each temple — four steel
 * feathers fanned back and up, the leading one edged in gilt, from a gilded boss.
 * Rests on the hair (`on: '<hair id>'`) or the head: it is drawn over the hair it covers. The far
 * wing sorts by depth, so it hides behind the dome.
 * Slot: `head`. Roles: `metal`, `trim` (optional: the band, the bosses and the leading feathers' edge).
 */
export const wingedHelm: Part<WingedHelmOptions> = (ctx, { size = 1, wings = true, wingSize = 1, ridge = true }) => {
  const { object: o, kit, materials, host } = ctx;
  const { head } = headFrame(ctx);
  const cam = kit.camera;
  const k = scaleOf(ctx) * size;
  const metal = role(materials, 'metal');
  const trim = gilt(materials);
  // A small lift over everything else on the head: the helm is the outermost piece there, so a
  // fringe that sweeps up under its rim never paints over the band.
  const lift = { bias: 3.5 * k, ...(host ? { on: host } : {}) };
  const axisUp = norm3(add3(scale3(head.up, Math.cos(DOME_TILT)), scale3(head.forward, -Math.sin(DOME_TILT))));
  const axisFwd = norm3(add3(scale3(head.forward, Math.cos(DOME_TILT)), scale3(head.up, Math.sin(DOME_TILT))));
  const frame = partFrame(head.at(-0.9 * k, 0, 2.9 * k), axisFwd, axisUp);
  const dome = Round.loft(DOME.map(([h, rx, ry]) => ({ center: frame.at(0, 0, h * k), rx: rx * k, ry: ry * k, axes: [frame.forward, frame.right] as [Vec3, Vec3] })));
  o.add(dome, metal, lift);
  // The band round the rim: the half that faces the camera.
  const band = visibleArc(cam, frame.at(0, 0, 0.35 * k), frame.forward, frame.right, 5.05 * k, 4.85 * k);
  if (band.length > 1) o.add(new Tube(band, 0.72 * k), trim, { on: dome });
  if (ridge) {
    // Over the crown from the brow to the nape, only where the dome turns to the camera.
    const run: Vec3[] = [];
    const flush = () => {
      if (run.length > 1) o.add(new Tube(run.slice(), { start: 0.75 * k, end: 0.75 * k }), metal, { on: dome });
      run.length = 0;
    };
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      const fx = Math.cos(a);
      const h = 0.6 + 4.15 * Math.sin(a);
      const p = frame.at(fx * 4.9 * k * Math.sqrt(Math.max(0, 1 - (h / 4.85) ** 2)) + fx * 0.25 * k, 0, h * k + 0.2 * k);
      if (cam.faces(norm3(sub3(p, frame.at(0, 0, 0.6 * k))))) run.push(p);
      else flush();
    }
    flush();
  }
  if (wings) {
    const w = k * wingSize;
    for (const s of [-1, 1]) {
      // Each wing is a fan that curves like a bird's: the low feathers spread out sideways, the high
      // ones sweep back, all flaring away from the crown, so the fan opens from the front and from
      // the side alike instead of showing its edge.
      const rise = norm3(add3(scale3(head.up, Math.cos(0.3)), scale3(head.right, s * Math.sin(0.3))));
      const root = frame.at(0.3 * k, s * 4.4 * k, 2.4 * k);
      WING_FEATHERS.forEach(([theta, yaw, length, width], i) => {
        const back = norm3(add3(scale3(head.forward, -Math.cos(yaw)), scale3(head.right, s * Math.sin(yaw))));
        const dir = norm3(add3(scale3(back, Math.cos(theta)), scale3(rise, Math.sin(theta))));
        // The leading edge is the side towards the crown and the front.
        const hint = add3(head.up, scale3(head.forward, 0.6));
        const lead = norm3(sub3(hint, scale3(dir, dot3(hint, dir))));
        const L = length * w;
        const W = width * w;
        const thick = 0.55 * w;
        const normal = cross3(dir, lead);
        const feather = Solid.extrude(new Frame3(add3(root, scale3(normal, -thick / 2)), dir, lead, normal), Polygon.fromPoints([
          { x: 0, y: 0.42 * W }, { x: 0.5 * L, y: 0.5 * W }, { x: 0.86 * L, y: 0.34 * W }, { x: L, y: 0.12 * W },
          { x: 0.72 * L, y: -0.34 * W }, { x: 0.32 * L, y: -0.5 * W }, { x: 0, y: -0.42 * W },
        ]), thick);
        o.add(feather, metal, { bias: 2 * k });
        if (i === 0) {
          const edge = [0.08, 0.5, 0.86, 0.98].map(u => add3(root, add3(scale3(dir, u * L), scale3(lead, (u < 0.6 ? 0.47 : u < 0.9 ? 0.36 : 0.16) * W))));
          o.add(new Tube(edge, { start: 0.28 * w, end: 0.12 * w }), trim, { on: feather });
        }
      });
      // The gilded boss the feathers spring from: over the dome on the side that faces the camera.
      const outward = norm3(add3(scale3(head.right, s), scale3(head.forward, 0.2)));
      const boss = Round.ellipsoid(partFrame(root, outward, head.up), 0.8 * w, 1.15 * w, 1.15 * w);
      o.add(boss, trim, cam.faces(outward) ? { on: dome } : { bias: 2 * k });
    }
  }
  return dome;
};
