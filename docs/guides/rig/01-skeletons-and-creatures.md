# Skeletons and creatures (`@core/rig`)

**Purpose.** Describe any body as data so one engine walks a person, a dog, a crab or a bird. This guide covers choosing and writing a `SkeletonSpec`. Gaits and clips are in [guide 02](02-gaits-and-clips.md), drawing a body in [guide 03](03-skins-and-character-assets.md).

**API reference:** [`docs/api/rig.md`](../../api/rig.md). Signatures are not repeated here.

---

## 1. Start from a preset, or write the data

| Body | Start from | Change |
| :--- | :--- | :--- |
| People, elves, robots, goblins (scale it) | `humanoid(scale)` | `scale` for size; bone lengths for proportions (long arms for a gorilla-like creature) |
| Wolves, dogs, big cats, horses (longer legs) | `quadruped(scale)` | trunk joint positions for body length; leg lengths; the tail |
| Spiders, insects, crabs | a new spec | 6–8 legs on one trunk joint, sideways offsets, **vector knees** that arch up and out (`[fan, ±1, 1.2]`), a `foot` segment for the tarsus, a tetrapod or wave gait |
| Birds, raptors, kangaroo-like bodies | a new spec | 2 legs on the quadruped hind-leg pattern: `knee: 'forward'`, `lengths` = [thigh, shin], `foot` = the metatarsus tilted 20–25° so the ankle sits behind the toes; narrow stance; small arms held bent (guide 02); a long tail for balance. The skin draws the thigh mass on the first bone |
| Serpents, worms, floating ghosts | a new spec with no legs | a long trunk; motion comes from `trunk` offsets in a custom clip |

Presets are only data plus clips. Copy one into the project and change its numbers; the engine never depends on a preset. To read a preset's numbers, print it: `npx tsx -e "import('./core/rig/index.ts').then(r => console.log(JSON.stringify(r.quadruped(), null, 1)))"`.

## 2. The parts of a spec

- **Coordinates:** a `Local` is `[forward, side, up]` in the creature's own frame: x forward, y to its right, z up, in world units (1 unit = 1 logical px). The project's reference sizes in `STYLE.md` set the scale; a humanoid is 80 units at scale 1. `height` is only a scale reference (shadow size, mannequin thickness), not a constraint.
- **`trunk`:** a chain of joints from the hips forward or upward, such as pelvis, chest, neck and head. Legs, arms and tails hang from trunk joints by name. `head` names the joint the skin draws the head at.
- **`legs`:** each leg has a hip joint, an `offset` from it, two bone `lengths`, and a `knee` direction.
  - `forward` is a human knee or a dog's stifle; `back` is a dog's elbow or a bird's ankle.
  - A vector `[forward, side, up]` bends the knee towards that direction, for limbs that do not bend in the forward/back plane: a spider's left leg uses `[0, -1, 1.2]` (out to its left and up), the right one `[0, 1, 1.2]`; add a forward component to fan the front pairs forward and the rear pairs back. The solver projects it onto the plane of the bend, so it need not be exact. A vector almost parallel to the hip-to-foot line falls back to an arbitrary side; any other string throws.
  - An optional `foot` is a third segment down to the ground, with a tilt: digitigrade hocks and pasterns, or an insect's tarsus.
  - `offset` places the hip socket relative to its trunk joint. The rest foot is that trunk joint's ground point plus `offset` (x, y) plus `stance`, at z = 0 (`restFeet(skeleton)` returns them all).
- **`arms`:** two bones from a shoulder joint, with a `side` and an optional `swingWith` leg. The arm swings in step with that leg, forward when that leg's foot is forward; name the leg on the opposite side, as `humanoid()` does (`armL` with `legR`). Arms have no rest pose of their own: they hang, and clips bend them (guide 02).
- **`tails`:** a root joint, segments, a length and a rest `pitch`.
- **`gaits`:** named `GaitSpec`s with a `phases` entry for every leg (guide 02).

`defineSkeleton` validates names and phases and throws with the exact problem, so build through it.

## 3. Proportions that read at sprite size

- **Hip height**, for a leg without a `foot`: just under the leg's full reach, about 0.97 × (l1 + l2). Knees are nearly straight at rest but never lock, and the IK has room to lower the trunk.
- With a `foot` segment: the ankle sits at foot.length × cos(tilt) above the floor. Put the hip at that height plus about 0.97 × (l1 + l2) for a straight leg, or 0.8–0.9 × (l1 + l2) for a visibly bent digitigrade leg.
- Trunk heights are targets: when a foot is out of reach the solver lowers the trunk. Print the solved rest pose to check: `solvePose(skeleton, Frame3.facing(vec3(0, 0, 0), 0), {})`.
- **Stance:** the rest foot is the hip joint's ground point plus `offset` (x, y) plus `stance`. A `stance` y of 0 puts the foot right under the hip socket; the humanoid uses 0.6 outward. Theropods and birds walk on a narrow line: use a negative (inward) stance y. Quadruped hind feet sit slightly behind the hip (`stance` x about −1).
- Exaggerate for the camera: heads, hands, paws and weapons 15–30% larger than life at 100–160 px (see the diorama-review [readability reference](../../../.agents/skills/diorama-review/references/readability.md)).

## 4. The solved pose

Units of the motion numbers: positions and distances (stride, lift, bob, lean, flex) are world units; `pitch`, `twist`, `roll`, tail sway and lift are degrees; arm swing and forearm flex are radians. The API reference prints each field's unit next to it.

`solvePose` turns a skeleton and a drive into a `Pose`:
- `joints` by name: trunk joints, `<leg>.hip|knee|ankle|foot`, `<arm>.shoulder|elbow|hand`, `<tail>.<i>`;
- `chains` (`spine`, every leg, arm and tail, as point lists);
- the `extra` channels from the clip.

Bone lengths are exact in every pose. When a target is out of reach, the trunk lowers smoothly instead of stretching a leg. Skins only read the pose; they never solve IK themselves.
