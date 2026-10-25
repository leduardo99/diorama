/**
 * Clothes: the soft garments a living body wears — a hood, a cloak, boots, gloves, an apron and a
 * shawl — as opposed to the armor of `garments.ts`.
 *
 * All of it follows the trunk through `ctx.body` (and the head through the shared `headFrame`), so
 * a hit recoils it and a death lays it down; only the cloak's fall looks at world up to drape on
 * the floor once the body lies.
 */

import { createRng } from '@core';
import { partFrame, type Part } from '@core/rig';
import { Blob, Round, Tube, UP, add3, dot3, lerp3, norm3, scale3, sub3, vec3, visibleArc, type Vec3 } from '@core/volume';
import { headFrame } from './heads';
import { trunkScale } from './torso';
import { legOf, plate, role, tornPanel, type NoOptions } from './util';

/** Options of `hood`. */
export interface HoodOptions {
  /** Scale of the hood's cap and rim. Default 1. */
  size?: number;
  /** The point at the back of the crown. Default true. */
  point?: boolean;
}

/**
 * A cloth hood drawn up over the head: a cap over the crown and the back, its front edge a rim
 * that leaves the face open, a cowl widening down the neck onto the shoulders, and a soft point
 * behind the crown. Rests on the head (`on: '<head id>'`), so the face beneath it draws first.
 * Slot: `head`. Roles: `cloth`, `clothAccent` (optional: the rim's edge).
 */
export const hood: Part<HoodOptions> = (ctx, { size = 1, point = true }) => {
  const { object: o, kit, materials, host } = ctx;
  const { head, lie } = headFrame(ctx);
  const cam = kit.camera;
  const cloth = role(materials, 'cloth');
  const on = host ? { on: host } : {};
  const cap = Round.ellipsoid(head.moved(-1.9, 0, 2.1), 5 * size, 4.9 * size, 5.2 * size);
  o.add(cap, cloth, on);
  // The rim of the opening: the arc of the face-plane ellipse that faces the camera.
  const rim = visibleArc(cam, head.at(3 * size, 0, 0.9), head.right, head.up, 5 * size, 5.1 * size);
  if (rim.length) o.add(new Tube(rim, 1.1), materials.clothAccent ?? cloth, on);
  // The cowl: cloth bunched round the neck onto the shoulders.
  const s = trunkScale(ctx);
  const cowl = Round.loft(
    [[-3.2, 5.3, 4.7], [-6.5, 6.4, 5.3], [-10, 7.4, 5.7]].map(([h, rx, ry]) => ({
      center: head.at(-0.2, 0, h * s),
      rx,
      ry,
      axes: [head.right, head.forward] as [Vec3, Vec3],
    })),
  );
  o.add(cowl, cloth, on);
  if (point) o.add(new Tube([head.at(-2, 0, 5.4 * size), head.at(-4.4, 0, 7.6 * size), head.at(-6.4, 0, 7.2 * size - 3.5 * lie)], { start: 2.4 * size, end: 0.5 }), cloth, on);
  return cap;
};

/** Options of `cloak`. */
export interface CloakOptions {
  /** Length of the fall from the shoulders, in units. Default: down to the ankles of the standing body. */
  length?: number;
  /** Seed of the hem tongues. Default 'cloak'. */
  seed?: string;
}

/**
 * A cloak: a yoke over the shoulders, a long fall down the back that sways with the legs and
 * drapes flat along the floor once the body lies, and a small front collar the fall hangs from.
 * Slot: `back`. Roles: `cloth`, `clothAccent` (optional: the fall's edge). Returns the fall.
 */
