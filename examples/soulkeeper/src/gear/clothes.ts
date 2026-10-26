/**
 * Clothes: the soft garments a living body wears — a hood, a cloak, boots, gloves, an apron and a
 * shawl — as opposed to the armor of `garments.ts`.
 *
 * All of it follows the trunk through `ctx.body` (and the head through the shared `headFrame`), so
 * a hit recoils it and a death lays it down; only the cloak's fall looks at world up to drape on
 * the floor once the body lies. The cloak, the boots and the gloves follow the skeleton's scale
 * (`scaleOf`) like the flesh body they cover.
 */

import { createRng } from '@core';
import { partFrame, solvePose, type Part } from '@core/rig';
import { Blob, Round, Tube, UP, add3, dot3, len3, lerp3, norm3, scale3, sub3, vec3, visibleArc, type Vec3 } from '@core/volume';
import { headFrame } from './heads';
import { trunkScale } from './torso';
import { armOf, closedHand, legOf, plate, role, scaleOf, tornPanel, type NoOptions } from './util';

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
  // The cap sits back on the crown, so the face beneath reads: eyes, brows, nose and mouth all
  // stand forward of its edge in the front and 3/4 facings, and the profile reads in W/E.
  const cap = Round.ellipsoid(head.moved(-2.7, 0, 2.4), 4.9 * size, 4.85 * size, 5 * size);
  o.add(cap, cloth, on);
  // The rim of the opening: the arc of the face-plane ellipse that faces the camera, set back
  // behind the brow line and tall enough to frame the whole face.
  const rim = visibleArc(cam, head.at(1.5 * size, 0, 0.7), head.right, head.up, 4.7 * size, 4.9 * size);
  if (rim.length) o.add(new Tube(rim, 1.15), materials.clothAccent ?? cloth, on);
  // The cowl: cloth bunched round the neck onto the shoulders in a deep open neckline — its top
  // ring tilts down toward the chest, so the front edge clears the jaw and the face the rim
  // frames stays open, while the back stays high against the skull; its lower edge is in the
  // accent cloth so the hood separates from the coat it lies on.
  const s = trunkScale(ctx);
  const dip = norm3(sub3(head.forward, scale3(head.up, 0.55)));
  const ring = (h: number, rx: number, ry: number, axes: [Vec3, Vec3]) => ({ center: head.at(-0.8, 0, h * s), rx, ry, axes });
  const cowl = Round.loft([ring(-6.6, 4.9, 4.1, [head.right, dip]), ring(-8.8, 6.6, 5.4, [head.right, head.forward]), ring(-11.5, 7.6, 5.9, [head.right, head.forward])]);
  // The cowl sorts by its own depth, not `on` the head: it wraps the neck, so the head's chin and
  // face must draw over its front edge instead of the cowl painting over them.
  o.add(cowl, cloth);
  const trim = materials.clothAccent;
  if (trim) {
    const hem = visibleArc(cam, head.at(-0.2, 0, -9.6 * s), head.right, head.forward, 7.3 * s, 5.6 * s);
    if (hem.length > 1) o.add(new Tube(hem, 0.75), trim, on);
  }
  if (point) o.add(new Tube([head.at(-2, 0, 5.4 * size), head.at(-4.4, 0, 7.6 * size), head.at(-6.4, 0, 7.2 * size - 3.5 * lie)], { start: 2.4 * size, end: 0.5 }), cloth, on);
  return cap;
};

/**
 * How squarely a body's back is turned to the camera: 0 from the front and up to the profiles, 1
 * from the three-quarter rear view on, in between for the facings that lean towards the back.
 * `facing` is the body's forward along the floor against the direction to the camera: -1 seen from
 * behind, 0 in profile, 1 from the front.
 */
const rearness = (facing: number) => Math.min(1, Math.max(0, (-facing - 0.3) / 0.25));

/** Options of `cloak`. */
export interface CloakOptions {
  /** Length of the fall from the shoulders, in units. Default: down to the ankles of the standing body. */
  length?: number;
  /** Seed of the hem tongues. Default 'cloak'. */
  seed?: string;
}

/**
 * A cloak: a yoke over the shoulders, a long fall down the back that trails behind the body as it
 * moves (never forward through it) and drapes flat along the floor once the body lies, a small
 * front collar the fall hangs from, and a hem of a few broad, rounded folds. The fall takes the `cloak` role when the outfit gives one, so a cloak
 * can wear a cloth of its own value and hue next to the coat and the hood.
 * Seen from the front it stays behind the body; seen from behind (the back and the three-quarter
 * rear views) it is the outermost garment: it hangs straight down the back and draws over the coat.
 * Slot: `back`. Roles: `cloak` (fallback `cloth`), `clothAccent` (optional: the fall's edge).
 * Returns the fall.
 */
