# Gaits and clips (`@core/rig`)

**Purpose.** Make a skeleton move: locomotion from gait numbers, idles, and actions such as attacks, hits and emotes built from a drive function. The judgment behind timing lives in the diorama-review [motion reference](../../../.agents/skills/diorama-review/references/motion.md); this guide maps those rules to the API.

**API reference:** [`docs/api/rig.md`](../../api/rig.md).

---

## 1. A clip is a function of normalized time

`Clip.drive(t)` returns a `Drive` for t in 0..1: root offset, trunk joint offsets, pitch, twist, roll, foot targets, arm swings or hand targets, tail sway, and named `extra` channels for the skin. Foot targets are absolute positions in the creature's frame: start from `restFeet(skeleton)` and add to them. The export samples t = frame ÷ frames, never t = 1, so loops close. A clip also declares:
- `kind`, `tags`, `hold`: what the clip means to a game (`idle`, `walk`, `run`, `attack`, `skill`, `hit`, `death`, `dodge`, `jump`, `emote`, ...), free qualifiers (`melee`, `ranged`, `aoe`), and whether it stays on its last frame (a death). `locomotion` and `idle` set the kind themselves; give it to every `defineClip`;
- `seconds`, which sets the export fps: **fps = frames ÷ seconds** (there is no fps option). Targets come from the motion reference:
  - hand-timed clips (idles, emotes, hits): 8–12 fps;
  - locomotion: frames × cadence, usually 12–20 fps (the humanoid walk is 12.4 fps and its run 16.4 at 8 frames);
  - fast strikes: up to 24–30 fps (`slash` is 0.42 s, `bite` 0.5 s).
  `idle()` lasts 2 s by default, which is only 4 fps at 8 frames: pass `idle(skeleton, { seconds: 1.6 })` with 16 frames (10 fps). Choose frames from the target;
- `loop`: **defaults to false** in `defineClip`. Idles and every other cycle must pass `loop: true`, or the clip plays once and its closure is never checked;
- `speed`, the ground speed the game moves the sprite at;
- `events`: named moments, exported at **frame = round(t × frames)**. Standard names (`EVENTS`): `hit` (deal damage), `cast` (a skill commits), `release` (its effect leaves), `cancel` (the action may be interrupted from here), `land`, `step:<leg>` (`stepEvent`), `spawn:<socket>` (`spawnEvent`, something appears at that socket);
- `travel` (optional): root motion of an action that covers ground (§3).

## 2. Locomotion from a gait

`locomotion(skeleton, gaitName)` builds the loop from the skeleton's `GaitSpec`. Feet move in place, and the game moves the sprite at `groundSpeed = stride × cadence ÷ duty`, which is in the atlas JSON. A planted foot then stays on the floor exactly.