export const cloak: Part<CloakOptions> = (ctx, { length, seed = 'cloak' }) => {
  const { object: o, pose, kit, body, at, materials } = ctx;
  const { up, right: across, forward: chestFwd, hipRight, hipForward, lie } = body;
  const cam = kit.camera;
  const cloth = role(materials, 'cloth');
  const s = trunkScale(ctx);
  const chest = at.frame.origin;
  // The yoke wraps the shoulders at collar height.
  const collar = Round.loft(
    [[2.5, 7.2, 4.8], [4.6, 6.9, 4.5], [6.4, 5, 3.4]].map(([h, rx, ry]) => ({
      center: add3(chest, scale3(up, h * s)),
      rx,
      ry,
      axes: [across, chestFwd] as [Vec3, Vec3],
    })),
  );
  o.add(collar, cloth);
  // The fall hangs from the back of the shoulders, sways a little with the legs' average stride
  // and drapes away from the head once the body lies (the long coat's math).
  const j = pose.joints;
  const [first, second] = kit.skeleton.legs;
  const knees = lerp3(j[`${first.name}.knee`], j[`${second.name}.knee`], 0.5);
  const sway = sub3(knees, j.chest);
  const swing = scale3(sub3(sway, scale3(UP, dot3(sway, UP))), 0.12 * (1 - lie));
  const L = (length ?? j.pelvis.z + 9) * (1 - 0.36 * lie);
  const top = add3(chest, add3(scale3(up, 5.2 * s), scale3(chestFwd, -3.2)));
  const hang = norm3(add3(scale3(up, -1), scale3(chestFwd, -0.16)));
  let dir = norm3(add3(hang, swing));
  if (lie > 0) {
    const back = vec3(-up.x, -up.y, 0);
    const flat = norm3(Math.hypot(back.x, back.y) > 1e-3 ? back : scale3(pose.frame.forward, -1));
    const drop = Math.max(0, Math.min(0.95, (top.z - 0.6) / L));
    dir = norm3(lerp3(hang, add3(scale3(flat, Math.sqrt(1 - drop * drop)), vec3(0, 0, -drop)), lie));
  }
  const centre = (u: number, lat = 0) => {
    const c = add3(top, add3(scale3(dir, L * u), scale3(hipRight, lat)));
    const floor = 1.6 + 2.4 * u;
    return c.z < floor ? vec3(c.x, c.y, floor) : c;
  };
  const rng = createRng(seed);
  const ends = [0, 0.35, 0.7, 1];
  const widths: [number, number] = [7.4, 11.8];
  const deeps: [number, number] = [2.6, 3.4];
  const mix = (pair: [number, number], u: number) => pair[0] + (pair[1] - pair[0]) * u;
  const fall = Round.loft(ends.map(u => ({ center: centre(u), rx: mix(widths, u), ry: mix(deeps, u), axes: [hipRight, hipForward] as [Vec3, Vec3] })));
  o.add(fall, cloth, { on: collar });
  // Torn hem tongues across the fall's end.
  const tongues = 5;
  for (let k = 0; k < tongues; k++) {
    const frac = ((k + 0.5) / tongues) * 2 - 1;
    const base = centre(0.8, frac * mix(widths, 0.8) * 0.9);
    const tip = centre(1.04 + rng.float(0, 0.08), frac * mix(widths, 1) * 0.96 + rng.float(-0.5, 0.5));
    const mid = lerp3(base, tip, 0.5);
    o.add(new Tube([base, mid, tip], { start: ((mix(widths, 0.8) * 1.8) / tongues) * rng.float(1, 1.4), end: 0.35 }), cloth, { on: fall });
  }
  // The fall's edge in the accent cloth, when the outfit gives one.
  const trim = materials.clothAccent;
  if (trim) {
    for (const side of [-1, 1]) {
      const run = ends.map(u => centre(u, side * mix(widths, u) * 0.97));
      const arc = run.filter(p => cam.faces(norm3(sub3(p, j.chest))));
      if (arc.length > 1) o.add(new Tube(arc, 0.8), trim, { on: fall });
    }
  }
  return fall;
};

/**
 * A leather boot over one foot: a shell round the foot and a short shaft up the shin, the foot
 * wear a greave does not give. Slot: `foot` (side -1 left, 1 right). Roles: `leather`.
 */
