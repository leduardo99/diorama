import assert from 'node:assert/strict';
import { Blob, Camera, Frame3, Stage, Tube, add3, dot3, facingYaw, len3, scale3, sub3, vec3, type VolumeStyle } from '../../core/volume/index.js';
import {
  defineItemIcon,
  validateItems,
  type ItemCatalog,
  BEAT,
  beat,
  bite,
  checkClip,
  death,
  defineCharacter,
  defineClip,
  hit,
  jump,
  dodge,
  bodyFrames,
  slotFrame,
  held,
  outfit,
  outfitFromData,
  validateOutfit,
  slotsOf,
  partKind,
  swapCandidates,
  swapPiece,
  equipPart,
  removePiece,
  swapBlocker,
  checkWield,
  weaponSockets,
  wieldOf,
  defineGearAsset,
  type GearCatalog,
  type Part,
  spawnEvent,
  bump,
  defineSkeleton,
  footCycle,
  groundSpeed,
  humanoid,
  idle,
  locomotion,
  mannequinSkin,
  quadruped,
  slash,
  solvePose,
  type Clip,
  type GaitSpec,
  type LegSpec,
  type Local,
  type SkeletonSpec,
} from '../../core/rig/index.js';

console.log('🧪 Starting @core/rig Test Suite...\n');