| Number | Walk | Run / gallop | Effect |
| :--- | :--- | :--- | :--- |
| `duty` | ~0.6 (biped), ~0.66 (quadruped) | 0.32–0.4 | Share of the cycle a foot is planted; below 0.5 there is a flight phase |
| `stride` | about 0.5–0.8 × hip height | about 0.75–0.9 × hip height | Distance a planted foot travels under the body during its stance (not the step length: a biped's step is stride ÷ (2 × duty)) |
| `cadence` | 1.5–2 | 2–3 | Cycles per second; with stride and duty it sets `groundSpeed` |
| `phases` | biped 0 / 0.5; quadruped lateral sequence 0, 0.25, 0.5, 0.75 | gallop pairs close together (0 / 0.1, 0.48 / 0.58) | When each foot starts its cycle |
| `lift`, `heelKick` | about 0.18 × hip height | about 0.3–0.4 × hip height, heel kick 0.6–1 | Swing height (these values already include the extra the tilted camera needs); running heels lift early |
| `bob`, `lean`, `pitch`, `flex`, `roll` | small; keep the torso upright | larger, in phase with the push | Body motion; a walking lean reads as a hunch from a high camera |
| `armSwing`, `armFlex`, `armAcross`, `tailSway`, `tailLift` | swing 0.3–0.4, flex 0.2 | swing 0.6, flex 1.2, across 0.9 | Arms swing in step with their `swingWith` leg (radians); `armFlex` is the forearm bend. Arms that are held bent (a raptor's small arms, a crab's claws): swing about 0.1 and flex about 1.3 |

Insects use a wave or tripod gait: three legs planted while the other three swing (phases 0 and 0.5 alternating along each side); eight legs use an alternating tetrapod (1L 2R 3L 4R, then the others). Two-legged hoppers put both legs at phase 0.

One gait has one `stride`, `duty` and `cadence` for every leg, because planted feet must all move back at the same ground speed (`stride × cadence ÷ duty`). Longer and shorter legs therefore take the same stride; give long legs a wider `stance` instead.

## 3. Idles and actions

- `idle(skeleton, options)`: breathing, weight shift and tail motion with whole cycles per loop.
- A custom idle (`defineClip({ ..., loop: true })`) may add taps, twitches and glows. Every term must close: sine terms with whole cycles per loop, and `bell` windows that end before t = 1 (a window from 0.9 to 1.02 leaves a jump at the seam).
- `hit(skeleton, { strength, seconds })` and `death(skeleton)` work for any body:
  - `hit`: a snap back in a frame or two, a short freeze on the pose (hit-stop, what sells the impact), then the recovery. It has a `cancel` event, `extra.hurt` (0..1) for the skin, and a knock-back by root motion (negative `travel`). `strength` is 1 by default (0.6 a graze, 2 a heavy blow); `knockback` sets the distance (0 to stay put).
  - `death`: held, with a `land` event and `extra.dead` (0 alive → 1 dead) for dimming eyes and glows.
    - Bipeds topple face down, the legs fold under the hips and the arms settle along the trunk.
    - Bodies with more legs collapse onto the belly: the head slumps to one side, the front legs splay and tails go limp.
  - Wrap a preset to add a character's own channels (a weapon falling, ears folding): `defineClip({ ...base, drive: t => ({ ...base.drive(t), extra: { ...} }) })`.
- `jump(skeleton, { height, distance })`: crouch, `takeoff`, an arc with the legs tucked, `land` with a crouch that absorbs it. With a `distance` the body travels by root motion and the feet land on their new spot.
- `dodge(skeleton, { style: 'dash' | 'backstep', distance })`: a quick low dash forward or a hop back, covered by root motion. The feet stay planted in the world and step one after the other, so nothing slides; a `cancel` event marks the recovery.
- `defineClip({ name, kind, tags, seconds, events, drive })` makes anything else. Attacks need a `hit` event, skills `cast` and/or `release`, a death `hold: true`; `checkClip` reports a missing one.
- **Strong actions** are built on `beat(t, b, rest, apex, extreme, target, creep)`:
  - the rhythm: anticipation to the apex, hold with creep, a strike that overshoots to the extreme, hold, settle on the target, recover;
  - the default `BEAT` = { apex 0.17, strike 0.24, extreme 0.37, hold 0.49, settle 0.64 };
  - `creep` (default 0) is the drift during the holds that keeps them alive.
  Frames sample t = k ÷ frames, so at 10–12 frames the default strike gets only 1–2 frames. For a 3-frame strike, pass a `Beat` with `extreme − strike = 3 ÷ frames`, and put the hit on a frame boundary so the hit frame shows the extreme pose.
- **Presets for actions:** `slash` (humanoid weapon swing) and `bite` (quadruped lunge with `extra.jaw`) are in `@core/rig`. Any other action is a `defineClip` of its own: a skill (a spell, a howl, a spit) with `cast` and `release` events and a `spawn:<socket>` where the effect appears, and the non-combat kinds (`interact`, `emote`, and the like) built the same way with their own event names, which games and the playground accept (custom names are allowed).
- Drive offsets are per joint: a `trunk` offset on the neck does not move the head. Move both, or use `root`, `pitch` and `twist` for whole-body motion.
- Put the hit event at the end of the strike (`BEAT.extreme`). The skin uses it for the smear and the game for damage.
- **Windows:** `bell(u)` is only a bump for u in 0..1 (outside it grows again). Use `bump(t, t0, t1)` for a windowed motion such as a tap, a claw flick or a jump arc, and keep t1 below 1 in loops.
- **Leaps, lunges and dodges that cover ground:**
  - The body stays in its cell; the clip returns to its start pose or ends where the game takes over.
  - The distance goes in `travel: t => distance` (root motion, forward world units). The atlas exports it per frame, and the game moves the sprite along the facing.
  - Keep planted feet still in the world with `stepsAlong(skeleton, travel, distance, windows, lift, t)`: each foot keeps its spot until its step window, then steps to its new spot. `jump` and `dodge` use it; a planted foot that moves with the body slides in the game.
  - For a jump arc, raise `root` z with `bump` over the flight window and lift the feet by the same amount.
  - Mark `takeoff` (a custom event) and `land`.
  - Make the cell fit the highest frame. The `pivotToContentBottom` spread then grows during the flight frames, which is expected.
- Channels the skin needs (weapon angle, jaw opening, ear fold, wing spread) go in `extra`, named in the clip's doc comment.

## 4. Checks the engine runs for you

`checkClip(skeleton, clip)` checks:
- bone drift;
- planted-foot slide (locomotion);
- feet and joints below the floor;
- the end-to-start gap of every clip;
- the action contract: an attack without `hit`, a skill without `cast`/`release`, a death without `hold`, events outside [0, 1). It warns about the gap for loops and moving clips. Every `defineCharacterAsset` export runs it and stores the result in `meta.data.motion`, and `npm run inspect -- <png>` prints `motion: clean · loops (gap 0)` or `· plays once`. It also prints a `hint:` when a standing clip without events ends where it starts but has `loop: false`, which is usually a forgotten `loop: true`. A new skeleton or clip is done only when the motion check is clean.