export const boot: Part<NoOptions> = ctx => {
  const { object: o, pose, at, materials } = ctx;
  const leather = role(materials, 'leather');
  const leg = legOf(ctx, at.side).name;
  const [, , ankle] = pose.chains[leg];
  const f = pose.frame;
  const foot = pose.joints[`${leg}.foot`];
  const boot = new Blob([
    Round.ellipsoid(partFrame(add3(foot, f.dir(2, 0, 0.9)), f.forward), 4.3, 2.4, 2),
    new Tube([add3(ankle, f.dir(0, 0, 6.5)), ankle], { start: 2.9, end: 2.4 }),
  ]);
  o.add(boot, leather);
  return boot;
};

/** Options of `glove`. */
export interface GloveOptions {
  /** Width of the cuff at the wrist. Default 1. */
  cuff?: number;
}

/**
 * A leather glove over one hand: a thicker palm than the bare flesh hand, fingers curled the same
 * way, and a cuff round the wrist. The cuff covers the wrist the `flesh-arm` ends at.
 * Slot: `hand` (side -1 left, 1 right). Roles: `leather`.
 */
export const glove: Part<GloveOptions> = (ctx, { cuff = 1 }) => {
  const { object: o, at, materials } = ctx;
  const leather = role(materials, 'leather');
  const f = at.frame;
  const band = new Tube([f.at(0.2, -2.9, 0.6), f.at(0.4, 0, 1.9), f.at(0.2, 2.9, 0.6), f.at(-0.2, 2.6, -1.3), f.at(-0.2, -2.6, -1.3), f.at(0.2, -2.9, 0.6)], 1.15 * cuff);
  o.add(band, leather);
  const palm = Round.ellipsoid(f.moved(2.3, 0, 0.15), 3, 2.7, 1.4);
  o.add(palm, leather, { on: band });
  for (let i = 0; i < 4; i++) {
    const y = (i - 1.5) * 1.4;
    const len = 4.5 - 0.45 * Math.abs(i - 1.5) * 1.2 + (i === 1 || i === 2 ? 0.4 : 0);
    o.add(new Tube([f.at(3.8, y * 0.9, 0.4), f.at(3.8 + len * 0.55, y * 1.15, 0.9), f.at(3.8 + len, y * 1.3, 1.9)], { start: 1.25, end: 0.65 }), leather, { on: palm });
  }
  const inner = -at.side;
  o.add(new Tube([f.at(1.5, inner * 2, 0.2), f.at(3.1, inner * 3.4, 0.7), f.at(4.7, inner * 3.9, 1.5)], { start: 1.5, end: 0.7 }), leather, { on: palm });
  return palm;
};

/** Options of `apron`. */
export interface ApronOptions {
  /** Length of the skirt panel from the waist. Default 24. */
  length?: number;
  /** Width of the bib and the skirt. Default 6.8. */
  width?: number;
}

/**
 * A work apron: a bib over the chest front held by a strap round the neck, a skirt panel hanging
 * to the shins, and a tie round the waist. Standing it follows the trunk; once the body lies the
 * panels drape from the waist along the floor, the way the tabard does.
 * Slot: `pelvis`. Roles: `cloth` (bib and skirt), `leather` (straps). Returns the skirt.
 */