const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≉ ${b}`);
const frame = Frame3.facing(vec3(0, 0, 0), facingYaw(1, 8));
const pose = (s: SkeletonSpec, c: Clip, t: number) => solvePose(s, frame, c.drive(t));
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => len3(sub3(a, b));

// Gait math: in-place stance travels backwards at exactly the ground speed.
{
  const g = humanoid().gaits.walk;
  const a = footCycle(g, 0.1);
  const b = footCycle(g, 0.2);
  const perSecond = ((a.forward - b.forward) / 0.1) * g.cadence;
  near(perSecond, groundSpeed(g), 1e-9, 'stance speed equals ground speed');
  assert.equal(footCycle(g, 0).up, 0);
  assert.ok(footCycle(g, g.duty + (1 - g.duty) / 2).up > 0, 'the swinging foot is lifted');
  near(footCycle(g, 0.999999).forward, g.stride / 2, 1e-3, 'the swing ends where the stance starts');
  console.log('✔ Gait cycle and ground speed passed.');
}

// Every skeleton and clip: exact bone lengths, planted feet that do not slide, closed loops.
for (const [skel, clips] of [
  [humanoid(), (s: SkeletonSpec) => [locomotion(s, 'walk'), locomotion(s, 'run'), idle(s), slash(s)]],
  [quadruped(), (s: SkeletonSpec) => [locomotion(s, 'walk'), locomotion(s, 'run'), idle(s), bite(s)]],
] as [SkeletonSpec, (s: SkeletonSpec) => Clip[]][]) {
  for (const clip of clips(skel)) {
    const N = 96;
    let worstBone = 0;
    let worstSlide = 0;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const p = pose(skel, clip, t);
      for (const leg of skel.legs) {
        const c = p.chains[leg.name];
        worstBone = Math.max(worstBone, Math.abs(dist(c[0], c[1]) - leg.lengths[0]), Math.abs(dist(c[1], c[2]) - leg.lengths[1]));
        if (leg.foot) worstBone = Math.max(worstBone, Math.abs(dist(c[2], c[3]) - leg.foot.length));
        for (const q of c) assert.ok(Number.isFinite(q.x + q.y + q.z), `${skel.name}/${clip.name}: finite joints`);
      }
      for (const arm of skel.arms ?? []) {
        const c = p.chains[arm.name];
        worstBone = Math.max(worstBone, Math.abs(dist(c[0], c[1]) - arm.lengths[0]), Math.abs(dist(c[1], c[2]) - arm.lengths[1]));
      }
      // In locomotion, a planted foot moves backwards at the ground speed: in the game the sprite moves
      // forward at that speed, so the foot is still on the floor.
      if (clip.speed > 0) {
        const q = pose(skel, clip, t + 1 / N);
        for (const leg of skel.legs) {
          const g = skel.gaits[clip.name];
          if (!footCycle(g, t + g.phases[leg.name]).planted || !footCycle(g, t + 1 / N + g.phases[leg.name]).planted) continue;
          const a = p.joints[`${leg.name}.foot`];
          const b = q.joints[`${leg.name}.foot`];
          const moved = dist(a, b);
          const expected = clip.speed * (clip.seconds / N);
          worstSlide = Math.max(worstSlide, Math.abs(moved - expected), Math.abs(a.z), Math.abs(b.z));
        }
      }
    }
    assert.ok(worstBone < 0.01, `${skel.name}/${clip.name}: bone lengths drift by ${worstBone.toFixed(4)}`);
    assert.ok(worstSlide < 0.01, `${skel.name}/${clip.name}: planted feet slide by ${worstSlide.toFixed(4)}`);
    if (clip.loop) {
      const a = pose(skel, clip, 0);
      const b = pose(skel, clip, 1 - 1e-9);
      for (const k of Object.keys(a.joints)) near(dist(a.joints[k], b.joints[k]), 0, 1e-3, `${skel.name}/${clip.name}: loop closes at ${k}`);
    }
    // Deterministic: the same t gives the same pose.
    assert.deepEqual(pose(skel, clip, 0.37).joints, pose(skel, clip, 0.37).joints);
  }
}
console.log('✔ Bone lengths, foot planting, loop closure and determinism (humanoid and quadruped) passed.');

// checkClip (run on every character export) agrees: every preset clip is clean, and a broken
// gait is reported.
{
  for (const skel of [humanoid(), quadruped()]) {
    for (const clip of [locomotion(skel, 'walk'), locomotion(skel, 'run'), idle(skel)]) {
      const r = checkClip(skel, clip);
      assert.deepEqual(r.warnings, [], `${skel.name}/${clip.name}: ${r.warnings.join('; ')}`);
    }
  }
  assert.equal(checkClip(humanoid(), slash(humanoid())).footSlide, null, 'in-place clips have no slide figure');
  assert.equal(typeof checkClip(humanoid(), slash(humanoid())).loopGap, 'number', 'every clip reports its end-to-start gap, loop or not');
  const h = humanoid();
  const broken = { ...h, gaits: { ...h.gaits, walk: { ...h.gaits.walk, stride: 80, lift: 30 } } };
  const r = checkClip(broken, locomotion(broken, 'walk'));
  assert.ok(r.warnings.length > 0, 'an over-long stride is reported');
  console.log('✔ checkClip passed.');
}

// Loop closure is measured for every clip; only cycles are warned about (defineClip defaults loop to false).
{
  const h = humanoid();
  const oneShot = slash(h);
  assert.equal(oneShot.loop, false);
  const shot = checkClip(h, oneShot);
  assert.ok(Number.isFinite(shot.loopGap) && shot.loopGap >= 0, 'a non-loop clip has a numeric loopGap');
  // A one-shot in place may end away from where it began: reported, not warned.
  const drift = defineClip({ name: 'drift', seconds: 1, drive: t => ({ root: [3 * t, 0, 0] }) });
  assert.equal(drift.loop, false, 'defineClip plays once by default');
  const driftCheck = checkClip(h, drift);
  assert.ok(driftCheck.loopGap > 2.5, `the gap of a clip that ends elsewhere is reported (${driftCheck.loopGap})`);
  assert.deepEqual(driftCheck.warnings, [], 'no warning for a non-loop clip in place');
  // The same cycle with loop: true is warned about; a closed idle forgotten without loop is clean.
  assert.ok(checkClip(h, defineClip({ name: 'drift', seconds: 1, loop: true, drive: drift.drive })).warnings.some(w => /loop does not close/.test(w)));
  const breathe = defineClip({ name: 'breathe', seconds: 1, drive: t => ({ root: [0, 0, 0.5 * Math.sin(Math.PI * 2 * t)] }) });
  const breatheCheck = checkClip(h, breathe);
  assert.ok(breatheCheck.loopGap < 0.05 && breatheCheck.warnings.length === 0, 'a closed cycle is clean whether or not loop was set');
  // A clip that moves (speed > 0) is a cycle even when loop was left at its default: warn and say how to fix it.
  const shuffle = defineClip({ name: 'shuffle', seconds: 1, speed: 10, drive: drift.drive });
  assert.ok(checkClip(h, shuffle).warnings.some(w => /loop does not close.*loop: true/.test(w)), 'moving clips need loop: true');
  console.log('✔ Loop gap for every clip passed.');
}

// Vector knees: an 8-legged spider whose legs arch up and out, walking in two alternating groups.
/** Spider with four leg pairs on one thorax joint; `knee(side)` gives the knee of the left (-1) or right (+1) legs. */
function spider(knee: (side: -1 | 1) => LegSpec['knee'], gait: Partial<GaitSpec> = {}): SkeletonSpec {
  const legs: LegSpec[] = [];
  const phases: Record<string, number> = {};
  const hips = [5, 2, -2, -5];
  const reach = [10, 4, -4, -10];
  hips.forEach((f, i) => {
    for (const side of [-1, 1] as const) {
      const name = `${side < 0 ? 'L' : 'R'}${i + 1}`;
      legs.push({ name, hip: 'thorax', offset: [f, side * 3, 0], lengths: [14, 16], knee: knee(side), stance: [reach[i], side * 20, 0] });
      // Alternating tetrapod: L1 R2 L3 R4 together, R1 L2 R3 L4 half a cycle later.
      phases[name] = (i + (side < 0 ? 0 : 1)) % 2 === 0 ? 0 : 0.5;
    }
  });
  return defineSkeleton({
    name: 'spider',
    height: 18,
    trunk: [
      { name: 'abdomen', at: [-12, 0, 9] },
      { name: 'thorax', at: [0, 0, 9] },
      { name: 'head', at: [7, 0, 9] },
    ],
    head: 'head',
    legs,
    gaits: { walk: { duty: 0.6, stride: 8, cadence: 1.2, phases, lift: 4, ...gait } },
  });
}
{
  const out = (side: -1 | 1): Local => [0, side, 1.2];
  const s = spider(out);
  const walk = locomotion(s, 'walk');
  const check = checkClip(s, walk);
  assert.deepEqual(check.warnings, [], `spider walk is clean: ${check.warnings.join('; ')}`);
  assert.ok(check.boneDrift < 0.01 && (check.footSlide ?? 1) < 0.01, 'exact bones and planted feet on the spider');
  // The vector hint bends every knee up and out of the hip-to-foot line, at every moment of the cycle.
  for (const t of [0, 0.15, 0.3, 0.5, 0.65, 0.85]) {
    const p = pose(s, walk, t);
    for (const leg of s.legs) {
      const hip = p.joints[`${leg.name}.hip`];
      const foot = p.joints[`${leg.name}.foot`];
      const knee = p.joints[`${leg.name}.knee`];
      const mid = scale3(add3(hip, foot), 0.5);
      const away = sub3(knee, mid);
      const outward = dot3(away, frame.right) * (leg.offset[1] < 0 ? -1 : 1);
      assert.ok(away.z > 2, `${leg.name} at ${t}: knee is above the hip-foot midpoint (${away.z.toFixed(2)})`);
      assert.ok(outward > 0.5, `${leg.name} at ${t}: knee is displaced outward (${outward.toFixed(2)})`);
    }
  }
  // The same legs with a plain 'forward' knee still bend along the facing (unchanged behaviour).
  const flat = spider(() => 'forward');
  const q = pose(flat, locomotion(flat, 'walk'), 0.3);
  for (const leg of flat.legs) {
    const mid = scale3(add3(q.joints[`${leg.name}.hip`], q.joints[`${leg.name}.foot`]), 0.5);
    assert.ok(dot3(sub3(q.joints[`${leg.name}.knee`], mid), frame.forward) > 0.5, `${leg.name}: 'forward' bends ahead`);
  }
  const h = solvePose(humanoid(), frame, {});
  const hm = scale3(add3(h.joints['legL.hip'], h.joints['legL.foot']), 0.5);
  assert.ok(dot3(sub3(h.joints['legL.knee'], hm), frame.forward) > 0, "a biped's knee still points forward");
  const w = solvePose(quadruped(), frame, {});
  const fm = scale3(add3(w.joints['foreL.hip'], w.joints['foreL.foot']), 0.5);
  assert.ok(dot3(sub3(w.joints['foreL.knee'], fm), frame.forward) < 0, "a front leg's elbow still points back");
  console.log('✔ Vector knees (spider) passed.');
}

// A vector knee is validated like the rest of the spec.
{
  assert.throws(() => spider(() => [0, 0, 0]), /leg "L1".*knee/);
  assert.throws(() => spider(side => [0, side, Number.NaN]), /leg "L1".*knee/);
  assert.throws(() => spider(() => [0, 1] as unknown as Local), /knee/);
  assert.throws(() => spider(() => 'sideways' as unknown as 'forward'), /knee/);
  assert.doesNotThrow(() => spider(() => [0, 0, 1]));
  console.log('✔ Knee validation passed.');
}

// mannequinSkin draws any skeleton: a spider's thorax-only trunk, a coincident trunk, the presets.
{
  const style: VolumeStyle = { ramp: { lit: '#fff', base: '#888', dark: '#222' }, stroke: { width: 1, color: '#000' } };
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
  const draw = (s: SkeletonSpec, clip: Clip = idle(s)) => {
    const camera = new Camera();
    const stage = new Stage(camera);
    const object = stage.object();
    const added: unknown[] = [];
    const add = object.add.bind(object);
    object.add = ((item, st, opts) => (added.push(item), add(item, st, opts))) as typeof object.add;
    const poseAt = (t: number) => solvePose(s, frame, clip.drive(t));
    mannequinSkin(style)(object, poseAt(0), { camera, skeleton: s, clip, t: 0, poseAt });
    stage.draw(ctx);
    return added;
  };
  const s = spider(side => [0, side, 1.2]);
  const parts = draw(s);
  assert.ok(parts[0] instanceof Blob, 'the trunk is one blob');
  assert.equal((parts[0] as Blob).parts.length, 3, 'a tube through the trunk plus an ellipsoid at each non-head joint');
  assert.equal(parts.length, 1 + s.legs.length + 1, 'blob, one tube per leg, head');
  // The tube follows the trunk in its own order, wherever the head joint sits in it.
  const reordered = defineSkeleton({ ...s, trunk: [s.trunk[0], s.trunk[2], s.trunk[1]] });
  const tube = (draw(reordered)[0] as Blob).parts[0] as Tube;
  assert.ok(tube instanceof Tube, 'the first part of the trunk blob is the tube');
  const reorderedPose = solvePose(reordered, frame, idle(reordered).drive(0));
  assert.deepEqual(tube.points, reordered.trunk.map(j => reorderedPose.joints[j.name]), 'the tube runs through the joints in trunk order');
  // Joints on top of each other (no path to draw through) still give a body.
  const stacked = defineSkeleton({ ...s, trunk: s.trunk.map(j => ({ ...j, at: [0, 0, 9] as Local })) });
  const still = defineClip({ name: 'still', seconds: 1, drive: () => ({}) });
  assert.equal((draw(stacked, still)[0] as Blob).parts.length, 2, 'coincident joints skip the tube');
  // A trunk of a single joint (the head) has nothing but the head to draw.
  const lone = defineSkeleton({ ...s, trunk: [{ name: 'head', at: [0, 0, 9] }], legs: [], gaits: {} });
  assert.equal(draw(lone).length, 1, 'only the head');
  for (const preset of [humanoid(), quadruped()]) assert.ok(draw(preset).length > 3, `${preset.name} mannequin draws`);
  console.log('✔ mannequinSkin passed.');
}

// Events and beats.
{
  const h = humanoid();
  const walk = locomotion(h, 'walk');
  assert.deepEqual(walk.events.map(e => e.name), ['step:legL', 'step:legR']);
  near(walk.events[1].t - walk.events[0].t, 0.5, 1e-9, 'biped steps half a cycle apart');
  assert.equal(slash(h).events[0].name, 'hit');
  near(beat(BEAT.extreme, BEAT, 0, 1, -2, -1.5), -2, 1e-9, 'beat reaches the extreme (overshoot) at the end of the strike');
  near(beat(BEAT.settle, BEAT, 0, 1, -2, -1.5), -1.5, 1e-9, 'and settles on the target');
  near(beat(1, BEAT, 0, 1, -2, -1.5), 0, 1e-9, 'and returns to rest');
  const q = quadruped();
  assert.equal(locomotion(q, 'walk').events.length, 4);
  console.log('✔ Events and beat timing passed.');
}

// Skeleton validation catches broken specs.
{
  const base = humanoid();
  assert.throws(() => defineSkeleton({ ...base, legs: [{ ...base.legs[0], hip: 'nope' }] }), /unknown joint/);
  assert.throws(() => defineSkeleton({ ...base, gaits: { walk: { ...base.gaits.walk, phases: { legL: 0 } } } }), /no phase for leg "legR"/);
  console.log('✔ Skeleton validation passed.');
}

// Action contract: kinds on every preset, hit/death for any skeleton, contract warnings.
{
  const h = humanoid();
  const q = quadruped();
  assert.equal(locomotion(h, 'walk').kind, 'walk');
  assert.equal(locomotion(q, 'run').kind, 'run');
  assert.equal(idle(h).kind, 'idle');
  assert.equal(slash(h).kind, 'attack');
  assert.equal(bite(q).kind, 'attack');
  for (const s of [h, q]) {
    for (const c of [hit(s), death(s)]) assert.deepEqual(checkClip(s, c).warnings, [], `${s.name}/${c.name}: ${checkClip(s, c).warnings.join('; ')}`);
    assert.equal(death(s).hold, true, 'a death holds its last frame');
    // The fallen body lies near the floor, above it.
    const lying = solvePose(s, frame, death(s).drive(0.99));
    const trunkZ = s.trunk.map(j => lying.joints[j.name].z);
    assert.ok(Math.max(...trunkZ) < s.height * 0.45 && Math.min(...trunkZ) > -0.5, `${s.name} death ends lying down: ${trunkZ.map(z => z.toFixed(1))}`);
  }
  const noHit = defineClip({ name: 'swing', kind: 'attack', seconds: 0.4, drive: () => ({}) });
  assert.ok(checkClip(h, noHit).warnings.some(w => w.includes('`hit` event')), 'an attack without hit is reported');
  const noCast = defineClip({ name: 'bolt', kind: 'skill', seconds: 0.4, drive: () => ({}) });
  assert.ok(checkClip(h, noCast).warnings.some(w => w.includes('`cast` or `release`')), 'a skill without cast/release is reported');
  assert.equal(defineClip({ name: 'x', seconds: 1, loop: true, drive: () => ({}) }).kind, 'idle', 'an undeclared loop defaults to idle');
  assert.equal(bump(0.05, 0.1, 0.3), 0, 'bump is 0 before its window');
  assert.equal(bump(0.5, 0.1, 0.3), 0, 'bump is 0 after its window (bell alone would grow again)');
  assert.ok(Math.abs(bump(0.2, 0.1, 0.3) - 1) < 1e-9, 'bump peaks at 1 mid-window');
  const pounce = defineClip({ name: 'pounce', kind: 'attack', seconds: 0.6, events: [{ t: 0.5, name: 'hit' }], travel: t => 30 * t, drive: () => ({}) });
  const pc = defineCharacter({ name: 'p', skeleton: h, skin: () => {}, camera: new Camera(), width: 8, height: 8, pivot: { x: 4, y: 8 }, frames: 4, clips: { idle: idle(h), pounce } });
  assert.deepEqual(pc.manifest.clips[1].travel, [0, 7.5, 15, 22.5, 30], 'root motion is exported per frame and at the end');
  assert.deepEqual((pc.sheet('pounce').data as any).travel, [0, 7.5, 15, 22.5, 30]);
  console.log('✔ Action kinds, hit/death presets and contract warnings passed.');
}

// defineCharacter: manifest, controls, sockets per frame, validation.
{
  const h = humanoid();
  const guard = defineCharacter({
    name: 'test-guard',
    skeleton: h,
    skin: () => {},
    camera: new Camera(),
    width: 96,
    height: 112,
    pivot: { x: 48, y: 96 },
    directions: 4,
    sockets: { hand: p => p.joints['armR.hand'] },
    clips: {
      idle: { clip: idle(h), frames: 4 },
      walk: locomotion(h, 'walk'),
      run: locomotion(h, 'run'),
      slash: { clip: slash(h), frames: 12 },
      cast: defineClip({ name: 'cast', kind: 'skill', seconds: 0.5, events: [{ t: 0.5, name: 'release' }, { t: 0.5, name: spawnEvent('hand') }], drive: () => ({}) }),
      hit: hit(h),
      death: death(h),
    },
  });
  const m = guard.manifest;
  assert.equal(m.controls.idle, 'idle');
  assert.deepEqual(m.controls.move, ['walk', 'run'], 'locomotion keys are ordered by ground speed');
  assert.deepEqual(m.controls.actions, { attack: ['slash'], skill: ['cast'], hit: ['hit'], death: ['death'] });
  assert.deepEqual(m.directions, ['S', 'W', 'N', 'E']);
  assert.deepEqual(m.sockets, ['head', 'center', 'hand']);
  assert.deepEqual(m.warnings, []);
  assert.equal(m.clips.find(c => c.key === 'slash')!.events[0].frame, Math.round(BEAT.extreme * 12) % 12, 'event frames use the clip\'s own frame count');
  const sheet = guard.sheet('slash');
  const data = sheet.data as Record<string, any>;
  assert.equal(data.action, 'attack');
  assert.equal(data.character.name, 'test-guard');
  assert.equal(m.label, 'Test guard', 'without a label, the manifest names the character in words');
  assert.equal(data.character.label, m.label, 'every sheet carries the label');
  assert.equal(data.key, 'slash');
  assert.equal(Object.keys(data.sockets.frames).length, 4 * 12, 'one socket row per direction and frame');
  const [hx, hy, hd] = data.sockets.frames.S_0[data.sockets.names.indexOf('head')];
  assert.ok(hx > 30 && hx < 66 && hy > 0 && hy < 50 && Math.abs(hd) < 20, `the head socket sits above the pivot: ${hx}, ${hy}, ${hd}`);
  assert.throws(() => guard.sheet('nope'), /no clip "nope"/);
  assert.throws(() => defineCharacter({ ...({} as any), name: 'bad', skeleton: h, skin: () => {}, camera: new Camera(), width: 8, height: 8, pivot: { x: 4, y: 8 }, clips: { 'Walk Fast': locomotion(h, 'walk') } }), /lowercase/);
  const loose = defineCharacter({ name: 'loose', skeleton: h, skin: () => {}, camera: new Camera(), width: 8, height: 8, pivot: { x: 4, y: 8 }, clips: { zap: defineClip({ name: 'zap', kind: 'skill', seconds: 0.3, events: [{ t: 0.2, name: spawnEvent('wand') }], drive: () => ({}) }) } });
  assert.ok(loose.manifest.warnings.some(w => w.includes('no idle')) && loose.manifest.warnings.some(w => w.includes('unknown socket')), 'missing idle and unknown sockets are reported');
  const warden = defineCharacter({ name: 'gate_warden', label: 'Gate Warden', skeleton: h, skin: () => {}, camera: new Camera(), width: 8, height: 8, pivot: { x: 4, y: 8 }, clips: { idle: idle(h) } });
  assert.equal((warden.sheet('idle').data as any).character.label, 'Gate Warden', 'a label is kept as written');
  assert.equal(defineCharacter({ name: 'gate_warden', skeleton: h, skin: () => {}, camera: new Camera(), width: 8, height: 8, pivot: { x: 4, y: 8 }, clips: { idle: idle(h) } }).manifest.label, 'Gate warden', 'underscores and dashes become spaces');
  // Effect cues: played on clip events, carried in the manifest, checked against events and sockets.
  const caster = defineCharacter({
    name: 'caster', skeleton: h, skin: () => {}, camera: new Camera(), width: 8, height: 8, pivot: { x: 4, y: 8 }, sockets: { hand: p => p.joints['armR.hand'] },
    clips: { idle: idle(h), cast: defineClip({ name: 'cast', kind: 'skill', seconds: 0.5, events: [{ t: 0.5, name: 'release' }, { t: 0.5, name: spawnEvent('hand') }], drive: () => ({}) }) },
    effects: { cast: [{ on: 'release', effect: 'soul-bolt', motion: 'fly' }, { on: 'start', effect: 'cast-circle', at: 'feet' }] },
  });
  assert.equal(caster.manifest.effects.cast[0].effect, 'soul-bolt');
  assert.deepEqual(caster.manifest.warnings, []);
  assert.equal((caster.sheet('cast').data as any).character.effects.cast.length, 2, 'every sheet carries the cues');
  const miscued = defineCharacter({ name: 'miscued', skeleton: h, skin: () => {}, camera: new Camera(), width: 8, height: 8, pivot: { x: 4, y: 8 }, clips: { idle: idle(h) }, effects: { idle: [{ on: 'release', effect: 'x', at: 'wand' }], dance: [] } });
  for (const needle of ['no clip "dance"', 'event "release"', 'socket "wand"']) assert.ok(miscued.manifest.warnings.some(w => w.includes(needle)), `cue problems reported: ${needle}`);
  console.log('✔ defineCharacter manifest, controls and sockets passed.');
}

// Jump, dodge and hit: clean, with root motion that keeps planted feet still in the world.
{
  for (const s of [humanoid(), quadruped()]) {
    const clips = [hit(s), jump(s), jump(s, { distance: 30 }), dodge(s), dodge(s, { style: 'backstep' })];
    for (const c of clips) assert.deepEqual(checkClip(s, c).warnings, [], `${s.name}/${c.name}: ${checkClip(s, c).warnings.join('; ')}`);
    assert.ok(hit(s).travel!(1) < 0, 'a hit knocks the character back');
    assert.equal(hit(s, { knockback: 0 }).travel, undefined, 'knockback 0 stays in place');
    for (const c of [dodge(s), dodge(s, { style: 'backstep' }), jump(s, { distance: 30 })]) {
      // A foot's world position = its position in the body's frame + the travel so far.
      const worldX = (leg: string, t: number) => solvePose(s, Frame3.facing(vec3(0, 0, 0), 0), c.drive(t)).joints[`${leg}.foot`].x + c.travel!(t);
      for (const leg of s.legs) {
        const start = worldX(leg.name, 0);
        const end = worldX(leg.name, 0.999);
        near(end - start, c.travel!(1), 0.05, `${s.name}/${c.name}/${leg.name}: the foot ends where the body went`);
        // Whenever the foot is on the floor it does not slide: it is at its start or at its end.
        for (let i = 0; i <= 60; i++) {
          const t = i / 60;
          const foot = solvePose(s, Frame3.facing(vec3(0, 0, 0), 0), c.drive(t)).joints[`${leg.name}.foot`];
          if (foot.z > 0.05) continue;
          const x = foot.x + c.travel!(t);
          assert.ok(Math.abs(x - start) < 0.1 || Math.abs(x - end) < 0.1, `${s.name}/${c.name}/${leg.name}: a planted foot slides at t=${t.toFixed(2)} (world x ${x.toFixed(2)}, start ${start.toFixed(2)}, end ${end.toFixed(2)})`);
        }
      }
    }
  }
  assert.equal(jump(humanoid()).events.map(e => e.name).join(','), 'takeoff,land,cancel');
  assert.equal(dodge(humanoid()).kind, 'dodge');
  console.log('✔ Jump, dodge and hit root motion passed.');
}

// Gear: pitch-safe body frames, right-handed slot frames, held items, outfits.
{
  const h = humanoid();
  const q = quadruped();
  const cross = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const standing = solvePose(h, frame, idle(h).drive(0));
  const lying = solvePose(h, frame, death(h).drive(0.99));
  const b0 = bodyFrames(standing, h);
  const b1 = bodyFrames(lying, h);
  assert.ok(b0.up.z > 0.95 && b0.lie === 0, 'a standing body is upright');
  assert.ok(Math.abs(b1.up.z) < 0.3 && b1.lie > 0.9, 'a dead body lies: its up is horizontal and lie ~1');
  assert.ok(bodyFrames(solvePose(q, frame, idle(q).drive(0)), q).up.z > 0.9, 'a quadruped stands with up = up');
  for (const [slot, side] of [['head', 1], ['chest', 1], ['pelvis', 1], ['shoulder', -1], ['shoulder', 1], ['forearm', -1], ['hand', 1], ['shin', 1], ['foot', -1]] as const) {
    const { frame: f, side: sd } = slotFrame(standing, h, slot, side);
    const u = cross(f.forward, f.right);
    assert.ok(dot3(u, f.up) > 0.99, `${slot}: the slot frame is right-handed (forward × right = up)`);
    if (slot === 'shoulder') {
      near(len3(sub3(f.origin, standing.joints[side < 0 ? 'armL.shoulder' : 'armR.shoulder'])), 0, 1e-9, 'a shoulder slot sits on its joint');
      assert.equal(sd, side);
    }
  }
  assert.throws(() => slotFrame(solvePose(q, frame, {}), q, 'shoulder', 1), /no right arm/);
  near(len3(sub3(slotFrame(standing, h, 'chest').frame.origin, standing.joints.chest)), 0, 1e-9, 'a humanoid chest slot is the chest joint (where the arms hang), not the neck');
  const staff = held(standing, h, 'armR', { length: 20, butt: 40, rest: [0.1, 0.1, 0.99] });
  assert.ok(staff.butt.z >= -1e-9 && len3(sub3(staff.butt, staff.grip)) < 40, 'a long butt shortens to touch the floor instead of sinking');
  // Held items: the tip is `length` away, never below the floor, and follows weaponYaw.
  const atRest = held(standing, h, 'armR', { length: 24 });
  near(len3(sub3(atRest.tip, atRest.grip)), 24, 1e-6, 'tip at length');
  assert.ok(atRest.tip.z >= 0.99, 'the tip stays above the floor');
  const pose2 = { ...standing, extra: { weaponYaw: 0, weaponPitch: 0 } };
  assert.ok(held(pose2, h, 'armR', { length: 24 }).dir.x > 0.99 || dot3(held(pose2, h, 'armR', { length: 24 }).dir, standing.frame.forward) > 0.99, 'yaw 0, pitch 0 points forward');
  const offHand = held(pose2, h, 'armR', { length: 24, channel: 'offWeapon' });
  assert.ok(dot3(offHand.dir, held(standing, h, 'armR', { length: 24 }).dir) > 0.999, 'an off-hand item ignores the main hand\'s swing and keeps its rest');
  const onFloor = held(lying, h, 'armR', { length: 24 });
  assert.ok(onFloor.tip.z >= 0.99 && Math.abs(onFloor.dir.z) < 0.5, 'a dead body lays its weapon along the floor');
  // Outfit: pieces in order, `on` hands the host over, piece materials override the outfit's.
  const calls: string[] = [];
  const style = (name: string) => ({ ramp: { lit: name, base: name, dark: name } });
  const marker = (label: string): Part => ctx => {
    calls.push(`${label}:${ctx.at.side}:${ctx.materials.metal.ramp.base}:${ctx.host ? 'host' : '-'}`);
    return { depth: () => 0, draw: () => {} };
  };
  const skin = outfit({
    base: (_o, _p, _k, m) => calls.push(m.metal ? 'base' : 'base without materials'),
    materials: { metal: style('iron') },
    pieces: [
      { part: marker('helm'), slot: 'head', id: 'helm' },
      { part: marker('crest'), slot: 'head', on: 'helm', materials: { metal: style('gold') } },
      { part: marker('pauldron'), slot: 'shoulder', side: -1 },
    ],
  });
  const stage = new Stage(new Camera());
  skin(stage.object(), standing, { camera: new Camera(), skeleton: h, clip: idle(h), t: 0, poseAt: () => standing });
  assert.deepEqual(calls, ['base', 'helm:0:iron:-', 'crest:0:gold:host', 'pauldron:-1:iron:-']);
  assert.throws(() => outfit({ materials: {}, pieces: [{ part: marker('x'), slot: 'head', on: 'nope' }] })(stage.object(), standing, { camera: new Camera(), skeleton: h, clip: idle(h), t: 0, poseAt: () => standing }), /rests on "nope"/);
  // Outfits as data: validated against a catalog, defaults filled in, materials resolved by name.
  const seen: string[] = [];
  const recorder = (label: string): Part<{ size: number }> => (ctx, o) => {
    seen.push(`${label}:${o.size}:${ctx.materials.metal.ramp.base}`);
    return { depth: () => 0, draw: () => {} };
  };
  const catalog: GearCatalog = {
    parts: [
      { id: 'helm', label: 'Helm', group: 'head', part: recorder('helm'), slots: ['head'], roles: ['metal'], options: [{ key: 'size', label: 'Size', type: 'number', default: 1, min: 0.5, max: 2 }] },
      { id: 'crest', label: 'Crest', group: 'head', part: recorder('crest'), slots: ['head'], roles: ['metal'], requires: 'helm' },
    ],
    bases: [{ id: 'bones', label: 'Bones', skin: () => seen.push('bones'), roles: ['bone'] }],
    materials: { iron: style('iron'), gold: style('gold') },
  };
  const data = { base: 'bones', materials: { metal: 'iron' }, pieces: [{ part: 'helm', slot: 'head' as const, id: 'h' }, { part: 'crest', slot: 'head' as const, on: 'h', options: { size: 1.5 }, materials: { metal: 'gold' } }] };
  assert.deepEqual(validateOutfit(data, catalog), []);
  outfitFromData(data, catalog)(stage.object(), standing, { camera: new Camera(), skeleton: h, clip: idle(h), t: 0, poseAt: () => standing });
  assert.deepEqual(seen, ['bones', 'helm:1:iron', 'crest:1.5:gold'], 'defaults filled in, per-piece materials override');
  const bad = validateOutfit({ base: 'flesh', materials: { metal: 'bronze' }, pieces: [{ part: 'helm', slot: 'shoulder', options: { size: 9 } }, { part: 'crest', slot: 'head' }, { part: 'axe', slot: 'hand' }] }, catalog);
  for (const needle of ['unknown base', 'unknown material "bronze"', 'does not fit slot "shoulder"', 'option "size"', 'must rest on a "helm"', 'unknown part']) assert.ok(bad.some(b => b.includes(needle)), `validation reports: ${needle}`);
  assert.throws(() => outfitFromData({ materials: {}, pieces: [{ part: 'axe', slot: 'hand' }] }, catalog), /unknown part/);
  // A gear asset: the part alone on the character's pose and cell, with what it rests on.
  const wearer = { id: 'tester', label: 'Tester', skeleton: h, clips: { idle: idle(h) }, camera: new Camera(), width: 96, height: 128, pivot: { x: 48, y: 110 }, outfit: data };
  const crestAsset = defineGearAsset({ catalog, character: wearer, part: 'crest' });
  assert.deepEqual(crestAsset.data, { role: 'gear', part: 'crest', label: 'Crest', group: 'head', kind: 'gear', slot: 'head', side: 1, character: 'tester' });
  assert.equal(crestAsset.width, 96);
  assert.deepEqual(crestAsset.pivot, { x: 48, y: 110 });
  assert.throws(() => defineGearAsset({ catalog, character: wearer, part: 'axe' }), /unknown part "axe"/);
  // Items: a catalog of gear parts and pieces of their own, rarities, and the icon's atlas.
  const items: ItemCatalog = {
    items: [
      { id: 'iron-helm', label: 'Iron helm', kind: 'armor', rarity: 'common', gear: { part: catalog.parts[0].id } },
      { id: 'soul-potion', label: 'Soul potion', kind: 'consumable', rarity: 'rare', stack: 10, piece: () => {} },
    ],
    rarities: { common: { label: 'Common', color: '#aaa' }, rare: { label: 'Rare', color: '#3cf' } },
    icon: { size: 48 },
    camera: new Camera(),
    materials: {},
    defaultMaterials: {},
    gear: { catalog, characters: [wearer] },
  };
  assert.deepEqual(validateItems(items), []);
  const badItems = validateItems({ ...items, items: [...items.items, { id: 'Bad Item', label: 'x', kind: 'key', rarity: 'mythic' }, { id: 'axe', label: 'Axe', kind: 'weapon', rarity: 'common', gear: { part: 'axe' } }] });
  for (const needle of ['lowercase', 'unknown rarity "mythic"', 'a gear part, a piece of its own, or both', 'unknown gear part "axe"']) assert.ok(badItems.some(p => p.includes(needle)), `item problems reported: ${needle}`);
  assert.ok(validateItems({ ...items, items: [{ id: 'tipped-helm', label: 'Helm', kind: 'armor', rarity: 'common', gear: { part: 'helm' }, pose: { tip: 30 } }] }).some(p => p.includes('use spin')), 'a gear item cannot tip');
  assert.deepEqual(validateItems({ ...items, items: [{ id: 'loot-helm', label: 'Helm', kind: 'armor', rarity: 'common', gear: { part: 'helm' }, piece: () => {} }] }), [], 'a piece may draw the icon of a gear part');
  assert.deepEqual(validateItems({ ...items, items: [{ id: 'crest', label: 'Crest', kind: 'armor', rarity: 'common', gear: { part: 'crest' } }] }), [], 'an add-on is drawn on the character that wears it');
  const bareWearer = { ...wearer, id: 'bare', outfit: { materials: {}, pieces: [] } };
  assert.ok(validateItems({ ...items, gear: { catalog, characters: [bareWearer] }, items: [{ id: 'crest', label: 'Crest', kind: 'armor', rarity: 'common', gear: { part: 'crest' } }] }).some(p => p.includes('"bare" does not wear it')), 'an add-on needs a wearer');
  const icon = defineItemIcon({ items, item: 'soul-potion' });
  assert.equal(icon.width, 48);
  assert.deepEqual((icon.data as any).item, { id: 'soul-potion', label: 'Soul potion', kind: 'consumable', rarity: 'rare', rarityLabel: 'Rare', rarityColor: '#3cf', stack: 10 });
  assert.throws(() => defineItemIcon({ items, item: 'nope' }), /unknown item "nope"/);
  // Slots a skeleton has: a humanoid has arms, a quadruped none.
  const humanSlots = slotsOf(h).map(s => `${s.slot}:${s.side}`);
  for (const k of ['head:0', 'pelvis:0', 'shoulder:-1', 'shoulder:1', 'hand:1', 'shin:-1', 'foot:1']) assert.ok(humanSlots.includes(k), `humanoid has ${k}`);
  const beastSlots = slotsOf(q);
  assert.ok(!beastSlots.some(s => s.slot === 'hand' || s.slot === 'shoulder'), 'a quadruped has no arm slots');
  assert.ok(beastSlots.some(s => s.slot === 'thigh' && s.side === -1) && beastSlots.some(s => s.slot === 'thigh' && s.side === 1), 'a quadruped has legs on both sides');
  const beastPose = solvePose(q, frame, idle(q).drive(0));
  for (const [skeleton, pose, slots] of [[h, standing, slotsOf(h)], [q, beastPose, beastSlots]] as const) {
    for (const s of slots) {
      const at = slotFrame(pose, skeleton, s.slot, s.side === 0 ? 1 : s.side);
      assert.equal(at.side, s.side, `slotFrame gives the listed side (${skeleton.name} ${s.slot})`);
      assert.ok([at.frame.origin, at.frame.forward, at.frame.up].every(v => Number.isFinite(v.x + v.y + v.z)), `slotFrame works for every listed slot (${skeleton.name} ${s.slot})`);
    }
  }
  assert.throws(() => slotFrame(beastPose, q, 'hand', 1), /no right arm/, 'a slot that is not listed throws');
  // Editing outfits: kinds, equipment slots, swaps that keep hosts and add-ons consistent.
  const noop: Part = () => ({ depth: () => 0, draw: () => {} });
  const size = (d: number, min = 0.5, max = 2) => [{ key: 'size', label: 'Size', type: 'number' as const, default: d, min, max }];
  const kit: GearCatalog = {
    parts: [
      { id: 'skull', label: 'Skull', group: 'bodies', part: noop, slots: ['head'], roles: ['bone'] },
      { id: 'helm', label: 'Helm', group: 'head', part: noop, slots: ['head'], roles: ['metal'], requires: 'skull', equip: 'helm', options: size(1) },
      { id: 'crown', label: 'Crown', group: 'head', part: noop, slots: ['head'], roles: ['glow'], requires: 'skull', equip: 'helm', options: size(1.2, 0.8, 1.5) },
      { id: 'crest', label: 'Crest', group: 'head', part: noop, slots: ['head'], roles: ['metal', 'plume'], requires: 'helm' },
      { id: 'tunic', label: 'Tunic', group: 'torso', part: noop, slots: ['pelvis'], roles: ['cloth'] },
      { id: 'tabard', label: 'Tabard', group: 'torso', part: noop, slots: ['pelvis'], roles: ['cloth'] },
      { id: 'belt', label: 'Belt', group: 'garments', part: noop, slots: ['pelvis'], roles: ['leather'] },
      { id: 'sword', label: 'Sword', group: 'weapons', part: noop, slots: ['hand'], roles: ['metal'], equip: 'weapon' },
      { id: 'axe', label: 'Axe', group: 'weapons', part: noop, slots: ['hand'], roles: ['metal', 'wood'], equip: 'weapon' },
      { id: 'smear', label: 'Smear', group: 'effects', part: noop, slots: ['hand'], roles: ['glow'], requires: ['sword', 'axe'] },
    ],
    bases: [],
    materials: { iron: style('iron'), gold: style('gold') },
  };
  assert.equal(partKind(kit.parts[0]), 'body');
  assert.equal(partKind(kit.parts[9]), 'effect');
  assert.equal(partKind({ ...kit.parts[0], kind: 'gear' }), 'gear', 'an explicit kind wins over the group');
  const dressed = {
    materials: { metal: 'iron' },
    pieces: [
      { part: 'skull', slot: 'head' as const, id: 'skull' },
      { part: 'helm', slot: 'head' as const, id: 'helm', on: 'skull', options: { size: 1.9 }, materials: { metal: 'gold' } },
      { part: 'crest', slot: 'head' as const, on: 'helm' },
      { part: 'tunic', slot: 'pelvis' as const, id: 'tunic' },
      { part: 'belt', slot: 'pelvis' as const, on: 'tunic' },
      { part: 'sword', slot: 'hand' as const, side: 1 as const, id: 'blade' },
      { part: 'smear', slot: 'hand' as const, side: 1 as const, on: 'blade' },
    ],
  };
  assert.deepEqual(validateOutfit(dressed, kit), []);
  assert.deepEqual(swapCandidates(kit, dressed, 1), ['crown'], 'a helm swaps for what takes its equipment slot');
  assert.deepEqual(swapCandidates(kit, dressed, 3), ['tabard'], 'a layer swaps within its group and hosts');
  assert.deepEqual(swapCandidates(kit, dressed, 0), [], 'the body has nothing to swap with');
  const crowned = swapPiece(dressed, kit, 1, 'crown');
  assert.deepEqual(crowned.outfit.pieces[1], { part: 'crown', slot: 'head', options: { size: 1.5 }, id: 'helm', on: 'skull' }, 'in place, the id and host kept, the option clamped, materials only for roles it reads');
  assert.deepEqual(crowned.removed, [2], 'the crest needs a helm: it goes');
  assert.ok(crowned.notes.some(n => n.includes('"crest"')));
  assert.deepEqual(validateOutfit(crowned.outfit, kit), []);
  const tabarded = swapPiece(dressed, kit, 3, 'tabard');
  assert.equal(tabarded.outfit.pieces[4].on, 'tunic', 'the belt rests on the tabard now (the id is kept)');
  assert.deepEqual(tabarded.removed, []);
  const axed = equipPart(dressed, kit, 'axe', { side: 1 });
  assert.equal(axed.outfit.pieces[5].part, 'axe', 'equipping replaces what holds the equipment slot on that side');
  assert.equal(axed.outfit.pieces[6].part, 'smear', 'the smear accepts an axe too');
  const leftAxe = equipPart(dressed, kit, 'axe', { side: -1 });
  assert.equal(leftAxe.outfit.pieces.length, 8, 'the other hand is free: added at the end');
  assert.equal(equipPart(dressed, kit, 'sword', { side: 1 }).outfit, dressed, 'equipping what is already there changes nothing');
  const gloved = { materials: {}, pieces: [{ part: 'glove', slot: 'hand' as const, side: 1 as const, id: 'g' }] };
  const gloveKit: GearCatalog = { ...kit, parts: [...kit.parts, { id: 'glove', label: 'Glove', group: 'arms', part: noop, slots: ['hand', 'forearm'], roles: ['leather'], equip: 'gloves' }, { id: 'gauntlet', label: 'Gauntlet', group: 'arms', part: noop, slots: ['hand', 'forearm'], roles: ['metal'], equip: 'gloves' }] };
  assert.equal(equipPart(gloved, gloveKit, 'gauntlet', { side: 1 }).outfit.pieces[0].slot, 'hand', 'without a slot, the new part takes the old one\'s');
  assert.deepEqual(equipPart(gloved, gloveKit, 'gauntlet', { slot: 'forearm', side: 1 }).outfit.pieces, [{ part: 'gauntlet', slot: 'forearm', side: 1, id: 'g' }], 'a slot given is where it goes');
  assert.equal(equipPart(gloved, gloveKit, 'glove', { slot: 'forearm', side: 1 }).outfit.pieces[0].slot, 'forearm', 'the same part moves to the slot given');
  const crestAgain = equipPart(crowned.outfit, kit, 'helm');
  assert.equal(crestAgain.outfit.pieces[1].part, 'helm');
  const withCrest = equipPart(crestAgain.outfit, kit, 'crest');
  assert.equal(withCrest.outfit.pieces.at(-1)!.on, 'helm', 'an add-on is put on its host');
  assert.throws(() => equipPart({ materials: {}, pieces: [] }, kit, 'crest'), /must rest on a "helm"/);
  const bare = removePiece(dressed, kit, 0);
  assert.deepEqual(bare.removed, [0, 1, 2], 'taking out the skull takes the helm and its crest');
  const untucked = removePiece(dressed, kit, 3);
  assert.equal(untucked.outfit.pieces.find(p => p.part === 'belt')!.on, undefined, 'the belt stays, resting on nothing');
  const wrongHost = validateOutfit({ materials: {}, pieces: [{ part: 'tunic', slot: 'pelvis', id: 't' }, { part: 'crest', slot: 'head', on: 't' }] }, kit);
  assert.ok(wrongHost.some(p => p.includes('needs a "helm" one')), 'a host of the wrong part is reported');
  const twoWeapons = validateOutfit({ materials: {}, pieces: [{ part: 'sword', slot: 'hand', side: 1 }, { part: 'axe', slot: 'hand', side: 1 }, { part: 'axe', slot: 'hand', side: -1 }] }, kit);
  assert.equal(twoWeapons.filter(p => p.includes('equipment slot "weapon"')).length, 1, 'two parts in one equipment slot on one side');
  const twoIds = validateOutfit({ materials: {}, pieces: [{ part: 'tunic', slot: 'pelvis', id: 't' }, { part: 'belt', slot: 'pelvis', id: 't' }] }, kit);
  assert.ok(twoIds.some(p => p.includes('id "t" is used by an earlier piece')), 'two pieces with one id');
  // A swap that needs a host re-hosts the piece and says so; it never changes the outfit it was given.
  const hooded = { materials: {}, pieces: [{ part: 'skull', slot: 'head' as const }, { part: 'tabard', slot: 'pelvis' as const }] };
  const frozen = JSON.stringify(hooded);
  const helmed = swapPiece(hooded, kit, 1, 'helm', { slot: 'head' });
  assert.deepEqual(helmed.outfit.pieces, [{ part: 'skull', slot: 'head', id: 'skull' }, { part: 'helm', slot: 'head', on: 'skull' }], 'the host gets an id');
  assert.ok(helmed.notes.some(n => n.includes('now rests on "skull"')));
  assert.equal(JSON.stringify(hooded), frozen, 'the input outfit is unchanged');
  // A hidden piece is placed for the pieces resting on it, but draws nothing.
  const drawnBy: string[] = [];
  const shown = (label: string): Part => ctx => {
    const v = new Tube([vec3(0, 0, 10), vec3(0, 0, 20)], 2);
    ctx.object.add(v, { ramp: { lit: '#fff', base: '#888', dark: '#000' } } as VolumeStyle, ctx.host ? { on: ctx.host } : {});
    drawnBy.push(`${label}:${ctx.host ? 'host' : '-'}`);
    return v;
  };
  const hiddenStage = new Stage(new Camera());
  const hiddenObject = hiddenStage.object();
  outfit({ materials: {}, pieces: [{ part: shown('skull'), slot: 'head', id: 's', hidden: true }, { part: shown('helm'), slot: 'head', on: 's' }] })(hiddenObject, standing, { camera: new Camera(), skeleton: h, clip: idle(h), t: 0, poseAt: () => standing });
  assert.deepEqual(drawnBy, ['skull:-', 'helm:host'], 'the hidden host is still handed over');
  assert.equal((hiddenObject as any).entries.length, 1, 'only the helm draws');
  // Holding: one held part per hand, two-handed parts empty the other hand, clips made for a class.
  const length = [{ key: 'length', label: 'Length', type: 'number' as const, default: 20, min: 10, max: 40 }];
  const arms: GearCatalog = {
    parts: [
      { id: 'sword', label: 'Sword', group: 'weapons', part: noop, slots: ['hand'], roles: ['metal'], equip: 'weapon', options: length, wield: { class: 'blade', sockets: { tip: (_pose, _sk, piece) => vec3(piece.side * 10, 0, piece.options.length as number) } } },
      { id: 'dagger', label: 'Dagger', group: 'weapons', part: noop, slots: ['hand'], roles: ['metal'], equip: 'weapon', wield: { class: 'blade' } },
      { id: 'scythe', label: 'Scythe', group: 'weapons', part: noop, slots: ['hand'], roles: ['wood'], equip: 'weapon', wield: { class: 'polearm', hands: 2 } },
      { id: 'shield', label: 'Shield', group: 'shields', part: noop, slots: ['forearm'], roles: ['wood'], equip: 'shield', wield: { class: 'shield', offHand: 'hold' } },
      { id: 'belt', label: 'Belt', group: 'garments', part: noop, slots: ['pelvis'], roles: ['leather'], equip: 'belt' },
      { id: 'sash', label: 'Sash', group: 'garments', part: noop, slots: ['pelvis'], roles: ['cloth'] },
      { id: 'charm', label: 'Charm', group: 'garments', part: noop, slots: ['pelvis'], roles: ['bone'], requires: 'belt' },
    ],
    bases: [],
    materials: {},
  };
  const knight = { materials: {}, pieces: [{ part: 'sword', slot: 'hand' as const, side: 1 as const, options: { length: 30 } }, { part: 'shield', slot: 'forearm' as const, side: -1 as const }] };
  assert.deepEqual(validateOutfit(knight, arms), []);
  assert.ok(validateOutfit({ materials: {}, pieces: [{ part: 'scythe', slot: 'hand', side: 1 }, { part: 'shield', slot: 'forearm', side: -1 }] }, arms).some(p => p.includes('takes both hands')));
  assert.ok(validateOutfit({ materials: {}, pieces: [{ part: 'shield', slot: 'forearm', side: 1 }, { part: 'sword', slot: 'hand', side: 1 }] }, arms).some(p => p.includes('right hand already holds')));
  const reaper = equipPart(knight, arms, 'scythe');
  assert.deepEqual(reaper.outfit.pieces.map(p => p.part), ['scythe'], 'a two-handed weapon replaces the sword and pushes the shield out');
  assert.deepEqual([reaper.removed, reaper.index], [[1], 0]);
  assert.ok(reaper.notes.some(n => n.includes('takes both hands')));
  const guarded = equipPart(reaper.outfit, arms, 'shield', { side: -1 });
  assert.deepEqual(guarded.outfit.pieces.map(p => p.part), ['shield'], 'a shield beside a two-handed weapon takes the weapon out');
  const dual = equipPart(knight, arms, 'dagger', { side: -1 });
  assert.deepEqual(dual.outfit.pieces.map(p => `${p.part}:${p.side}`), ['sword:1', 'dagger:-1'], 'a dagger in the left hand replaces the shield there');
  assert.deepEqual(validateOutfit(dual.outfit, arms), []);
  assert.throws(() => swapPiece(knight, arms, 0, 'scythe'), /share the hands/, 'swapPiece leaves the hands to equipPart');
  const belted = { materials: {}, pieces: [{ part: 'sash', slot: 'pelvis' as const }, { part: 'belt', slot: 'pelvis' as const, id: 'b' }] };
  assert.throws(() => swapPiece(belted, arms, 0, 'belt'), /equipment slot "belt"/, 'swapPiece will not make two belts');
  assert.deepEqual(swapBlocker(arms, belted, 0, 'belt'), { index: 1, part: 'belt', reason: 'equip' }, 'swapBlocker says who holds the slot');
  assert.deepEqual(swapBlocker(arms, knight, 0, 'scythe'), { index: 1, part: 'shield', reason: 'hands' });
  assert.equal(swapBlocker(arms, knight, 0, 'dagger'), undefined);
  const charmed = swapPiece(belted, arms, 0, 'charm');
  assert.deepEqual(charmed.outfit.pieces.map(p => `${p.part}${p.on ? `@${p.on}` : ''}`), ['belt', 'charm@b'], 'an add-on whose host comes later moves after it');
  assert.equal(charmed.index, 1);
  assert.deepEqual(validateOutfit(charmed.outfit, arms), []);
  // Clips made for what the character holds.
  const moves = { idle: idle(h), slash: { clip: slash(h), wields: { main: ['blade'] } }, reap: { clip: slash(h), wields: { main: ['polearm'] } }, combo: { clip: slash(h), wields: { main: ['blade'], off: ['blade'] } } };
  const kn = checkWield(moves, knight, arms);
  assert.deepEqual([kn.usable, kn.unusable.map(u => u.key)], [['idle', 'slash'], ['reap', 'combo']]);
  assert.equal(kn.warnings.filter(w => w.includes('off hand holds')).length, 0, 'a shield may simply be held');
  const rp = checkWield(moves, reaper.outfit, arms);
  assert.deepEqual(rp.usable, ['idle', 'reap']);
  assert.ok(rp.warnings.some(w => w.includes('clip "slash" is made for a blade')));
  assert.deepEqual(checkWield(moves, dual.outfit, arms).unusable.map(u => u.key), ['reap']);
  const { combo: _combo, ...single } = moves;
  assert.ok(checkWield(single, dual.outfit, arms).warnings.some(w => w.includes('no clip swings')), 'a second blade no clip swings is reported');
  assert.ok(checkWield({ idle: idle(h), reap: moves.reap }, knight, arms).warnings.some(w => w.includes('no clip is made for a blade')));
  assert.deepEqual(wieldOf(knight, arms).off?.part, 'shield');
  // The held item's sockets follow it: a longer blade moves the tip; in the left hand it is off-tip.
  const tip = weaponSockets(knight, arms, h).tip(standing);
  assert.deepEqual([tip.x, tip.z], [10, 30]);
  assert.ok('off-tip' in weaponSockets({ materials: {}, pieces: [{ part: 'sword', slot: 'hand', side: -1 }] }, arms, h));
  const armed = defineCharacter({ name: 'knight', skeleton: h, camera: new Camera(), width: 8, height: 8, pivot: { x: 4, y: 8 }, frames: 4, clips: moves, outfit: { data: knight, catalog: arms } });
  assert.deepEqual(armed.manifest.wield, { main: { part: 'sword', class: 'blade', hands: 1 }, off: { part: 'shield', class: 'shield', hands: 1 } });
  assert.ok(armed.manifest.sockets.includes('tip'), 'the held blade gives the character its tip');
  assert.equal(armed.manifest.clips.find(c => c.key === 'reap')!.usable, false);
  assert.ok(!Object.values(armed.manifest.controls.actions).flat().includes('reap'), 'unusable clips are left out of the controls');
  assert.ok(armed.manifest.warnings.some(w => w.includes('clip "reap"')));
  console.log('✔ Gear: body frames, slots, held items and outfits passed.');
}

console.log('\n✨ @core/rig tests passed.\n');
