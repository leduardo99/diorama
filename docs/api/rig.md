# @core/rig - Skeletons, Gaits, Clips & Character Sheets

> Auto-generated public API reference. Do not edit directly; re-run `npm run docs:api`.

Procedural characters and creatures for `@core/volume`: skeletons as data (humanoids, quadrupeds, invented bodies), gaits with planted feet and an exported ground speed, two-bone IK, clips built on attack beats, and `defineCharacterAsset`, which renders a project skin in every facing with the clip data in the atlas JSON.

## Table of Contents

- [Functions & Operations](#functions--operations)
  - [`defineSkeleton`](#defineskeleton)
  - [`footCycle`](#footcycle)
  - [`groundSpeed`](#groundspeed)
  - [`strideWarp`](#stridewarp)
  - [`twoBone`](#twobone)
  - [`ikReach`](#ikreach)
  - [`solvePose`](#solvepose)
  - [`partFrame`](#partframe)
  - [`locomotion`](#locomotion)
  - [`idle`](#idle)
  - [`defineClip`](#defineclip)
  - [`restFeet`](#restfeet)
  - [`categoryOf`](#categoryof)
  - [`stepEvent`](#stepevent)
  - [`spawnEvent`](#spawnevent)
  - [`EVENTS`](#events)
  - [`LOCOMOTION_KINDS`](#locomotion_kinds)
  - [`humanoid`](#humanoid)
  - [`quadruped`](#quadruped)
  - [`slash`](#slash)
  - [`bite`](#bite)
  - [`hit`](#hit)
  - [`death`](#death)
  - [`jump`](#jump)
  - [`dodge`](#dodge)
  - [`stepsAlong`](#stepsalong)
  - [`track`](#track)
  - [`beat`](#beat)
  - [`bell`](#bell)
  - [`bump`](#bump)
  - [`BEAT`](#beat)
  - [`linear`](#linear)
  - [`smooth`](#smooth)
  - [`easeOutCubic`](#easeoutcubic)
  - [`easeInCubic`](#easeincubic)
  - [`easeOutQuad`](#easeoutquad)
  - [`checkClip`](#checkclip)
  - [`defineCharacter`](#definecharacter)
  - [`defineCharacterAsset`](#definecharacterasset)
  - [`drawCharacterFrame`](#drawcharacterframe)
  - [`mannequinSkin`](#mannequinskin)
  - [`ringsAlong`](#ringsalong)
  - [`along`](#along)
  - [`bodyFrames`](#bodyframes)
  - [`chestJoint`](#chestjoint)
  - [`slotFrame`](#slotframe)
  - [`slotsOf`](#slotsof)
  - [`isPairedSlot`](#ispairedslot)
  - [`isHandSlot`](#ishandslot)
  - [`weaponChannel`](#weaponchannel)
  - [`partKind`](#partkind)
  - [`partRequires`](#partrequires)
  - [`held`](#held)
  - [`outfit`](#outfit)
  - [`outfitFromData`](#outfitfromdata)
  - [`validateOutfit`](#validateoutfit)
  - [`wieldOf`](#wieldof)
  - [`wieldsOf`](#wieldsof)
  - [`checkWield`](#checkwield)
  - [`weaponSockets`](#weaponsockets)
  - [`swapCandidates`](#swapcandidates)
  - [`swapBlocker`](#swapblocker)
  - [`swapPiece`](#swappiece)
  - [`equipPart`](#equippart)
  - [`removePiece`](#removepiece)
  - [`defineGearAsset`](#definegearasset)
  - [`defineItemIcon`](#defineitemicon)
  - [`validateItems`](#validateitems)
  - [`itemRng`](#itemrng)
- [Types & Interfaces](#types--interfaces)
  - [`SkeletonSpec`](#skeletonspec)
  - [`TrunkJoint`](#trunkjoint)
  - [`LegSpec`](#legspec)
  - [`ArmSpec`](#armspec)
  - [`TailSpec`](#tailspec)
  - [`Local`](#local)
  - [`GaitSpec`](#gaitspec)
  - [`Drive`](#drive)
  - [`ArmDrive`](#armdrive)
  - [`TailDrive`](#taildrive)
  - [`Pose`](#pose)
  - [`ActionKind`](#actionkind)
  - [`Clip`](#clip)
  - [`ClipEvent`](#clipevent)
  - [`IdleOptions`](#idleoptions)
  - [`HitOptions`](#hitoptions)
  - [`JumpOptions`](#jumpoptions)
  - [`DodgeOptions`](#dodgeoptions)
  - [`Ease`](#ease)
  - [`Key`](#key)
  - [`Beat`](#beat)
  - [`ClipCheck`](#clipcheck)
  - [`Character`](#character)
  - [`CharacterOptions`](#characteroptions)
  - [`ClipKey`](#clipkey)
  - [`CharacterClip`](#characterclip)
  - [`ClipWields`](#clipwields)
  - [`CharacterManifest`](#charactermanifest)
  - [`EffectCue`](#effectcue)
  - [`ManifestClip`](#manifestclip)
  - [`SocketFn`](#socketfn)
  - [`SocketTable`](#sockettable)
  - [`Skin`](#skin)
  - [`SkinKit`](#skinkit)
  - [`CharacterAssetOptions`](#characterassetoptions)
  - [`CharacterView`](#characterview)
  - [`GearCatalog`](#gearcatalog)
  - [`PartInfo`](#partinfo)
  - [`PartKind`](#partkind)
  - [`WieldInfo`](#wieldinfo)
  - [`WieldSocket`](#wieldsocket)
  - [`PartOption`](#partoption)
  - [`BaseInfo`](#baseinfo)
  - [`OutfitData`](#outfitdata)
  - [`OutfitCharacterInfo`](#outfitcharacterinfo)
  - [`BodyFrames`](#bodyframes)
  - [`Slot`](#slot)
  - [`SlotFrame`](#slotframe)
  - [`HeldOptions`](#heldoptions)
  - [`Held`](#held)
  - [`MaterialSet`](#materialset)
  - [`Part`](#part)
  - [`PartContext`](#partcontext)
  - [`OutfitPiece`](#outfitpiece)
  - [`OutfitSpec`](#outfitspec)
  - [`Wielded`](#wielded)
  - [`WieldCheck`](#wieldcheck)
  - [`OutfitEdit`](#outfitedit)
  - [`SwapBlocker`](#swapblocker)
  - [`GearAssetOptions`](#gearassetoptions)
  - [`ItemIconData`](#itemicondata)
  - [`ItemInfo`](#iteminfo)
  - [`ItemCatalog`](#itemcatalog)
  - [`ItemPiece`](#itempiece)
  - [`ItemContext`](#itemcontext)
  - [`Rarity`](#rarity)
  - [`IconBox`](#iconbox)
  - [`ItemIconOptions`](#itemiconoptions)

---

## Functions & Operations

### `defineSkeleton`

Validates a skeleton spec: unique names, limbs hanging from existing trunk joints, knees that
are 'forward', 'back' or a finite non-zero direction, gaits that give every leg a phase.
Returns the same spec, so it can wrap a literal.

```ts
function defineSkeleton(spec: SkeletonSpec): SkeletonSpec
```

---

### `footCycle`

Foot offset in the creature's frame at leg phase `p` (0..1): `forward` along the stride and
`up` above the ground. Stance runs from +stride/2 (touchdown) to −stride/2 (lift-off) at a
constant speed; the swing returns with a smooth start and stop and a bell-shaped lift.

```ts
function footCycle(g: GaitSpec, p: number): { forward: number; up: number; planted: boolean; }
```

---

### `groundSpeed`

Ground speed of a gait in world units per second: stride × cadence ÷ duty.

```ts
function groundSpeed(g: GaitSpec): number
```

---

### `strideWarp`

Warps a leg phase so that its quarter points fall on the stride extremes: 0 at touchdown
(foot forward), 0.5 at lift-off (foot back). Arms swing on this warped phase.

```ts
function strideWarp(g: GaitSpec, p: number): number
```

---

### `twoBone`

Solves a two-bone limb from `root` towards `target`. The middle joint bends towards `hint`
(a direction). Returns the middle joint and the end point actually reached.

```ts
function twoBone(root: Vec3, target: Vec3, l1: number, l2: number, hint: Vec3, softReach?: boolean): { mid: Vec3; end: Vec3; }
```

---

### `ikReach`

Longest root→target distance reached exactly, before the soft band starts.

```ts
function ikReach(l1: number, l2: number): number
```

---

### `solvePose`

Solves a pose for `skeleton` facing `frame` from a clip's drive.

```ts
function solvePose(skeleton: SkeletonSpec, frame: Frame3, drive?: Drive): Pose
```

---

### `partFrame`

A frame for a body part: origin, the direction it points (`forward`) and an up hint.
Use it to build heads, snouts, blades and other parts that follow a joint's direction.

```ts
function partFrame(origin: Vec3, forward: Vec3, upHint?: Vec3): Frame3
```

---

### `locomotion`

Locomotion loop for one of the skeleton's gaits: feet follow the gait's phases in place,
the trunk bobs, leans, pitches and flexes as the gait says, arms swing with their paired
legs, tails sway. `speed` is the ground speed the game must move the sprite at.

```ts
function locomotion(skeleton: SkeletonSpec, gaitName: string): Clip
```

---

### `idle`

Idle loop: breathing (the front of the trunk rises and falls once per loop), a small weight
shift, arms hanging with a slight swing, tails swaying slowly. The head lags the chest a little.

```ts
function idle(skeleton: SkeletonSpec, options?: IdleOptions): Clip
```

---

### `defineClip`

Builds a custom clip (attacks, skills, hits, emotes, idles) from a drive function.

IMPORTANT: `loop` defaults to false: the clip plays once unless `loop: true`. Idles and any
other cycle must pass `loop: true`, so the export checks that the loop closes (`checkClip`
reports `loopGap` for every clip, but only warns about it for loops and moving clips) and the
game repeats it. `speed` defaults to 0 (in place); set it for locomotion.

Declare `kind` (see `ActionKind`): without it, a moving clip is a walk, a loop an idle and
anything else a generic `action`, which a game cannot bind to a control. Attacks need a `hit`
event and skills a `cast` or `release` event (`checkClip` warns otherwise); a death needs
`hold: true` (the default for kind 'death').

```ts
function defineClip(clip: Omit<Clip, "events" | "speed" | "loop" | "kind" | "tags" | "hold" | "travel"> & Partial<Pick<Clip, "events" | "speed" | "loop" | "kind" | "tags" | "hold" | "travel">>): Clip
```

---

### `restFeet`

Where each leg stands at rest, in the creature's frame.

```ts
function restFeet(skeleton: SkeletonSpec): Record<string, Local>
```

---

### `categoryOf`

Coarse category of a kind: what the sprite does while the clip plays.

```ts
function categoryOf(kind: ActionKind): "idle" | "action" | "locomotion"
```

---

### `stepEvent`

Event name for a foot touching down.

```ts
function stepEvent(leg: string): string
```

---

### `spawnEvent`

Event name for something appearing at a socket (a projectile leaving a hand).

```ts
function spawnEvent(socket: string): string
```

---

### `EVENTS`

Standard event names, understood by games and the playground (custom names are allowed too):
- `hit`: the frame an attack deals damage (one per strike);
- `cast`: a skill commits (its wind-up is over, it can no longer be cancelled);
- `release`: a skill's effect leaves (a projectile, a wave);
- `cancel`: from this frame on, the action may be interrupted by another one;
- `land`: a body or a jump touches the ground;
- `step:<leg>`: a foot touches down (locomotion adds these);
- `spawn:<socket>`: something appears at that socket on this frame (see `defineCharacter`).

```ts
const EVENTS: { readonly hit: "hit"; readonly cast: "cast"; readonly release: "release"; readonly cancel: "cancel"; readonly land: "land"; }
```

---

### `LOCOMOTION_KINDS`

Kinds that move the sprite (loops at the clip's ground speed).

```ts
const LOCOMOTION_KINDS: readonly ActionKind[]
```

---

### `humanoid`

Biped, about 80 units tall at `scale` 1. Hip height sits just under the leg's reach, so knees
are nearly straight at rest but never lock. Gaits: walk (duty 0.6) and run (duty 0.35, flight).

```ts
function humanoid(scale?: number): SkeletonSpec
```

---

### `quadruped`

Four-legged digitigrade body (a wolf or a dog), about 37 units tall at the head and 60 long at
`scale` 1. Hind legs bend forward at the stifle and have a hock segment; front legs bend
back at the elbow and stand on a pastern. Gaits: walk (lateral sequence, a quarter apart)
and run (transverse gallop with spine flex and a flight phase).

```ts
function quadruped(scale?: number): SkeletonSpec
```

---

### `slash`

One-handed slash for a humanoid holding a weapon in `armR`: wind up behind the right shoulder,
hold, cut across to the left past the target, hold, settle, recover. The weapon's direction
goes to the skin as `extra.weaponYaw` and `extra.weaponPitch` (radians, in the creature's
frame); the hit event sits at the end of the strike.

```ts
function slash(skeleton: SkeletonSpec, b?: Beat, seconds?: number): Clip
```

---

### `bite`

Lunging bite for a quadruped: gather back with the head low, hold, spring forward past the
target with the jaw open and the front feet stepping in, snap shut during the hold, settle,
recover. The skin reads `extra.jaw` (0 closed, 1 open) and `extra.ears` (1 = flattened).

```ts
function bite(skeleton: SkeletonSpec, b?: Beat, seconds?: number): Clip
```

---

### `hit`

Reaction to a blow, for any skeleton: the body snaps back from the hit in a frame or two (the top
of the trunk most, like a whiplash), freezes on that pose for a beat (hit-stop: what sells the
impact), then recovers. The front lifts, arms fling back, tails rise, and the blow pushes the
character back (root motion, `knockback`). Feet stay planted relative to the body: a push
slides them, as it should. `cancel` marks when another action may cut it short; the skin reads
`extra.hurt` (0..1) to flash eyes or flinch the face.

```ts
function hit(skeleton: SkeletonSpec, options?: number | HitOptions): Clip
```

---

### `death`

Death for any skeleton, held on its last frame, with `land` when the body hits the floor and
`extra.dead` (0 alive → 1 dead) for the skin to dim eyes or glows.
- Bipeds: the knees buckle, the arms fling up, the body topples forward and lands flat, face
  down; the legs fold under the hips and the arms settle along the trunk, so nothing stands up
  from the lying body.
- More legs: the body collapses onto its belly with a slump and a twist, the head drops to the
  floor and lolls to one side, tails go limp to the side; front legs slide forward and every
  foot a little out, so the legs splay.
A lying humanoid is about as long as it was tall: its cell needs about 0.3 × height below the
pivot (the end of the body nearest the camera).

```ts
function death(skeleton: SkeletonSpec, seconds?: number): Clip
```

---

### `jump`

Jump for any skeleton: crouch (anticipation), push off (`takeoff`), an arc with the legs
tucked and the arms thrown up, `land` with a crouch that absorbs it, recover. With a
`distance` the body travels by root motion while the feet stay planted until takeoff and land
on their new spot. The cell must fit the top of the arc.

```ts
function jump(skeleton: SkeletonSpec, options?: JumpOptions): Clip
```

---

### `dodge`

Dodge for any skeleton: a quick, low dash forward or a hop back, covered by root motion (the
game moves the sprite; the body stays in its cell). Feet stay planted in the world and step to
their new spots one after the other, so nothing slides. `cancel` marks the recovery, where
another action may start.

```ts
function dodge(skeleton: SkeletonSpec, options?: DodgeOptions): Clip
```

---

### `stepsAlong`

Feet that stay planted in the world while the body travels by root motion: each foot keeps its
spot until its swing window, then steps to its new spot (the start plus the total travel), with
a lift. Returned in the body's frame (world spot minus the travel so far), as `Drive.feet` wants.
Use it in custom clips with `travel` (a lunge that keeps its ground, a charge): `windows` maps each
leg to the [start, end] of its step in normalized time, `distance` is the total travel, `raise`
lifts every foot (a jump's arc).

```ts
function stepsAlong(skeleton: SkeletonSpec, travel: (t: number) => number, distance: number, windows: Record<string, [number, number]>, lift: number, t: number, raise?: number): Record<...>
```

---

### `track`

Value of a keyed track at time t (clamped to the first and last keys).

```ts
function track(t: number, keys: Key[]): number
```

---

### `beat`

Keys one channel through a beat: `rest` → `apex` (creeping by `creep` during the hold) →
`extreme` (eased out) → `target` → back to `rest` at t = 1. The difference between
`extreme` and `target` is the overshoot.

```ts
function beat(t: number, b: Beat, rest: number, apex: number, extreme: number, target: number, creep?: number): number
```

---

### `bell`

Bell-shaped 0..1..0 bump with zero slope at both ends (16 u² (1 − u)²).

```ts
function bell(u: number): number
```

---

### `bump`

A bump between t0 and t1 and 0 everywhere else: `bell` over the window, guarded. `bell` alone
is not clamped (outside 0..1 it grows again), so windowed motions (a tap, a claw flick, a jump
arc) use this. Keep t1 < 1 in loops, or the bump is cut at the seam.

```ts
function bump(t: number, t0: number, t1: number): number
```

---

### `BEAT`

Default rhythm (about 25 frames at 60 Hz for a 0.42 s action).

```ts
const BEAT: Beat
```

---

### `linear`

```ts
function linear(t: number): number
```

---

### `smooth`

Ease in and out (smoothstep). The default between keys.

```ts
function smooth(t: number): number
```

---

### `easeOutCubic`

```ts
function easeOutCubic(t: number): number
```

---

### `easeInCubic`

```ts
function easeInCubic(t: number): number
```

---

### `easeOutQuad`

Gentler than easeOutCubic: over a 3-frame strike it splits the motion about 56/33/11%.

```ts
function easeOutQuad(t: number): number
```

---

### `checkClip`

Samples a clip `samples` times and measures bone drift, foot slide, floor contact and loop closure.

```ts
function checkClip(skeleton: SkeletonSpec, clip: Clip, samples?: number): ClipCheck
```

---

### `defineCharacter`

Declares a character once: skeleton, skin, camera, cell, pivot, sockets and every clip. Each
clip file is one line, `export default character.sheet('<key>')`, and every exported sheet
carries the full manifest, so players never guess what a sheet is from its file name.
The clip keys are inferred from `clips`: a sheet file that names a clip the character does not
declare fails to type-check (see `ClipKey`).
Throws on a bad key; collects softer problems (no idle, events naming unknown sockets) in
`manifest.warnings`, which `npm run inspect` prints.

```ts
function defineCharacter<K extends string = string>(o: CharacterOptions<K>): Character<K>
```

---

### `defineCharacterAsset`

Defines an exportable sheet of one clip: directions × frames, with the clip's data in the atlas JSON.

```ts
function defineCharacterAsset(o: CharacterAssetOptions): AssetDefinition
```

---

### `drawCharacterFrame`

Draws one frame of a character into a canvas context, exactly as its exported sheet does: the
pose at normalized time `t` and facing `facing` (radians; π/2 faces the camera), the contact
shadow and the skin, with the world origin at `o.pivot`. Editors and previews (the viewer's
customizer) call it to show a character live without exporting it.

```ts
function drawCharacterFrame(ctx: CanvasRenderingContext2D, o: CharacterView, t: number, facing?: number, shadowOf?: (pose: Pose) => { rx: number; ry: number; cx: number; cy: number; }): void
```

---

### `mannequinSkin`

Generic block-out skin for any skeleton: the trunk as one blob (a tube through the trunk
joints plus an ellipsoid at each, so it holds for a straight spine, a curled body or joints
that are not a chain), tapered tubes for limbs and tails, an ellipsoid head facing forward.
Use it to check proportions and motion before writing the project's real skin.

```ts
function mannequinSkin(style: VolumeStyle, limbStyle?: VolumeStyle): Skin
```

---

### `ringsAlong`

Sections around a path (a spine, a neck, a snout): ellipses perpendicular to the path,
`radii[i]` = [across, vertical] at point i. Feed them to `Round.loft`.

```ts
function ringsAlong(points: Vec3[], radii: [number, number][], upHint?: Vec3): Section[]
```

---

### `along`

Points along a chain resampled at fractions `ts` (0 = root, 1 = tip), for tapered limbs and tails.

```ts
function along(chain: Vec3[], ts: number[]): Vec3[]
```

---

### `bodyFrames`

Pitch-safe frames of a body. Bipeds (two legs or fewer): the trunk axis (first trunk joint →
chest joint) is up and the chest faces where the shoulders point. Creatures with more legs: the
trunk axis (rump → chest) is forward and up is perpendicular to it.

```ts
function bodyFrames(pose: Pose, skeleton: SkeletonSpec): BodyFrames
```

---

### `chestJoint`

The chest joint of a skeleton: the trunk joint the arms hang from, or, without arms, the last
trunk joint before the head. (A humanoid's trunk goes on to a neck; the chest is where the
shoulders are.)

```ts
function chestJoint(skeleton: SkeletonSpec): string
```

---

### `slotFrame`

The frame of a slot for one pose. Frames are right-handed (forward, right, up), so mirrored
parts read `side` instead of flipping an axis (a flipped frame would turn faces inside out).
- head, chest, pelvis, back: origin on the joint (chest: `chestJoint`); forward, right and up of
  the chest (pelvis: of the hips; back: the chest moved behind the spine).
- shoulder: origin on the shoulder joint, chest axes.
- upperArm, forearm, thigh, shin: origin at the bone's start, forward along the bone, up towards
  the body's forward.
- hand, foot: origin on the joint, forward along the forearm or the foot.

```ts
function slotFrame(pose: Pose, skeleton: SkeletonSpec, slot: Slot, side?: 1 | -1, body?: BodyFrames): SlotFrame
```

---

### `slotsOf`

The slots a skeleton has, with their sides: head, chest, back and pelvis (side 0), then shoulder,
upper arm, forearm and hand for each arm, and thigh, shin and foot for each side with a leg. A wolf
or a spider has no arm slots. `slotFrame` throws for a slot that is not listed.

```ts
function slotsOf(skeleton: SkeletonSpec): { slot: Slot; side: 0 | 1 | -1; }[]
```

---

### `isPairedSlot`

Slots that come in pairs (one per side); the others are central.

```ts
function isPairedSlot(slot: Slot): boolean
```

---

### `isHandSlot`

Slots where a part is held in a hand (a sword in the hand, a shield on the forearm).

```ts
function isHandSlot(slot: Slot): boolean
```

---

### `weaponChannel`

The clip channel of an item held on `side`: 'weapon' for the main (right) hand, 'offWeapon' for the left.

```ts
function weaponChannel(side: number): string
```

---

### `partKind`

A part's kind, falling back to its group ('bodies' → body, 'effects' → effect).

```ts
function partKind(info: PartInfo): PartKind
```

---

### `partRequires`

The parts a part may rest on (empty when it is not an add-on).

```ts
function partRequires(info: PartInfo): string[]
```

---

### `held`

Grip and direction of an item held in a hand, read from the clip's `extra.weaponYaw` and
`extra.weaponPitch` (radians, in the creature's frame; `offWeaponYaw` / `offWeaponPitch` with
`channel: 'offWeapon'`) or the `rest` direction. When the body
lies down the item settles along the floor beside the arm, and the tip never goes below `floor`.
Use the same call in the skin and in the character's sockets, so the drawing and the socket agree.

```ts
function held(pose: Pose, skeleton: SkeletonSpec, hand: string, o: HeldOptions): Held
```

---

### `outfit`

Assembles a skin from parts, the data-driven way to dress characters and make variants: swap a
piece, change a side, give a piece other materials. Pieces are drawn in order after the base;
`on` hands a piece the volume of an earlier one.

```ts
function outfit(spec: OutfitSpec): Skin
```

---

### `outfitFromData`

Builds a skin from an outfit saved as data, with the catalog's parts, bases and materials.
Part options left out take the defaults the catalog declares. Throws with every problem
`validateOutfit` finds.

```ts
function outfitFromData(data: OutfitData, catalog: GearCatalog): Skin
```

---

### `validateOutfit`

Checks an outfit against a catalog and returns the problems (unknown parts, slots a part does
not fit, missing or wrong hosts, two pieces with one id, two parts in one equipment slot, two
held parts in one hand or beside a two-handed one, unknown materials, options out of range).
Empty when it is valid.

```ts
function validateOutfit(data: OutfitData, catalog: GearCatalog): string[]
```

---

### `wieldOf`

What an outfit holds: the main hand is the right one, the off hand the left.

```ts
function wieldOf(outfit: OutfitData, catalog: GearCatalog): { main?: Wielded | undefined; off?: Wielded | undefined; }
```

---

### `wieldsOf`

The `wields` of a clip entry (none for a bare clip).

```ts
function wieldsOf(entry: CharacterClip): ClipWields | undefined
```

---

### `checkWield`

Checks a character's clips against what its outfit holds. A clip suits it when each hand it names
(`wields.main`, `wields.off`) holds one of the classes listed there ('unarmed' for an empty hand);
a clip without `wields` suits anything. Warns when the character has attacks but none for the
weapon in its main hand, when a clip does not suit what it holds, and when the off hand holds an
item that only makes sense swung (`offHand: 'swing'`) and no clip swings it.

```ts
function checkWield(clips: Record<string, CharacterClip>, outfit: OutfitData, catalog: GearCatalog): WieldCheck
```

---

### `weaponSockets`

The sockets of the items an outfit holds, as character sockets: the main hand's under their own
names (a blade's `tip`), the off hand's as `off-<name>`. Options left out take the part's defaults.

```ts
function weaponSockets(outfit: OutfitData, catalog: GearCatalog, skeleton: SkeletonSpec): Record<string, SocketFn>
```

---

### `swapCandidates`

Parts that can take the place of piece `index`: the same kind, fitting its slot, and the same
equipment slot (`equip`); for a part without one, the same group and the same hosts (`requires`).

```ts
function swapCandidates(catalog: GearCatalog, outfit: OutfitData, index: number): string[]
```

---

### `swapBlocker`

The piece that keeps part `partId` from taking the place of piece `index` (in `slot`, default the
piece's), or undefined when `swapPiece` can do it. An editor shows it ("taken by the helm");
`equipPart` replaces it instead.

```ts
function swapBlocker(catalog: GearCatalog, outfit: OutfitData, index: number, partId: string, slot?: Slot | undefined): SwapBlocker | undefined
```

---

### `swapPiece`

Puts part `partId` in place of piece `index`: it keeps the piece's side, `id` and host (re-hosted to
an accepted piece if the new part needs another, and moved after it if that host comes later), the
piece's materials for the roles the new part reads, and the options set on it that the new part has
too (clamped to its range). Add-ons resting on the piece that do not accept the new part are taken
out; the other pieces resting on it now rest on the new one. Throws when the part does not fit the
piece's slot (unless `slot` names one it fits), needs a host the outfit lacks, or would share an
equipment slot or a hand with another piece (`swapBlocker` says which): `equipPart` settles those
by replacing.

```ts
function swapPiece(outfit: OutfitData, catalog: GearCatalog, index: number, partId: string, o?: { slot?: Slot | undefined; }): OutfitEdit
```

---

### `equipPart`

Equips a part the way a game does:
- when it has an equipment slot (`equip`), it replaces the piece holding that slot on the same side
  (as `swapPiece`), in that piece's slot unless `slot` is given (or the part does not fit it);
  otherwise, or when the slot is free, it is added, on the host it needs;
- a held part (`wield`) takes the hand: what else is held in it goes, and a two-handed part empties
  the other hand too (equipping a shield beside a two-handed weapon takes the weapon out).
`slot` defaults to the part's first slot and `side` to the right. Equipping the part that already
holds the slot there changes nothing and returns the same outfit.

```ts
function equipPart(outfit: OutfitData, catalog: GearCatalog, partId: string, o?: { slot?: Slot | undefined; side?: 1 | -1 | undefined; }): OutfitEdit
```

---

### `removePiece`

Takes piece `index` out of the outfit, with the add-ons that need it (and theirs); the other
pieces resting on it stay, no longer resting on anything.

```ts
function removePiece(outfit: OutfitData, catalog: GearCatalog, index: number): OutfitEdit
```

---

### `defineGearAsset`

Defines a sheet of one gear part alone: directions × 1 frame, posed on the character at the
clip's first frame. Add-ons (a crest) are drawn with the piece they rest on. The atlas JSON
says `role: 'gear'` with the part's id, label, group, kind, equipment slot, slot and side.

```ts
function defineGearAsset(o: GearAssetOptions): AssetDefinition
```

---

### `defineItemIcon`

Exports an item's inventory icon: a square of the catalog's icon size with the item fitted inside
its padding (measured first, then drawn again at the scale that fits, so lines stay crisp), over the
catalog's background and under its frame for the item's rarity. The atlas says `role: 'icon'` and
the item: id, label, kind, rarity (with its color), stack, description, and the gear part it equips
with that part's equipment slot.

```ts
function defineItemIcon(o: ItemIconOptions): AssetDefinition
```

---

### `validateItems`

Problems of an item catalog: ids, rarities, a source for each item, gear parts (an add-on drawn as worn needs a wearer) and materials. Empty when valid.

```ts
function validateItems(catalog: ItemCatalog): string[]
```

---

### `itemRng`

A seeded generator for an item piece.

```ts
function itemRng(ctx: Pick<ItemContext, "seed">, salt?: number): Rng
```

---

## Types & Interfaces

### `SkeletonSpec`

A complete skeleton: trunk, limbs and gaits.

```ts
interface SkeletonSpec {
  name: string;
  /** Overall height in world units, for scale references. */
  height: number;
  /** Trunk joints in order from the rear (or bottom) to the head. */
  trunk: TrunkJoint[];
  /** Name of the trunk joint that carries the head. */
  head: string;
  legs: LegSpec[];
  arms?: ArmSpec[];
  tails?: TailSpec[];
  /** Gaits this skeleton can use, by name ("walk", "run", "trot", ...). */
  gaits: Record<string, GaitSpec>;
}
```

### `TrunkJoint`

A joint of the trunk at rest.

```ts
interface TrunkJoint {
  name: string;
  at: Local;
}
```

### `LegSpec`

A leg: two IK bones from a hip socket, plus an optional foot segment down to the ground.

```ts
interface LegSpec {
  name: string;
  /** Trunk joint the leg hangs from. */
  hip: string;
  /** Hip socket relative to that joint. */
  offset: Local;
  /** Upper and lower bone lengths (thigh and shin; upper arm and forearm for a front leg). */
  lengths: [number, number];
  /** Extra segment from the lowest joint to the ground contact: the hind foot of a digitigrade leg (hock to paw) or the pastern of a front leg (wrist to paw). `tilt` (degrees) leans it so the joint above sits behind the contact; 0 is vertical. */
  foot?: { length: number; tilt: number; };
  /** Which way the middle joint bends. `'forward'` for knees and stifles, `'back'` for the elbows of front legs. Or a direction `[forward, side, up]` in the creature's frame (side: right +) towards which the joint bulges, for limbs that do not bend in the forward/back plane: insect and spider legs arch up and out, so a left leg uses `[0, -1, 1.2]` and a right leg `[0, 1, 1.2]`. The direction does not need to be perpendicular to the hip-to-foot line (the solver projects it onto the plane of the bend), only finite and non-zero. */
  knee: Local | "forward" | "back";
  /** Rest contact point, relative to the hip socket projected on the ground. Default [0, 0, 0]. */
  stance?: Local;
}
```

### `ArmSpec`

An arm: two bones from a shoulder socket, posed by swing (FK) or by a hand target (IK).

```ts
interface ArmSpec {
  name: string;
  /** Trunk joint the arm hangs from. */
  shoulder: string;
  /** Shoulder socket relative to that joint. */
  offset: Local;
  /** Upper arm and forearm lengths. */
  lengths: [number, number];
  /** -1 for the left arm, 1 for the right arm. */
  side: 1 | -1;
  /** Leg whose phase drives this arm's swing while walking (usually the opposite leg). */
  swingWith?: string;
}
```

### `TailSpec`

A tail (or any loose chain): segments from a root, hanging back and down at rest.

```ts
interface TailSpec {
  name: string;
  /** Trunk joint the tail hangs from. */
  root: string;
  /** Root socket relative to that joint. */
  offset: Local;
  /** Number of segments (the chain has segments + 1 points). */
  segments: number;
  /** Total length in world units. */
  length: number;
  /** Rest angle below horizontal, pointing backwards, in degrees. */
  pitch: number;
}
```

### `Local`

[forward, side (right +), up] in the creature's own frame, in world units (1 unit = 1 logical px).

```ts
type Local = [number, number, number]
```

### `GaitSpec`

How a skeleton walks, trots, runs or gallops.

```ts
interface GaitSpec {
  /** Fraction of the cycle each foot is on the ground: ~0.6 walking, ~0.35 running (under 0.5 there is a flight phase). */
  duty: number;
  /** Distance a planted foot travels under the body during its stance, in world units. */
  stride: number;
  /** Gait cycles per second. One exported loop is one cycle. */
  cadence: number;
  /** Phase offset of each leg in the cycle (0..1). A foot touches down when its phase is 0. */
  phases: Record<string, number>;
  /** Height the swinging foot is lifted (world units): about 0.18 × hip height walking, 0.3–0.4 × running. These values already allow for the tilted camera flattening vertical motion; the presets use them. */
  lift: number;
  /** Early heel lift of running swings, 0..1: the foot rises behind before it drives forward. */
  heelKick?: number;
  /** Vertical bob of the trunk (units), how many bobs per cycle, and when the lowest point falls (0..1). */
  bob?: number;
  bobCycles?: number;
  bobPhase?: number;
  /** Forward lean: front trunk joints move ahead by this much (units). Keep it small for walks; it reads as a hunch from a high camera. */
  lean?: number;
  /** Body pitch oscillation (degrees) and its phase: galloping and bounding. */
  pitch?: number;
  pitchPhase?: number;
  /** Spine flex (units): the rear and front of the trunk move apart and together once per cycle (gallop). */
  flex?: number;
  flexPhase?: number;
  /** Hip roll (degrees): the hip over the stance leg rises, the other drops; shoulders counter-roll. */
  roll?: number;
  /** Shoulder counter-rotation (degrees): the upper body turns against the hips, the shoulder of the forward-swinging arm going forward. Without it a biped walk looks robotic; ~6–8 walking, ~10–14 running. Applies to trunk joints after the first, like \`Drive.twist\`. */
  twist?: number;
  /** Arm swing amplitude (radians) for skeletons with arms. */
  armSwing?: number;
  /** Forearm bend while swinging (radians): ~0.2 walking (nearly straight), ~1.2 running (near 90°). */
  armFlex?: number;
  /** Forearm crossing towards the body on the forward swing (0..1): makes a run read from the front. */
  armAcross?: number;
  /** Tail sway amplitude (degrees) and extra lift of the tail (degrees). */
  tailSway?: number;
  tailLift?: number;
}
```

### `Drive`

Everything a clip decides at one moment. Missing parts stay at rest.

```ts
interface Drive {
  /** Offset of the whole trunk (a lunge, a crouch), in the creature's frame. */
  root?: Local;
  /** Offset of individual trunk joints (bob, lean, breathing), in the creature's frame. */
  trunk?: Record<string, Local>;
  /** Body pitch in degrees (positive raises the front), around the middle of the trunk. */
  pitch?: number;
  /** Upper-body yaw in degrees (positive turns towards the right), applied to trunk joints after the first. */
  twist?: number;
  /** Body roll in degrees (positive lifts the left hip): hip sockets tilt one way, shoulder sockets the other. */
  roll?: number;
  /** Ground contact of each leg, in the creature's frame (absolute, not an offset from rest: start from `restFeet(skeleton)`). z = 0 is the floor. */
  feet?: Record<string, Local>;
  arms?: Record<string, ArmDrive>;
  tails?: Record<string, TailDrive>;
  /** Free values for the skin (jaw opening, a weapon angle, a blink). */
  extra?: Record<string, number>;
}
```

### `ArmDrive`

How one arm is posed: a swing (forward kinematics) or a hand target (IK).

```ts
interface ArmDrive {
  /** Upper arm angle from hanging, radians; positive swings forward. */
  swing?: number;
  /** Extra bend of the forearm, radians. */
  flex?: number;
  /** How far the upper arm leans out to the side (0 = along the body, ~0.25 relaxed). */
  out?: number;
  /** Forearm leaning across towards the body's centre line (0..1), so a forward swing reads from the front. */
  across?: number;
  /** Hand target in the creature's frame; when set, the arm is solved by IK instead of swing. */
  target?: Local;
  /** Direction the elbow points towards when solved by IK (creature frame). Default down and out. */
  elbow?: Local;
}
```

### `TailDrive`

How one tail is posed.

```ts
interface TailDrive {
  /** Side-to-side sway, degrees, at the tip. */
  sway?: number;
  /** Phase of the sway wave, radians; each segment lags the previous one. */
  phase?: number;
  /** Extra lift of the whole tail, degrees (positive raises it). */
  lift?: number;
  /** Curl towards the tip, degrees (positive curls up). */
  curl?: number;
}
```

### `Pose`

The solved skeleton at one moment, in world coordinates.

```ts
interface Pose {
  /** The creature's frame (facing). */
  frame: Frame3;
  /** Every named joint: trunk joints, `<leg>.hip|knee|ankle|foot`, `<arm>.shoulder|elbow|hand`, `<tail>.<i>`. */
  joints: Record<string, Vec3>;
  /** Ordered chains for skins: `spine`, every leg (hip → contact), every arm (shoulder → hand), every tail (root → tip). */
  chains: Record<string, Vec3[]>;
  /** The drive's free values. */
  extra: Record<string, number>;
}
```

### `ActionKind`

What a clip means to a game. Players, the viewer's playground and the character manifest
read it to bind controls and decide what may interrupt what, so every clip declares one.
- idle: stands in place (loops). Locomotion (loops, moves the sprite at `speed`): walk, run,
  sprint, crawl, fly, swim.
- Actions (play once): attack (deals damage at its `hit` event), skill (commits at `cast`,
  its effect leaves at `release`), hit (reaction to damage), death (ends on its last frame:
  `hold`), dodge, jump, emote, interact, spawn (appearing). `action` = anything else.

```ts
type ActionKind = "idle" | "walk" | "run" | "sprint" | "crawl" | "fly" | "swim" | "attack" | "skill" | "hit" | "death" | "dodge" | "jump" | "emote" | "interact" | "spawn" | "action"
```

### `Clip`

An animation for one skeleton.

```ts
interface Clip {
  name: string;
  /** Duration of one play (or one loop) in seconds. The export's fps is frames ÷ seconds. */
  seconds: number;
  /** Loops (idle, locomotion) or plays once (attacks, hits). `defineClip` defaults it to false, so any cycle built by hand must say `loop: true`. */
  loop: boolean;
  /** Ground speed in world units per second while it plays (0 for actions in place). */
  speed: number;
  /** The drive at normalized time t. */
  drive(t: number): Drive;
  events: ClipEvent[];
  /** What the clip means to a game (see `ActionKind`). */
  kind: ActionKind;
  /** Free qualifiers for players and filters: 'melee', 'ranged', 'heavy', 'aoe', 'charged'. */
  tags: string[];
  /** Stays on its last frame when it ends instead of returning to idle (death, a held pose). */
  hold: boolean;
  /** Root motion of an action that covers ground (a pounce, a dodge roll, a lunge that keeps its ground): how far forward the game moves the sprite by normalized time t, in world units (0 at t = 0). The drive stays in place (the body does not leave its cell); the export writes the distance per frame so players move the sprite along the facing. Locomotion uses `speed` instead. */
  travel?: (t: number) => number;
}
```

### `ClipEvent`

A named moment of a clip, in normalized time. See `EVENTS` for the standard names.

```ts
interface ClipEvent {
  t: number;
  name: string;
}
```

### `IdleOptions`

Options of `idle`.

```ts
interface IdleOptions {
  /** Seconds per loop. Default 2. */
  seconds?: number;
  /** Breathing rise of the chest, in units. Default 0.6. */
  breath?: number;
  /** Side-to-side weight shift of the trunk, in units. Default 0.4. */
  sway?: number;
  /** Tail sway in degrees. Default 10. */
  tailSway?: number;
}
```

### `HitOptions`

Options of `hit`.

```ts
interface HitOptions {
  /** Seconds of the whole clip. Default 0.4. */
  seconds?: number;
  /** How hard the blow lands: 1 is a firm flinch, 0.6 a graze, 2 a heavy knock-back. Default 1. */
  strength?: number;
  /** How far the blow pushes the character back, in world units (root motion: the export writes it as negative `travel`). Default 0.12 × height × strength; 0 to stay in place. */
  knockback?: number;
}
```

### `JumpOptions`

Options of `jump`.

```ts
interface JumpOptions {
  /** Seconds of the whole clip. Default 0.75. */
  seconds?: number;
  /** Peak height of the feet above the floor, in world units. Default 0.28 × height. */
  height?: number;
  /** Distance covered forward (root motion). Default 0 (a jump in place). */
  distance?: number;
}
```

### `DodgeOptions`

Options of `dodge`.

```ts
interface DodgeOptions {
  /** Seconds of the whole clip. Default 0.45. */
  seconds?: number;
  /** 'dash' darts forward low; 'backstep' hops back with the guard up. Default 'dash'. */
  style?: "dash" | "backstep";
  /** Distance covered (root motion), in world units. Default 0.55 × height (dash), 0.35 × height (backstep). */
  distance?: number;
}
```

### `Ease`

An easing curve on 0..1.

```ts
type Ease = (t: number) => number
```

### `Key`

A key: [time, value], or [time, value, ease] where the ease shapes the segment ending at this key.

```ts
type Key = [number, number] | [number, number, Ease]
```

### `Beat`

Timing of one deliberate action, as normalized times. Every value keyed with `beat` passes
through: rest → windup (apex) → hold → strike (extreme, past the target) → hold → settle
(target) → rest.

```ts
interface Beat {
  /** End of the anticipation (the apex pose). */
  apex: number;
  /** End of the apex hold; the strike starts here. */
  strike: number;
  /** End of the strike: the extreme pose, past the target. */
  extreme: number;
  /** End of the extreme hold. */
  hold: number;
  /** Back on the target pose. */
  settle: number;
}
```

### `ClipCheck`

Result of `checkClip`, in world units (logical px).

```ts
interface ClipCheck {
  /** Worst change of a bone's length from its spec. */
  boneDrift: number;
  /** Locomotion only: worst difference between a planted foot's motion and the ground speed. */
  footSlide: number | null;
  /** Lowest foot height (negative = below the floor). */
  lowestFoot: number;
  /** Lowest height of any joint (a body or tail sinking into the floor shows as negative). */
  lowestJoint: number;
  /** Worst joint distance between the end and the start of the clip, measured for every clip. Loops (`loop: true`) and moving clips (`speed` > 0) are warned about when it is not ~0; a non-looping clip in place (an attack) may legitimately end elsewhere, so it is only reported. */
  loopGap: number;
  /** One line per problem, with the usual cause. Empty when the clip is clean. */
  warnings: string[];
}
```

### `Character`

A defined character: its manifest and one exportable sheet per clip. `K` is the union of its clip
keys (`'idle' | 'walk'`...); `Character` alone, with `K` = `string`, is any character.

```ts
interface Character<K extends string = string> {
  manifest: CharacterManifest;
  /** The sheet of one clip: `export default character.sheet('walk')` in `<name>/walk.ts`. A key the character does not declare in `clips` is a type error there, and throws if it gets past the types. */
  sheet(key: K): AssetDefinition;
}
```

### `CharacterOptions`

Options of `defineCharacter`. `K` is the union of the keys of `clips`; `defineCharacter` infers it
from the object literal, so `CharacterOptions` alone (`K` = `string`) is every character's options.

```ts
interface CharacterOptions<K extends string = string> {
  /** The character's id for players and the viewer (e.g. 'ossuary-guard'). */
  name: string;
  /** The name people read. Default: the name in words ('ossuary-guard' is 'Ossuary guard'). */
  label?: string;
  /** How the character is drawn; with `outfit` and no skin, `outfitFromData(outfit.data, outfit.catalog)`. */
  skin?: Skin;
  /** The outfit it wears, as data. With it the character holds what the outfit holds: the held items' sockets (a blade's `tip`) replace sockets of the same name, the clips made for something else are marked unusable and left out of `controls`, and `warnings` says what does not match (`checkWield`). */
  outfit?: { data: OutfitData; catalog: GearCatalog; };
  /** Every clip, by key. The key is the clip file's name: `characters/<name>/<key>.ts` exports `character.sheet('<key>')`. Lowercase letters, digits and dashes. `defineCharacter` takes the keys from the object passed (a literal, or a value whose type keeps its key names), and `character.sheet` accepts only those. */
  clips: Record<K, CharacterClip>;
  /** Frames of a clip that does not set its own. Default 8. */
  frames?: number;
  /** Override default bindings (see `CharacterManifest.controls`). */
  controls?: Partial<{ idle?: string | undefined; move: string[]; actions: Partial<Record<ActionKind, string[]>>; }>;
  /** Effects to play on clip events, by clip key: `{ cast: [{ on: 'release', effect: 'soul-bolt', motion: 'fly' }] }`. */
  effects?: Record<string, EffectCue[]>;
  skeleton: SkeletonSpec;
  /** The project's camera (`CAMERA` from the theme). */
  camera: Camera;
  /** Where the character stands in the cell (centre of its footprint), in logical pixels. */
  pivot: { x: number; y: number; };
  /** Contact shadow color from the theme, usually ink with alpha (`alpha(PALETTES.ink, 0.35)`). The shadow is an ellipse around the rest feet, padded by 0.12 × `skeleton.height` along the body and 0.1 × across, turning with the facing. Omit for no shadow. */
  shadow?: string;
  /** Outer contour of the character (see `ObjectOptions.contour`). */
  contour?: number | false | { width: number; color: string; };
  /** Logical cell size and export scale (default 2). */
  width: number;
  height: number;
  scale?: number;
  /** Facings as rows (default 8). */
  directions?: number;
  /** Named points exported per frame (see `defineCharacter`). `head` and `center` are always added from the skeleton. */
  sockets?: Record<string, SocketFn>;
}
```

### `ClipKey`

The clip keys of a character, as a union: `ClipKey<typeof character>` is `'idle' | 'walk'` for a
character with those two clips, and `string` when its clips do not keep their key names
(`Object.fromEntries`, a `Record<string, ...>`): then any key type-checks.

```ts
type ClipKey<C extends Character> = C extends Character<infer K extends string> ? K : never
```

### `CharacterClip`

A clip of a character, with its own frame count when the default does not fit.

```ts
type CharacterClip = Clip | { clip: Clip; frames?: number | undefined; wields?: ClipWields | undefined; }
```

### `ClipWields`

What a clip is made to hold, by hand: the classes of held parts (`PartInfo.wield.class`) it suits
in the main (right) and off (left) hand; 'unarmed' for an empty hand. A slash made for a blade is
`{ main: ['blade'] }`, a shield bash `{ off: ['shield'] }`, a dual-wield combo `{ main: ['blade'],
off: ['blade'] }`. A clip without it (walk, hit, a spell) suits anything.

```ts
interface ClipWields {
  main?: string[];
  off?: string[];
}
```

### `CharacterManifest`

Everything a player needs to drive a character, repeated in every sheet's atlas JSON
(`meta.data.character`). Interrupt rules the playground follows: death > hit > other actions
> locomotion > idle; an action may be cut short from its `cancel` event on (else only when it
ends); when an action ends the character returns to idle, except `hold` clips (death).

```ts
interface CharacterManifest {
  /** The character's id, as `defineCharacter` was given it ('ossuary-guard'). */
  name: string;
  /** The name people read, for a game's menus, the viewer and the test bench ('Ossuary Guard'). */
  label: string;
  skeleton: string;
  cell: { width: number; height: number; };
  scale: number;
  pivot: { x: number; y: number; };
  directions: string[];
  /** The project camera's tilt (degrees) and height boost. On screen, ground distances along the view (towards or away from the camera) shrink by sin(tilt): move the sprite at (vx, vy · sin(tilt)) × scale px/s for a world velocity (vx, vy), or the feet slide when the character walks up or down the screen. */
  camera: { tilt: number; heightBoost: number; };
  sockets: string[];
  clips: ManifestClip[];
  /** Default bindings: the idle clip, locomotion keys by speed (slowest first), action keys by kind. */
  controls: { idle?: string | undefined; move: string[]; actions: Partial<Record<ActionKind, string[]>>; };
  /** Effects to play on clip events, by clip key (see `EffectCue`). */
  effects: Record<string, EffectCue[]>;
  /** What the character holds in its main (right) and off (left) hand, when it was defined with an outfit. */
  wield?: { main?: { part: string; class: string; hands: 2 | 1; } | undefined; off?: { part: string; class: string; hands: 2 | 1; } | undefined; };
  /** Problems found when the character was defined (missing idle, unknown sockets in events, clips made for another weapon). */
  warnings: string[];
}
```

### `EffectCue`

An effect a character plays on an event of one of its clips: a projectile on `release`, sparks on
`hit`, a circle at its feet on `cast`, dust on `land`. `effect` is the effect's id in the project's
effect catalog (its sheet is `sheets/vfx/<id>.ts`, exported to `assets/vfx/<id>`).

```ts
interface EffectCue {
  /** The clip event it plays on ('release', 'hit', 'cast', 'land', 'step:left'), or 'start' / 'end' of the clip. */
  on: string;
  effect: string;
  /** The socket it starts at ('tip', 'mouth', 'hand'…). Default: the socket of the clip's `spawn:<socket>` event on the same frame, else 'center'; 'feet' for the character's pivot on the floor. */
  at?: string;
  /** How it moves: 'fly' along the facing the action started with (projectiles), 'follow' the socket while it plays (auras, trails), or 'stay' where it started (default). */
  motion?: "fly" | "follow" | "stay";
}
```

### `ManifestClip`

One clip in a character manifest.

```ts
interface ManifestClip {
  /** Clip key: the sheet file is `<key>.png` / `<key>.json` next to this one. */
  key: string;
  name: string;
  kind: ActionKind;
  category: "idle" | "action" | "locomotion";
  tags: string[];
  loop: boolean;
  hold: boolean;
  seconds: number;
  frames: number;
  fps: number;
  /** World units (logical px) per second; multiply by `scale` for exported pixels. */
  groundSpeed: number;
  events: { frame: number; name: string; }[];
  /** Root motion: forward distance from the start at each frame, then at the end (frames + 1 values). Absent when the clip stays in place. */
  travel?: number[];
  /** What the clip is made to hold (see `ClipWields`). Absent when it suits anything. */
  wields?: ClipWields;
  /** False when the character does not hold what the clip is made for: players leave it out (it is not in `controls`). */
  usable?: boolean;
}
```

### `SocketFn`

A named point a game attaches things to (a hand, a blade tip, a mouth), computed from the pose.

```ts
type SocketFn = (pose: Pose) => Vec3
```

### `SocketTable`

Socket positions of a sheet: `names` in order, and for every frame name (`<DIR>_<frame>`, or
`frame_<n>` for a single facing) one `[x, y, d]` per name. x, y are logical px from the cell's
top-left corner; d is the depth towards the camera relative to the body's center (positive =
in front of the body, so an effect there draws over the sprite).

```ts
interface SocketTable {
  names: string[];
  frames: Record<string, [number, number, number][]>;
}
```

### `Skin`

Draws a pose: adds the character's parts to its stage object.

```ts
type Skin = (object: StageObject, pose: Pose, kit: SkinKit) => void
```

### `SkinKit`

What a skin receives besides the pose.

```ts
interface SkinKit {
  camera: Camera;
  skeleton: SkeletonSpec;
  clip: Clip;
  /** Normalized time of this frame. */
  t: number;
  /** The pose at another normalized time of the same clip and facing (for smears and trails). */
  poseAt(t: number): Pose;
}
```

### `CharacterAssetOptions`

Options of `defineCharacterAsset`.

```ts
interface CharacterAssetOptions {
  skeleton: SkeletonSpec;
  clip: Clip;
  skin: Skin;
  /** The project's camera (`CAMERA` from the theme). */
  camera: Camera;
  /** Logical cell size and export scale (default 2). */
  width: number;
  height: number;
  scale?: number;
  /** Frames per direction. */
  frames: number;
  /** Facings as rows (default 8). */
  directions?: number;
  /** Where the character stands in the cell (centre of its footprint), in logical pixels. */
  pivot: { x: number; y: number; };
  /** Contact shadow color from the theme, usually ink with alpha (`alpha(PALETTES.ink, 0.35)`). The shadow is an ellipse around the rest feet, padded by 0.12 × `skeleton.height` along the body and 0.1 × across, turning with the facing. Omit for no shadow. */
  shadow?: string;
  /** Outer contour of the character (see `ObjectOptions.contour`). */
  contour?: number | false | { width: number; color: string; };
  /** Named points exported per frame (see `defineCharacter`). `head` and `center` are always added from the skeleton. */
  sockets?: Record<string, SocketFn>;
  /** The character this sheet belongs to: its manifest goes into the atlas JSON. */
  character?: CharacterManifest;
  /** This clip's key in the character (the clip file's name). */
  key?: string;
}
```

### `CharacterView`

What `drawCharacterFrame` needs: the character and its view (a subset of `CharacterAssetOptions`).

```ts
type CharacterView = { skeleton: SkeletonSpec; clip: Clip; skin: Skin; camera: Camera; pivot: { x: number; y: number; }; shadow?: string | undefined; contour?: number | false | { width: number; color: string; } | undefined; }
```

### `GearCatalog`

A project's gear catalog: every part and base body with editor metadata, the theme materials
that may play each role, and the characters an outfit can be put on (skeleton and clips).
The kit exports it from `src/gear/catalog.ts`; editors and saved outfits refer to parts by id.

```ts
interface GearCatalog {
  parts: PartInfo[];
  bases: BaseInfo[];
  /** Theme materials by name (usually `VOLUMES`). */
  materials: Record<string, VolumeStyle>;
}
```

### `PartInfo`

A part as an editor sees it: what it is, where it goes, what can be tuned.

```ts
interface PartInfo {
  /** Stable id used in saved outfits (e.g. 'horned-helm'). */
  id: string;
  label: string;
  /** Grouping for pickers: 'head', 'shoulders', 'torso', 'garments', 'weapons', 'shields', 'effects'... */
  group: string;
  part: Part<any>;
  /** Slots the part fits. Paired slots (shoulder, forearm, hand, shin...) take a side. */
  slots: Slot[];
  /** Material roles the part reads (so editors offer a material per role). */
  roles: string[];
  options?: PartOption[];
  /** The part (or parts) this one must rest on, when it is an add-on: a crest on a helm, a smear on any sword. */
  requires?: string | string[];
  /** What it is: `gear` (default), `body` (part of the creature under the gear: bone limbs, a rib cage; editors fold it away and item lists skip it) or `effect` (a flourish played by clips: smears, shockwaves). Without it, the groups 'bodies' and 'effects' count as body and effect. */
  kind?: PartKind;
  /** The equipment slot it takes alone ('helm', 'weapon', 'shield', 'pauldron'...): equipping another part with the same `equip` on the same side replaces it, the way a game's equipment screen works. Parts without one are layers that stack (a tunic under a tabard, a pouch at a belt). */
  equip?: string;
  /** How it is held, for weapons, shields, staves, lanterns in a hand or on a forearm (see `WieldInfo`). */
  wield?: WieldInfo;
}
```

### `PartKind`

What a part is (see `PartInfo.kind`).

```ts
type PartKind = "gear" | "body" | "effect"
```

### `WieldInfo`

How a part is held. A hand (its hand and forearm slots) holds one wielded part; a two-handed one
leaves the other hand empty. Clips say which classes they are made for (`CharacterClip.wields`),
so a character's attacks match what it holds (`checkWield`).

```ts
interface WieldInfo {
  /** The class clips are made for: 'blade', 'polearm', 'staff', 'bow', 'shield', or the project's own. */
  class: string;
  /** Hands it takes: 2 leaves nothing else in the other hand. Default 1. */
  hands?: 2 | 1;
  /** In the off (left) hand: 'hold' when it may simply be held (a shield, a lantern, a torch), 'swing' when it only makes sense in clips made to swing it (a second sword). Default 'swing'. */
  offHand?: "hold" | "swing";
  /** Points on the item for events and effects (its tip, a muzzle), from the pose, the piece's side and options; the same `held` call the part draws with. A character wearing it gets them as sockets (`off-<name>` in the off hand), so they follow the weapon it holds. */
  sockets?: Record<string, WieldSocket>;
}
```

### `WieldSocket`

A point on a held item (see `WieldInfo.sockets`).

```ts
type WieldSocket = (pose: Pose, skeleton: SkeletonSpec, piece: { side: 1 | -1; options: Record<string, unknown>; }) => Vec3
```

### `PartOption`

One adjustable option of a part, for editors (the viewer's customizer).

```ts
type PartOption = { key: string; label: string; type: "number"; default: number; min: number; max: number; step?: number | undefined; } | { key: string; label: string; type: "boolean"; default: boolean; } | { key: string; label: string; type: "select"; default: string; choices: { value: string; label: string; }[]; }
```

### `BaseInfo`

A base body an outfit is drawn over (bone body, flesh, fur), as editors see it.

```ts
interface BaseInfo {
  id: string;
  label: string;
  /** The body; it receives the outfit's materials as a fourth argument. */
  skin: (object: StageObject, pose: Pose, kit: SkinKit, materials: MaterialSet) => void;
  roles: string[];
}
```

### `OutfitData`

An outfit as data (JSON): parts and materials by id and name, so editors can save and load it.

```ts
interface OutfitData {
  base?: string;
  /** Role → material name in the catalog. */
  materials: Record<string, string>;
  pieces: { part: string; slot: Slot; side?: 1 | -1 | undefined; options?: Record<string, unknown> | undefined; materials?: Record<string, string> | undefined; id?: string | undefined; on?: string | undefined; hidden?: boolean | undefined; }[];
}
```

### `OutfitCharacterInfo`

A character editors may dress: everything `defineCharacter` needs except the skin, plus the
outfit it wears by default. The kit's `src/gear/catalog.ts` exports a list of them
(`CHARACTERS`); a saved outfit becomes a new character with the same skeleton, clips and cell.

```ts
interface OutfitCharacterInfo {
  id: string;
  /** The name editors show: the same as the character's `defineCharacter` label when one rig object gives both. */
  label: string;
  skeleton: SkeletonSpec;
  clips: Record<string, CharacterClip>;
  camera: Camera;
  width: number;
  height: number;
  pivot: { x: number; y: number; };
  shadow?: string;
  directions?: number;
  frames?: number;
  sockets?: Record<string, (pose: Pose) => Vec3>;
  outfit: OutfitData;
}
```

### `BodyFrames`

Frames of the body for one pose, all built from the joints so they follow pitch, twist and lying down.

```ts
interface BodyFrames {
  /** Trunk axis: pelvis → chest for an upright body. */
  up: Vec3;
  /** Where the chest faces (it twists with the shoulders in attacks). */
  forward: Vec3;
  /** The chest's right (shoulder line, left → right). */
  right: Vec3;
  /** The hips' forward and right (they do not twist with the shoulders). */
  hipForward: Vec3;
  hipRight: Vec3;
  /** 0 standing, 1 lying flat (a death): gear that hangs (capes, scabbards, tabards) drapes by it. */
  lie: number;
}
```

### `Slot`

Where a part sits. Paired slots take a side.

```ts
type Slot = "back" | "head" | "chest" | "pelvis" | "shoulder" | "upperArm" | "forearm" | "hand" | "thigh" | "shin" | "foot"
```

### `SlotFrame`

A slot's frame and side: build the part in `frame`, multiplying side offsets by `side` for mirrored parts.

```ts
interface SlotFrame {
  frame: Frame3;
  /** -1 left, 1 right, 0 for central slots. */
  side: 0 | 1 | -1;
  /** Bone length of a limb slot (upper arm, forearm, thigh, shin), 0 otherwise. */
  length: number;
}
```

### `HeldOptions`

Options of `held`.

```ts
interface HeldOptions {
  /** Default direction in the creature's frame when the clip sets no weapon angle. Default [0.55, 0.3, -0.75] (low and forward). */
  rest?: [number, number, number];
  /** The clip channels it reads: `extra.<channel>Yaw` and `<channel>Pitch`. Default 'weapon', the main (right) hand's. An item in the off hand reads 'offWeapon' (`weaponChannel(side)`), so it keeps its rest unless a clip made for two weapons swings it. */
  channel?: string;
  /** Length from the grip to the tip, for the floor clamp and the tip socket. */
  length: number;
  /** Lowest height the tip may reach (the floor plus a margin). Default 1. */
  floor?: number;
  /** Length behind the grip, for items that extend on both sides of the hand (a staff, a scythe's snath, a spear's butt). It shortens when it would go below `floor`, so the end touches the floor instead of sinking. Default 0. */
  butt?: number;
}
```

### `Held`

A held item's grip, direction and ends.

```ts
interface Held {
  grip: Vec3;
  dir: Vec3;
  tip: Vec3;
  /** The end behind the grip (the grip itself when `butt` is 0). */
  butt: Vec3;
  /** Frame along the item (forward = dir). Its roll is stable: up leans towards the creature's up, or towards its forward when the item is nearly vertical. A blade that must face a given way (a scythe, an axe) reads its own heading from the clip, by convention `extra.bladeAim` (radians in the creature's frame, 0 = forward). */
  frame: Frame3;
}
```

### `MaterialSet`

Materials by role. Parts ask for a role (`metal`, `cloth`, `bone`, ...) and the outfit (or the
skin) decides which theme material plays it, so one helm is iron on a guard and bronze on a
captain. Common roles: metal, metalAccent, cloth, clothAccent, leather, wood, bone, hollow,
glow, fur. Any other name works.

```ts
type MaterialSet = { [x: string]: VolumeStyle; }
```

### `Part`

A reusable piece of gear: it adds its volumes to the object and returns the main one, so
other parts can rest `on` it. `O` are the part's own options (size, lames, length...).

```ts
type Part<O = Record<string, unknown>> = (ctx: PartContext, options: O) => void | Placed
```

### `PartContext`

Everything a part receives.

```ts
interface PartContext {
  object: StageObject;
  pose: Pose;
  kit: SkinKit;
  body: BodyFrames;
  /** The slot's frame, side and bone length. */
  at: SlotFrame;
  materials: MaterialSet;
  /** The placed volume of the part this one rests on (`on`), if any. */
  host?: Placed;
}
```

### `OutfitPiece`

One part of an outfit.

```ts
interface OutfitPiece {
  part: Part<any>;
  slot: Slot;
  /** For paired slots: -1 left, 1 right. Default 1. */
  side?: 1 | -1;
  options?: Record<string, unknown>;
  /** Overrides of the outfit's materials for this piece (a gilded pauldron on an iron suit). */
  materials?: MaterialSet;
  /** Name for other pieces to rest on. */
  id?: string;
  /** The `id` of an earlier piece this one rests on: it receives that piece's volume as `host`. */
  on?: string;
  /** Placed for other pieces to rest on, but not drawn (an item icon's helm without its skull). */
  hidden?: boolean;
}
```

### `OutfitSpec`

A skin assembled from parts: an optional base skin (the body), then the pieces in order.

```ts
interface OutfitSpec {
  /** The body under the gear. It receives the outfit's materials as a fourth argument (a plain `Skin` works too). */
  base?: (object: StageObject, pose: Pose, kit: SkinKit, materials: MaterialSet) => void;
  materials: MaterialSet;
  pieces: OutfitPiece[];
}
```

### `Wielded`

A held part of an outfit.

```ts
interface Wielded {
  /** Its index in the outfit's pieces. */
  index: number;
  part: string;
  class: string;
  hands: 2 | 1;
  side: 1 | -1;
}
```

### `WieldCheck`

What `checkWield` finds.

```ts
interface WieldCheck {
  main?: Wielded;
  off?: Wielded;
  /** Clips made for what the character holds, or for nothing in particular. */
  usable: string[];
  /** Clips made for something else, with what they need. */
  unusable: { key: string; needs: string; }[];
  warnings: string[];
}
```

### `OutfitEdit`

The result of an outfit edit.

```ts
interface OutfitEdit {
  outfit: OutfitData;
  /** Indices, in the outfit before the edit, of the pieces taken out with it (add-ons whose host went away, what an equipped part pushed out of its slot or hands). */
  removed: number[];
  /** Where the swapped or equipped piece is in the new outfit (-1 after a removal). */
  index: number;
  /** What changed besides the edit itself, in words an editor can show. */
  notes: string[];
}
```

### `SwapBlocker`

What keeps a part from taking a piece's place: another piece holding its equipment slot or the hands.

```ts
interface SwapBlocker {
  /** The blocking piece's index in the outfit. */
  index: number;
  part: string;
  /** 'equip': it holds the part's equipment slot on that side; 'hands': the hands cannot take both. */
  reason: "equip" | "hands";
}
```

### `GearAssetOptions`

Options of `defineGearAsset`.

```ts
interface GearAssetOptions {
  catalog: GearCatalog;
  /** The character whose pose, cell and camera hold the part. */
  character: OutfitCharacterInfo;
  /** The part's id in the catalog. */
  part: string;
  /** Slot and side. Default: where the character's outfit wears this part, else the part's first slot, right side. */
  slot?: Slot;
  side?: 1 | -1;
  /** Option overrides (default: the outfit's, else the catalog defaults). */
  options?: Record<string, unknown>;
  /** Material overrides by role → material name (default: the outfit's). */
  materials?: Record<string, string>;
  /** Clip key of the character whose first frame poses the part. Default 'idle' (or the first clip). */
  clip?: string;
  /** Facings (default 8). */
  directions?: number;
  scale?: number;
}
```

### `ItemIconData`

What an item icon's atlas says about its item (`meta.data.item`, role 'icon'): the catalog's fields, the gear part it
equips (`gear`, the part's id) and that part's equipment slot (`equip`, when the gear catalog gives the part one).

```ts
interface ItemIconData {
  id: string;
  label: string;
  kind: string;
  rarity: string;
  rarityLabel: string;
  rarityColor: string;
  stack: number;
  description?: string;
  gear?: string;
  equip?: string;
}
```

### `ItemInfo`

An item as editors, exporters and games see it.

```ts
interface ItemInfo {
  /** Stable id: its icon sheet is `sheets/icons/<id>.ts` (written by `npm run item-icons`). */
  id: string;
  label: string;
  /** 'weapon', 'armor', 'consumable', 'key', 'material', 'currency', 'quest' or the project's own. */
  kind: string;
  /** A key of the catalog's `rarities`. */
  rarity: string;
  description?: string;
  /** How many fit in one inventory slot (1 for gear). */
  stack?: number;
  /** The gear part the item equips. Without a `piece`, the icon draws it as worn by a character of the gear catalog (its body hidden); `hosts` says whether the pieces it rests on in that outfit (a helm's skull, a shield's arm) are drawn (default) or only placed, hidden. */
  gear?: { part: string; character?: string | undefined; materials?: Record<string, string> | undefined; options?: Record<string, unknown> | undefined; hosts?: "draw" | "hide" | undefined; };
  /** A piece of its own that draws the icon (with or without `gear`). */
  piece?: ItemPiece<any>;
  options?: PieceOption[];
  /** Material roles a piece of its own reads. */
  roles?: string[];
  /** The view: the yaw the item faces (default 3π/4, a three-quarter view from the front left). */
  facing?: number;
  /** Turns the item before the view, in degrees: `turn` about up, then `tip` about its side (a shield tipped towards the viewer). A gear item takes `turn` only (as more facing): a worn part cannot tip. */
  pose?: { turn?: number | undefined; tip?: number | undefined; };
  /** Turns the drawn item in the icon's plane, in degrees clockwise: a sword or a key laid on the diagonal. Works for gear items too. */
  spin?: number;
}
```

### `ItemCatalog`

A project's items: the list, the rarity tiers, the icon's size and art, the camera and materials.

```ts
interface ItemCatalog {
  items: ItemInfo[];
  rarities: Record<string, Rarity>;
  /** Icon size in logical pixels (square) and the room kept round the item. */
  icon: { size: number; padding?: number | undefined; };
  /** Drawn under the item (a slot's ground, a glow of the rarity's color). */
  background?: (c: CanvasRenderingContext2D, box: IconBox, rarity: Rarity, item: ItemInfo) => void;
  /** Drawn over it (the border, a corner gem for the rarity). */
  frame?: (c: CanvasRenderingContext2D, box: IconBox, rarity: Rarity, item: ItemInfo) => void;
  camera: Camera;
  materials: Record<string, VolumeStyle>;
  defaultMaterials: Record<string, string>;
  /** The gear catalog and characters that gear items are drawn from. */
  gear?: { catalog: GearCatalog; characters: OutfitCharacterInfo[]; };
}
```

### `ItemPiece`

A piece of its own for an item that is not a gear part (a potion, a key, a coin).

```ts
type ItemPiece<O = Record<string, unknown>> = (ctx: ItemContext, options: O) => void
```

### `ItemContext`

What a piece of its own receives to draw an item.

```ts
interface ItemContext {
  /** The item's parts, sorted among themselves. */
  object: StageObject;
  camera: Camera;
  /** Origin at the item's centre (world 0, 0, 0), turned to the icon's view: x forward, y right, z up. */
  frame: Frame3;
  seed: number;
  materials: SceneMaterials;
}
```

### `Rarity`

A rarity tier: its name for players and its color for frames and text.

```ts
interface Rarity {
  label: string;
  color: string;
}
```

### `IconBox`

A box in logical pixels.

```ts
interface IconBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
```

### `ItemIconOptions`

Options of `defineItemIcon`.

```ts
interface ItemIconOptions {
  items: ItemCatalog;
  item: string;
  /** Another rarity's frame than the item's own (to show the tiers). */
  rarity?: string;
  scale?: number;
}
```