export const apron: Part<ApronOptions> = (ctx, { length = 24, width = 6.8 }) => {
  const { object: o, pose, body, at, materials } = ctx;
  const { up, hipRight, hipForward, lie } = body;
  const cloth = role(materials, 'cloth');
  const leather = role(materials, 'leather');
  const j = pose.joints;
  const s = trunkScale(ctx);
  const pelvis = at.frame.origin;
  // Where the front of the body faces, and how far the panels tilt once down.
  const flatAway = (() => {
    const back = vec3(-up.x, -up.y, 0);
    return norm3(Math.hypot(back.x, back.y) > 1e-3 ? back : scale3(pose.frame.forward, -1));
  })();
  const drape = (top: Vec3, panel: number) => {
    if (lie <= 0) return scale3(up, -1);
    const drop = Math.max(0, Math.min(0.95, (top.z - 0.6) / panel));
    return norm3(lerp3(scale3(up, -1), add3(scale3(flatAway, Math.sqrt(1 - drop * drop)), vec3(0, 0, -drop)), lie));
  };
  // The bib: a plate up the chest front, narrowing to the neck strap.
  const bibTop = add3(j.chest, add3(scale3(up, 2.6 * s), scale3(hipForward, 4.4)));
  const bib = plate(bibTop, scale3(up, -1), hipRight, tornPanel(13 * s, width * 0.8, [0.4, 0.6, 0.5, 0.7, 0.5]), 0.5);
  o.add(bib, cloth);
  // The skirt: a front panel from the waist, a little wider than the tabard's.
  const top = add3(pelvis, add3(scale3(hipForward, 5.6), scale3(up, 2.2)));
  const skirt = plate(top, drape(top, length), hipRight, tornPanel(length, width, [0.4, 1.4, 0.2, 1.1, 0.3]), 0.55);
  o.add(skirt, cloth);
  // Straps: the neck loop and the waist tie.
  o.add(new Tube([add3(bibTop, scale3(hipRight, -1.6)), add3(j.neck, scale3(up, 1)), add3(bibTop, scale3(hipRight, 1.6))], 0.55), leather, { bias: 1.5 });
  o.add(new Tube([add3(top, scale3(hipRight, -3.2)), add3(pelvis, add3(scale3(hipForward, -4.6), scale3(up, 1.8))), add3(top, scale3(hipRight, 3.2))], 0.6), leather, { bias: 1.5 });
  return skirt;
};

/**
 * A shawl over the shoulders: a folded wrap across the upper chest and the back, ending in two
 * tails over the chest front. Slot: `chest`. Roles: `cloth`, `clothAccent` (optional: the hem edge).
 */
export const shawl: Part<NoOptions> = ctx => {
  const { object: o, pose, body, at, materials } = ctx;
  const { up, right: across, forward: chestFwd, lie } = body;
  const cloth = role(materials, 'cloth');
  const s = trunkScale(ctx);
  const chest = at.frame.origin;
  const wrap = Round.loft(
    [[-4, 7.4, 5], [-0.5, 8.6, 5.4], [3.2, 8.2, 4.9], [5.4, 5.2, 3.6]].map(([h, rx, ry]) => ({
      center: add3(chest, scale3(up, h * s)),
      rx,
      ry,
      axes: [across, chestFwd] as [Vec3, Vec3],
    })),
  );
  o.add(wrap, cloth);
  // Tails over the chest front: two cloth ends hanging from the wrap's front.
  const flatAway = (() => {
    const back = vec3(-up.x, -up.y, 0);
    return norm3(Math.hypot(back.x, back.y) > 1e-3 ? back : scale3(pose.frame.forward, -1));
  })();
  for (const side of [-1, 1]) {
    const top = add3(chest, add3(scale3(up, 1.4 * s), add3(scale3(chestFwd, 5.1), scale3(across, side * 2.4))));
    let down = scale3(up, -1);
    if (lie > 0) {
      const drop = Math.max(0, Math.min(0.9, (top.z - 0.6) / (9 * s)));
      down = norm3(lerp3(down, add3(scale3(flatAway, Math.sqrt(1 - drop * drop)), vec3(0, 0, -drop)), lie));
    }
    o.add(plate(top, down, across, tornPanel(9 * s, 3.4, [0.5, 0.8, 0.3, 0.6]), 0.5), cloth);
  }
  const trim = materials.clothAccent;
  if (trim) {
    // The hem edge along the wrap's bottom front.
    const hem = Array.from({ length: 7 }, (_, i) => add3(chest, add3(scale3(up, -4.2 * s), add3(scale3(chestFwd, 4.6), scale3(across, ((i / 6) * 2 - 1) * 7.4)))));
    o.add(new Tube(hem, 0.7), trim, { on: wrap });
  }
  return wrap;
};