export const cloak: Part<CloakOptions> = (ctx, { length, seed = 'cloak' }) => {
  const { object: o, pose, kit, body, at, materials } = ctx;
  const { up, right: across, forward: chestFwd, hipRight, hipForward, lie } = body;
  const cam = kit.camera;
  const cloth = role(materials, 'cloak', 'cloth');
  const s = trunkScale(ctx);
  const k = scaleOf(ctx);
  const chest = at.frame.origin;
  // The yoke wraps the shoulders at collar height.
  const collar = Round.loft(
    [[2.5, 7.2, 4.8], [4.6, 6.9, 4.5], [6.4, 5, 3.4]].map(([h, rx, ry]) => ({
      center: add3(chest, scale3(up, h * s)),
      rx: rx * k,
      ry: ry * k,
      axes: [across, chestFwd] as [Vec3, Vec3],
    })),
  );
  o.add(collar, cloth);
  // The fall hangs from the back of the shoulders, sways a little with the legs' average stride
  // and drapes away from the head once the body lies (the long coat's math). The sway is measured
  // against the standing body: at rest the knees already sit ahead of the chest, and counting that
  // reach would tilt the whole fall forward, in front of the legs in the profiles. A lean or a lunge
  // that carries the chest ahead of the knees swings it back; nothing swings it forward through the
  // body it hangs behind, in any facing, and a long stride or a lunge eases out to a soft limit, so
  // the fall trails behind instead of standing out like a board.
  const j = pose.joints;
  const [first, second] = kit.skeleton.legs;
  const kneesOf = (p: typeof pose) => lerp3(p.joints[`${first.name}.knee`], p.joints[`${second.name}.knee`], 0.5);
  const rest = solvePose(kit.skeleton, pose.frame);
  const sway = sub3(sub3(kneesOf(pose), j.chest), sub3(kneesOf(rest), rest.joints.chest));
  let swing = scale3(sub3(sway, scale3(UP, dot3(sway, UP))), 0.12 * (1 - lie));
  swing = sub3(swing, scale3(hipForward, Math.max(0, dot3(swing, hipForward))));
  const reach = len3(swing);
  if (reach > 1e-6) swing = scale3(swing, (0.3 * Math.tanh(reach / 0.3)) / reach);
  // How squarely the back is turned to the camera, measured on the hips and along the floor, so a
  // twist of the shoulders in an attack or a lean in a run does not count; 0 once the body lies.
  const rear = rearness(dot3(hipForward, norm3(sub3(cam.viewDir, scale3(UP, dot3(cam.viewDir, UP)))))) * (1 - lie);
  const L = (length ?? j.pelvis.z + 9 * k) * (1 - 0.36 * lie);
  const top = add3(chest, add3(scale3(up, 5.2 * s), scale3(chestFwd, -3.2 * k)));
  const hang = norm3(add3(scale3(up, -1), scale3(chestFwd, -0.16)));
  let dir = norm3(add3(hang, swing));
  if (lie > 0) {
    const back = vec3(-up.x, -up.y, 0);
    const flat = norm3(Math.hypot(back.x, back.y) > 1e-3 ? back : scale3(pose.frame.forward, -1));
    const drop = Math.max(0, Math.min(0.95, (top.z - 0.6 * k) / L));
    dir = norm3(lerp3(hang, add3(scale3(flat, Math.sqrt(1 - drop * drop)), vec3(0, 0, -drop)), lie));
  }
  const centre = (u: number, lat = 0) => {
    const c = add3(top, add3(scale3(dir, L * u), scale3(hipRight, lat)));
    const floor = (1.6 + 2.4 * u) * k;
    return c.z < floor ? vec3(c.x, c.y, floor) : c;
  };
  const rng = createRng(seed);
  const ends = [0, 0.35, 0.7, 1];
  const widths: [number, number] = [7.4 * k, 11.8 * k];
  const deeps: [number, number] = [2.6 * k, 3.4 * k];
  const mix = (pair: [number, number], u: number) => pair[0] + (pair[1] - pair[0]) * u;
  const fall = Round.loft(ends.map(u => ({ center: centre(u), rx: mix(widths, u), ry: mix(deeps, u), axes: [hipRight, hipForward] as [Vec3, Vec3] })));
  // The fall hangs down the back. Its centroid sits high enough on the trunk to sort in front of
  // the legs, so while the chest faces the camera a bias drops it behind the body: from the front
  // it wraps the silhouette's edges instead of covering the coat and the legs. From behind it is
  // the outermost garment: a coat that rests on the body it covers sorts as deep as the trunk, and
  // the long fall's centroid sits well below that, so the bias lifts the fall to the depth of the
  // back it hangs from and it drapes over the coat instead of hiding under it.
  const frontness = Math.max(0, dot3(chestFwd, cam.viewDir));
  const hungFrom = Math.max(0, cam.depth(chest) - fall.depth(cam));
  const behind = { bias: rear * hungFrom - 52 * frontness * k };
  o.add(fall, cloth, behind);
  // The hem: three broad folds that overlap and drape, each its own length and ending round —
  // wide cloth masses, not a row of tongues or teeth. They ride `on` the fall, so the same bias keeps them behind the body.
  const folds = 3;
  for (let f = 0; f < folds; f++) {
    const frac = ((f + 0.5) / folds) * 2 - 1;
    const base = centre(0.62, frac * mix(widths, 0.62) * 0.72);
    const tip = centre(1.02 + rng.float(0, 0.1), frac * mix(widths, 1) * 0.82 + rng.float(-0.4, 0.4) * k);
    const mid = lerp3(base, tip, 0.55);
    o.add(new Tube([base, mid, tip], { start: mix(widths, 0.8) * 0.62 * rng.float(0.95, 1.15), end: 2.2 * k }), cloth, { on: fall, ...behind });
  }
  // The fall's edge in the accent cloth, when the outfit gives one: the whole edge from behind, and
  // from the other facings the part of it that faces the camera.
  const trim = materials.clothAccent;
  if (trim) {
    for (const side of [-1, 1]) {
      const run = ends.map(u => centre(u, side * mix(widths, u) * 0.97));
      const arc = rear > 0.5 ? run : run.filter(p => cam.faces(norm3(sub3(p, j.chest))));
      if (arc.length > 1) o.add(new Tube(arc, 0.8 * k), trim, { on: fall, ...behind });
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
  const k = scaleOf(ctx);
  const leg = legOf(ctx, at.side).name;
  const [, , ankle] = pose.chains[leg];
  const f = pose.frame;
  const foot = pose.joints[`${leg}.foot`];
  const boot = new Blob([
    Round.ellipsoid(partFrame(add3(foot, f.dir(2 * k, 0, 0.9 * k)), f.forward), 4.3 * k, 2.4 * k, 2 * k),
    new Tube([add3(ankle, f.dir(0, 0, 6.5 * k)), ankle], { start: 2.9 * k, end: 2.4 * k }),
  ]);
  // The bias lifts the boot over the leg it covers: the leg's mass averages deeper than the
  // foot-level boot, and without it the skin foot would paint over the leather.
  o.add(boot, leather, { bias: 12 * k });
  return boot;
};

/** Options of `fittedSleeve`. */
export interface FittedSleeveOptions {
  /** Scale of the sleeve's thickness. Default 1. */
  size?: number;
}

/**
 * A fitted cloth sleeve over the whole arm, the sleeve of a doublet worn under armour: a rounded
 * shoulder, the upper arm, the elbow and the forearm down to the wrist as one slim mass, fuller
 * than the bare arm, so the arm keeps a believable thickness and a vambrace and a glove fit over it.
 * It covers the arm whole, so it can stand in for the `flesh-arm`. Follows the skeleton's scale.
 * Mirrored by side.
 * Slot: `shoulder` (side -1 left, 1 right). Roles: `cloth`. Returns the sleeve, so a shield can rest on it.
 */
export const fittedSleeve: Part<FittedSleeveOptions> = (ctx, { size = 1 }) => {
  const { object: o, pose, body, at, materials } = ctx;
  const k = scaleOf(ctx);
  const w = k * size;
  const [sh, el, ha] = pose.chains[armOf(ctx, at.side).name];
  const wrist = add3(ha, scale3(norm3(sub3(ha, el)), 0.4 * k));
  const sleeve = new Blob([
    Round.ellipsoid(partFrame(sh, body.forward, body.up), 2.75 * w, 2.75 * w, 2.75 * w),
    new Tube([sh, el], { start: 4.6 * w, end: 3.6 * w }),
    Round.ellipsoid(partFrame(el, pose.frame.forward), 1.75 * w, 1.75 * w, 1.75 * w),
    new Tube([el, wrist], { start: 3.3 * w, end: 2.6 * w }),
  ]);
  o.add(sleeve, role(materials, 'cloth'));
  return sleeve;
};

/**
 * Leggings: fitted leather over the seat, the thigh and the knee, ending under a greave or inside a
 * boot's shaft — legwear for a skirt that ends above the knee. Each side covers its half of the hips
 * as well, so no skin shows under a short skirt, even when the body lies. Follows the leg, the trunk
 * and the skeleton's scale.
 * Slot: `thigh` (side -1 left, 1 right). Roles: `leather`. Returns the leg, so a greave can rest on it.
 */
export const leggings: Part<NoOptions> = ctx => {
  const { object: o, pose, body, at, materials } = ctx;
  const { up, hipRight, hipForward } = body;
  const k = scaleOf(ctx);
  const leather = role(materials, 'leather');
  const [hip, knee, ankle] = pose.chains[legOf(ctx, at.side).name];
  // The seat: this side's half of the hips, set low on them, so it covers the bare hips from below
  // (what shows of them under a short skirt once the body lies) and sorts under a skirt standing.
  const pelvis = pose.joints.pelvis ?? hip;
  const seat = Round.ellipsoid(partFrame(add3(pelvis, add3(scale3(up, -1 * k), scale3(hipRight, at.side * 1.8 * k))), hipForward, up), 4.6 * k, 4.3 * k, 4.2 * k);
  o.add(seat, leather);
  const mass = new Blob([
    new Tube([hip, knee], { start: 4.9 * k, end: 3.7 * k }),
    Round.ellipsoid(partFrame(knee, pose.frame.forward), 2.45 * k, 2.45 * k, 2.55 * k),
    new Tube([knee, lerp3(knee, ankle, 0.35)], { start: 3.7 * k, end: 3.2 * k }),
  ]);
  // The bias lifts the leggings over the bare leg they cover.
  o.add(mass, leather, { bias: 2 * k });
  return mass;
};

/** Options of `glove`. */
export interface GloveOptions {
  /** Width of the cuff at the wrist. Default 1. */
  cuff?: number;
  /** Scale of the whole glove. Default 1. */
  size?: number;
}

/**
 * A leather glove over one hand: a thicker palm than the bare flesh hand, fingers curled the same
 * way, and a cuff round the wrist. The cuff covers the wrist the `flesh-arm` ends at. While the hand
 * holds something (`ctx.grip`) it is a plain gloved fist round the handle instead (`closedHand`).
 * Slot: `hand` (side -1 left, 1 right). Roles: `leather`.
 */
export const glove: Part<GloveOptions> = (ctx, { cuff = 1, size = 1 }) => {
  const { object: o, at, materials } = ctx;
  const leather = role(materials, 'leather');
  const k = scaleOf(ctx) * size;
  if (ctx.grip) return closedHand(ctx, ctx.grip, leather, k);
  const f = at.frame;
  const band = new Tube([f.at(0.2 * k, -2.9 * k, 0.6 * k), f.at(0.4 * k, 0, 1.9 * k), f.at(0.2 * k, 2.9 * k, 0.6 * k), f.at(-0.2 * k, 2.6 * k, -1.3 * k), f.at(-0.2 * k, -2.6 * k, -1.3 * k), f.at(0.2 * k, -2.9 * k, 0.6 * k)], 1.15 * cuff * k);
  // The bias lifts the glove over the arm it covers: the arm's mass averages deeper than the hand.
  o.add(band, leather, { bias: 6 * k });
  const palm = Round.ellipsoid(f.moved(2.3 * k, 0, 0.15 * k), 3 * k, 2.7 * k, 1.4 * k);
  o.add(palm, leather, { on: band, bias: 6 * k });
  for (let i = 0; i < 4; i++) {
    const y = (i - 1.5) * 1.4;
    const len = 4.5 - 0.45 * Math.abs(i - 1.5) * 1.2 + (i === 1 || i === 2 ? 0.4 : 0);
    o.add(new Tube([f.at(3.8 * k, y * 0.9 * k, 0.4 * k), f.at((3.8 + len * 0.55) * k, y * 1.15 * k, 0.9 * k), f.at((3.8 + len) * k, y * 1.3 * k, 1.9 * k)], { start: 1.25 * k, end: 0.65 * k }), leather, { on: palm, bias: 6 * k });
  }
  const inner = -at.side;
  o.add(new Tube([f.at(1.5 * k, inner * 2 * k, 0.2 * k), f.at(3.1 * k, inner * 3.4 * k, 0.7 * k), f.at(4.7 * k, inner * 3.9 * k, 1.5 * k)], { start: 1.5 * k, end: 0.7 * k }), leather, { on: palm, bias: 6 * k });
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
