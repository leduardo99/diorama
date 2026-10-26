# Holding items (`@core/rig`)

**Purpose.** Make a character's hands hold what it holds: the handle in the palm, the fingers closed on it, the other hand on a two-handed item, and a wrist that bends no further than a wrist can. The engine gives the rules as data, places the item, moves the second arm and checks the result in every facing and frame. How a fist looks is the kit's style.

**API reference:** [`docs/api/rig.md`](../../api/rig.md): `Hold`, `HOLD_KINDS`, `held`, `palmFrame`, `palmGrip`, `Grip`, `secondHand`, `holdPose`, `outfitHolds`, `WieldInfo`, `PartContext`, `checkGrips`, `HAND`, `WRIST`.

**Worked paths:** `tests/engine/grip.test.ts` places one- and two-handed items and closes hands on them, and `tests/engine/grip-checks.test.ts` breaks each check on purpose and shows the fix. Read them for technique.

---

## 1. What the engine does

Before holds, `held` put an item's grip at the wrist joint and hand parts drew an open palm forward from it: the handle crossed the wrist and the fist never closed. Now an item can say how it is held:

- **The item declares its hold** (`Hold`): its kind, its handle (length and radius) and where each hand closes on it, as fractions from the butt (0) to the head or guard end (1). See §4.
- **The hand has a frame** (`palmFrame`). Its origin is the palm centroid, the middle of the closed fist, 0.3 of a hand's length past the wrist. One axis is the palm normal; another is the finger tube, the axis a handle runs along through the fist. The skeleton has no hand bone, so the engine solves the hand's direction for the handle: the most comfortable wrist, within the wrist's hard limits.
- **The item sits in the palm.** `held(..., { hold })` puts the point of the handle at `hold.grip` on the palm centroid and returns the palm, the ends of the handle and the second grip's range. The hand goes to the handle. A direction the clip sets (`weaponYaw` and `weaponPitch`) never changes. Where no clip sets one, the engine chose it (the part's `rest`), so it turns the item from there, as little as it must, until the wrist holds it comfortably (`restAxis`): a hand at rest is never strained by a default.
- **The clip lets go, not the floor.** Lying down alone changes nothing: a prone or crawling body keeps what it holds in its hand. A clip lets go with `extra.weaponRelease` (0 held, 1 let go; `offWeaponRelease` for the off hand), carried as `Held.released`: the fingers open with it, the item leaves the palm and settles flat on the floor beside the arm, and the other hand of a two-handed item lets go with it. `heldGrip` gives no grip once it has let go, and the checks skip those frames. The `death` preset lets go with both hands as the arms drop; a death that keeps its weapon in hand sets both channels to 0. Whether a character drops what it holds is the project's style, not a rule.
- **The second hand follows** (`secondHand`). For an item held in both hands, the other arm is solved with two-bone IK onto the second grip, after the clip's pose. It is never stretched. Out of reach, the grip slides along its range, or the hand lets go.
- **The hand part is told what it holds** (`PartContext.grip`, §5) and **the export checks the result** (§6).

Everything is optional. A part without a `hold` is placed at the wrist as before. A hand that holds nothing, or an item that declares nothing, gets no grip, and its hand part draws what it drew. A catalog whose parts have no `held` or `grip` exports exactly as before, with no `grips` block.

## 2. The rules, their numbers and their sources

Every number is data in the engine (`HAND`, `WRIST`, `HOLD_KINDS`) and each row says where it comes from. **Sourced:** a source says it. **Derived:** Diorama computed it from a source, such as a metric length as a fraction of a 175 cm body, or a position read from a description. **Unsourced:** common practice; no source was found, and the number is a rough default to override. Names in italics are in the list of §9. H is the body's height. The engine measures hands and handles against it, so the rules hold for any skeleton and style.

### 2.1 The hand and the wrist

| Rule | Numbers | Source | In the engine |
| :--- | :--- | :--- | :--- |
| Hand proportions | Hand length 0.10 H (wrist to fingertip), palm (four fingers) H/24, cubit 0.25 H, shoulder width 0.25 H | *Vitruvian Man* (Wikipedia, secondary) | `HAND.length`, `HAND.palm`; `ArmSpec.hand` sets one arm's hand length |
| The hand's frame | Origin at the palm centroid, on the palm's surface as the fist closes; one axis normal to the palm; one along the tube the non-thumb fingers make | *OpenXR* grip pose | `Palm`. The centroid 0.3 of a hand's length past the wrist is Diorama's choice (`HAND.centroid`) |
| Handle against the hand | A handle crosses the palm at 65° ± 7° to the hand's axis (31 people, a cylindrical handle): neither square to the hand nor along it. Spine's two-handed rig needs a 90° rotation offset between the hand and the weapon, which puts the handle about square to the forearm at a neutral grip | *Young 2013*; *Spine two-handed* | `Hold.angle` (65 by default). The hand may turn the handle in the palm by up to 25° before it bends the wrist (`GRIP_SLACK`, ours) |
| Wrist, hard limits | Flexion 80°, extension 70°, radial deviation 20°, ulnar deviation 30°. Measured in 120 adults aged 20 to 49: 73.9°, 65.9°, 18.6°, 28.3° | *Enlyte*; *Chung 1986* | `WRIST`. The hand is drawn within them; the angles a hold needs are reported even when they pass them |
| Wrist, in motion | About 40° of flexion, 40° of extension and 40° of radial and ulnar deviation together. Daily tasks use at most extension 60°, flexion 54°, ulnar 40°, radial 17°, and 70% of the range is enough for most | *Ryu 1991* | `WRIST.comfort`. Ulnar 40° in tasks is more than the static limit because the forearm turns too, so it is not read as a wrist angle. The check halves the comfort range for deviation (20°), ours |
| Wrist, at rest | Extended 15° to 30° and up to 15° towards the little finger: the posture of the strongest power grip. A held wrist stays comfortable within extension 26.6°, flexion 37.7°, radial 17.8°, ulnar 12.1° (25th percentile of carpal tunnel pressure at 25 mmHg) | *Frontiers 2022*; *Queen's*; *Human Factors 2007* | `WRIST.rest`. The solver aims at the middle of it |
| Swings | The wrist swings along an oblique path from radial extension (cocked back) to ulnar flexion (the strike), about 45° to the flexion-extension axis in the cited study | *Dart-thrower's motion* | Not modelled. It says where a swing asks the most: the wind-up asks for radial deviation, the smallest range (20°) |
| Fingers | The little and ring fingers close tightest, the middle finger moderately, the index finger and the thumb stay loose. Period art shows the leading thumb forward over the cross, some open grips with the thumb and index straight, and the thumb pressed on the flat of the blade for bind strength | *Musashi*; *Meyer 1570*; *Kendo tenouchi*; *HROARR grips*; *I.33 guards* | Style (§3). The engine gives one `curl` for the hand (§5) |

The practical rule for a clip: keep the handle about square to the forearm, and the wrist rests near neutral. Measured on the humanoid at rest, a handle square to a forward forearm needs 30° of extension and 13° of radial deviation. A handle exactly along the forearm needs 40° of ulnar deviation, past the 30° limit. So the forearm has to turn with the item: raise it for an upright spear or staff instead of leaving the arm hanging.

### 2.2 Where the hands go on a handle

**Handle size.** A power-grip handle is about 40 mm across (30 to 50) and at least 100 mm long, about 120 mm to span the palm. A precision grip is a pencil's 12 mm (8 to 16) (*CCOHS*; *Queen's* gives 115 to 120 mm). The palm is about 73 mm (H/24). So a hold needs at least one palm of handle for each hand that holds it, and two hands need a palm between them (`handleTooShort`, §6). A one-hand sword's grip is 9 to 10 cm, about 1.3 palms: the hand fills it (*Albion*). Hand-and-a-half grips run 15 to 25 cm and longsword grips 15 to 30 cm (*Albion*, *Longsword*).

**Handle radius.** The engine's defaults follow the power grip (a radius of about 0.0125 H) and the wand's 12 mm. A part that knows its handle declares it (`Hold.handle`).

**By kind.** `HOLD_KINDS` holds the defaults. Any string is a kind; one the engine does not know takes `HOLD_DEFAULT`, a power grip in the middle of a short handle. The grips are fractions from the butt, and the main hand is the right one.

| Kind | Grips | What people do | Basis |
| :--- | :--- | :--- | :--- |
| `one-hand-blade` | 0.5 | The hand fills the grip, the pommel at the heel of the hand (*Albion*, *Knife fighting*, *I.33 guards*) | Sourced |
| `dagger` | 0.5 | A forward grip continues the forearm; a reverse (ice-pick) grip runs the blade along it: `reverse: true` (*Knife fighting*, *Meyer's dagger*) | Derived |
| `two-hand-blade` | Main 0.9, other 0 to 0.35 | Lead hand just below the cross, the thumb touching the guard or the ricasso; rear hand on the pommel or just above it; the hands close together, up to a palm apart (*Meyer 1570*, *Ringeck gloss*, *ARMA forum*, opinion) | Derived from descriptions; no measured spacing |
| `axe` | Main 0.08, other 0.3 to 0.75 | One hand fixed near the end of the handle, the other starts high and slides towards it during the stroke (*Scout Life*, *Art of Manliness*) | The idea sourced; the numbers unsourced (they came only from a search snippet of a forestry manual that could not be opened) |
| `mace` | 0.12 | Hammer grip at the butt of the haft, the wrist driving the swing | Unsourced |
| `spear` | Main 0.05, other 0.25 to 0.6 | The rear hand holds the butt end and drives; the front hand leads and guides, the shaft sliding through it on the pull back (*KungFuToday*, *FlashMavi*) | Rear hand sourced (0 to 0.1); front range unsourced |
| `staff` | Main 0.38, other 0.25 H further | English tradition: rear hand at the butt, front hand 30 to 46 cm above (0.17 to 0.26 H). McCarthy 1883: 76 cm apart (0.43 H). Chinese staff: 60 cm (0.34 H) (*Quarterstaff*, *McCarthy*, *Inside Kung-Fu*) | Sourced as a range; shoulder width (0.25 H) is ours |
| `polearm` | Main 0.15, other 0.25 H further | Naginata: rear hand about a forearm from the butt (0.15 to 0.25 H), hands apart about shoulder width (*Naginata*). No opened source gives hand spacing for a halberd, glaive or poleaxe; the naginata and staff model is used for them | Naginata sourced; the rest unsourced |
| `scythe` | Main 0.55, other 0.25 H towards the butt | Top handle in the left hand, middle handle in the right, arms straight, the blade parallel to the ground and close to it (*Scythe*). The lower grip at hip height and the upper one a cubit above it is forum opinion (*Scythe ergonomics*) | Handles sourced; spacing derived |
| `bow` | 0.5, angle 45° | The grip rests on the pad of the thumb and does not cross the lifeline; the fingers sit off to the side at about 45° to the riser (*GoHunt*; *Bow International* says there is no one angle) | Sourced |
| `crossbow` | Main 0.2, other 0.6 | The leading hand on the forearm of the stock, fingers and thumb in its grooves and clear of the string's path (*Bowhunter-ed*) | The idea sourced; numbers unsourced |
| `strapped-shield` | 0.5 | The forearm in leather straps (enarmes), gripping tight so the shield stays when the hand relaxes; sometimes a hand grip too (*Strapped shield*, *Kite shield*, *Heater shield*) | Sourced |
| `center-grip-shield` | 0.5 | A buckler is gripped in the fist by a central handle behind the boss, held out with the arm extended or close to the body (*Buckler*, *I.33 guards*) | Sourced |
| `precision` | 0.15, angle 15° | A wand or baton: thumb and first two fingers, the end seated against the palm, about the forearm's length (12 to 16 in) (*Baton*, *CCOHS*) | Sourced; the angle is ours |
| `two-hand-tool` | Main 0.05, other 0.3 to 0.6 | Long-handled tools: wrists straight, thumbs up, an upright back (*Rutgers gardening*) | The idea sourced; spacing unsourced |
| `thrown` | 0.63 | A javelin is held at a cord-wrapped grip about 150 mm wide, centred on its centre of gravity: 0.9 to 1.06 m from the tip of a 2.6 to 2.7 m javelin, which is 0.61 to 0.65 from the butt (*Javelin throw*) | Derived; the handle length (1.5 H) is a guess |
| `carried-light` | 0.3 | A torch or lantern: no authoritative source. Common practice is a torch in a power grip near the base and a lantern hung from its ring at the hand | Unsourced |

**Two weapons.** Each hand holds its own item with its own hold: a long weapon in the dominant hand and a short defensive one in the other (rapier and parrying dagger, sword and buckler) (*Dual wield*, *I.33 guards*). The right hand is the main one; the left reads the off-hand clip channels (guide 05). Hands that swap roles inside a technique (the naginata's hasso, McCarthy's staff "change") are not modelled; the nearest the engine gets is a second grip that slides along its range or lets go.

### 2.3 Two hands

- **The item owns both grips.** One rigid item with two grip points, and both hands follow it. Spine's two-handed rig has a target bone on the weapon for each hand, Unity's grab interactable a secondary attach transform and Godot XR Tools secondary grab points (*Spine two-handed*, *Unity grab*, *Godot grab points*).
- **The main hand drives and the other follows.** The item is placed from the main hand; the other arm is solved with two-bone IK onto the second grip, after the clip's body pose, as a final correction pass (*Spine two-handed*, *Unity two-bone IK*, *Unreal two-bone IK*). Unity runs it in `OnAnimatorIK`, and calling it from `Update` is a known mistake (*gamedev.tv IK*).
- **The elbow has a bend hint, the same in every facing.** The elbow bends the way the clip bends it, and a straight arm falls back to down and out in the creature's frame (Unity's Hint, Unreal's Joint Target, Spine's bend direction, Godot's `flip_bend_direction`).
- **The arm is never stretched.** Godot's 2D solver treats a target past the maximum distance as at it; Spine's softness slows the bones as they straighten and stretching is opt-in; Unreal's too (*Godot two-bone IK*, *Spine IK*, *Unreal two-bone IK*).
- **Out of reach, slide or let go.** The grip slides along its range (`Hold.second`) to come within reach. If that is not enough, the hand lets go, fading over a palm's width. Both are reported as notes. This rule is ours.
- **A weight, not a switch.** IK influence is a weight from 0 to 1, keyed per animation (*Spine two-handed*, *Unity two-bone IK*); a 0 or 1 switch makes hands snap (*gamedev.tv IK*). The clip's `extra.secondGrip` is that weight, 1 by default.

### 2.4 Drawing the hand

- **The hand is its own part, drawn over the handle.** The fist overlaps the handle and the item reads as gripped (*OGA builder*, *Nuclear Throne hands*). The Liberated Pixel Cup stacks the weapon above the gloves instead (*LPC*), which cannot wrap a fist round a handle without painting the hand into the weapon art.
- **Depth does the layering.** Diablo II keeps a layer-order table per facing and frame, and FLARE one per facing, because 2D layers carry no depth (*OpenDiablo2 COF*, *FLARE layers*). Diorama sorts volumes by depth, so the fingers' volumes wrap the handle and the ones in front of it sort in front of it. There are no tables per facing.
- **The same hand holds the item in all eight facings.** Never mirror: flipping a facing swaps the hands (*Pixelblog 55*, *56* and *58*).
- **Closed while it holds, as before otherwise.** Spineboy swaps `front-fist-open` and `front-fist-closed` per animation; SteamVR defines OpenHand, Fist and GripLimit poses; Godot XR Tools applies a hand pose only while holding (*Spineboy*, *SteamVR input*, *Godot grab points*).
- **Closing is capped by the object.** SteamVR gives each finger a curl from 0 (straight) to 1 (fully curled); Meta constrains the fingers so they wrap round what is held (*SteamVR input*, *Meta hand grab*). Diorama gives one `curl` for the hand, 1 − radius / (0.42 × the hand's length): ours.
- **The fist is a blob, never a pixel.** No source states a size. The Liberated Pixel Cup's glove layer is two 7 by 9 px blobs, cuff included, on a figure about 47 px tall: 15% to 19% of its height. As a rule of thumb, 2 to 3 px at a 32 px figure and 4 to 5 px at 48 (unsourced). Keep it apart in value from the sleeve and from the item (*Pixelblog 55*, *LPC*).
- **Poses.** The hold says where the hand is on the handle; the clip and the part's `rest` say where the item points. Rest poses in the sources: a sword in its scabbard at the hip opposite the shoulder the baldric crosses; a spear or pike upright with the butt planted, or angled up at "port"; a staff in the hollow of the shoulder with its point on the ground by the toe; a buckler held out towards the opponent or close to the body; a bow arm straight and raised until parallel to the ground (*Baldric*, *Dory*, *Pike*, *McCarthy*, *I.33 guards*, *Archery*).

## 3. Engine and style

| | The engine (the same for every project) | Style (the kit's) |
| :--- | :--- | :--- |
| The item | The `Hold` data and the defaults of each kind; the grip on the palm; the floor rule | The art of the handle: a cylinder, a wrap, the guard and pommel left visible beyond the hand; the handle's true length and radius, which the kit declares in the `Hold` |
| The hand | The palm frame; the wrist solved within its limits; the `Grip` a hand part receives; the curl capped by the handle's thickness | How a fist looks: one mass or separate fingers, knuckles, a glove, a cuff; the hand's size (`ArmSpec.hand`); which fingers stay loose and where the thumb lies |
| The second hand | The IK, its bend hint, the reach clamp, the slide, the release and the weight | How the second hand looks |
| Depth | Volumes sort by depth; no layer table per facing | Which volumes the fist is made of, so the fingers wrap the handle |
| The motion | The wrist's limits and the checks | The clip: timing, the item's angles, the smear |

A change in the left column changes every project; a change in the right one is that project's look.

## 4. Declaring how an item is held

**1. Declare the hold.** `kind` picks the defaults (§2.2). Everything else is optional:
- `handle`: the length and radius, in world units, of the handle as the part draws it. Default: the kind's, scaled by H.
- `grip`: where the main hand closes, from 0 (the butt) to 1 (the guard or head end).
- `second`: where the other hand closes on an item held in both hands: a fraction, or a range `[from, to]` it may slide in.
- `angle`: the handle against the hand's axis in degrees, 65 for a power grip. `reverse`: the head end comes out of the little finger's side.

```ts
import type { Hold } from '@core/rig';

export const LONGSWORD: Hold = { kind: 'two-hand-blade', handle: { length: 12, radius: 0.9 }, grip: 0.85, second: [0, 0.3] };
```

`resolveHold` throws on a grip outside the handle, a handle without length, or an angle over 90°.

**2. Place the item with `held`.** The call is `held(pose, skeleton, arm, { length, hold })`, with the arm's name, `length` the distance from the grip to the tip, and `rest`, `channel`, `floor` and `butt` as before (guide 05). The result carries `grip` (the palm centroid), `dir`, `handle.from` and `handle.to`, `palm`, and `second.from` and `second.to` for the other hand's range. Use this one call in the part, in its sockets and in `wield.held`, so the drawing, the sockets and the hands agree.

**3. Draw the handle round `grip`.** The point of the handle at fraction `hold.grip` is `held.grip`. The part draws the handle from `handle.from` to `handle.to`, so a sword's leather grip is centred in the palm and its guard and pommel show beyond the hand. A sword part draws its hilt from the grip to past the guard for that. `handleTooShort` measures the length the hold declares, not the length drawn: keep them equal.

**4. Register it in the catalog.** `outfitFromData` reads `wield.held` to give the hand parts their grip. `hands: 2` also moves the other arm onto the second grip.

```ts
import { held, weaponChannel, type Hold, type WieldInfo } from '@core/rig';
const SWORD: Hold = { kind: 'one-hand-blade', handle: { length: 4.4, radius: 0.75 } };
const wield: WieldInfo = { class: 'blade', hold: SWORD, held: (pose, skeleton, p) => held(pose, skeleton, p.side > 0 ? 'armR' : 'armL', { length: 26, hold: SWORD, channel: weaponChannel(p.side) }) };
```

The arm names are the humanoid's; a part for any skeleton finds the arm by `side`, as `swordHeld` does in `weapons.ts`.

**A two-handed item** says `hands: 2`, and its hold has a `second` grip, its own or its kind's (`two-hand-blade`, `axe`, `spear`, `staff`, `polearm`, `scythe`, `crossbow` and `two-hand-tool` have one). Its `wield.held` places it with that hold, as above: the engine reads the second grip from the item `held` returns, not from `wield.hold`.

```ts
import type { WieldInfo } from '@core/rig';
const wield: Pick<WieldInfo, 'class' | 'hands' | 'hold'> = { class: 'polearm', hands: 2, hold: { kind: 'staff' } };
```

A clip lets the other hand go with the `extra.secondGrip` channel, from 1 (holding) to 0 (free), keyed like any channel:

```ts
import { bump } from '@core/rig';
const extra = (t: number) => ({ secondGrip: 1 - bump(t, 0.2, 0.4) });
```

**An item on the forearm** (a shield) has no handle in the hand to place. Give `wield.grip` the hand's grip instead, with `palmGrip`. Its `behind` is the board's outward normal.

```ts
import { palmGrip, type WieldInfo } from '@core/rig';
const arm = (side: -1 | 1) => (side > 0 ? 'armR' : 'armL');
const grip: WieldInfo['grip'] = (pose, skeleton, p) => [palmGrip(pose, skeleton, arm(p.side), { axis: pose.frame.right, radius: 0.9, behind: pose.frame.forward })];
```

**A character drawn by code** (a `skin` and no outfit as data) lists what it holds in `OutfitSpec.holds`, and passes the same list to `defineCharacter({ grips: { holds } })` so its sheets are checked. A character defined from an outfit as data needs neither: `outfitHolds` and `gripSubject` read the catalog.

```ts
import type { OutfitHold, OutfitSpec } from '@core/rig';
const spec = (held: OutfitHold['held']): Pick<OutfitSpec, 'holds'> => ({ holds: [{ side: 1, held }] });
```

## 5. Hand parts: reading `PartContext.grip`

A part in the `hand` slot receives `ctx.grip` while its hand holds something: the held part's `wield.held` or `wield.grip`, or, for the other hand of a two-handed item, its second grip. An empty hand receives nothing and stays exactly as the part drew it.

| Field | Meaning |
| :--- | :--- |
| `at` | The point on the handle's axis the hand closes round: the middle of the fist |
| `axis` | Unit vector along the handle through the fist, out of the thumb's side (towards a blade's tip; towards the pommel for a reversed hold) |
| `radius` | The handle's radius there |
| `curl` | 0 (open) to 1 (closed). Capped by the handle's thickness, and lowered while a second hand lets go or the clip lets go (`Held.released`) |
| `palm` | The hand's frame on the grip (`Palm`): `along` from the wrist to the knuckles, `thumb` across it, `normal` out of the palm, `tube` the finger tube, the wrist angles `bend` and `needs`, and `limited` |
| `behind` | For a handle behind a surface (a shield's strap): the surface's outward normal. While that face is towards the camera the item covers the fist |

For a kit's hand part:

1. **No `ctx.grip`: draw what you drew before.** A kit adds closed hands without touching its open ones.
2. **Close the fist on `grip.at`, not at the wrist.** The handle runs through it along `grip.axis`. The palm faces the handle (`grip.palm.normal`), the knuckles lie along `grip.palm.along` and the thumb on the `grip.palm.thumb` side.
3. **Size the fist for `grip.radius`** and close it by `grip.curl`: a thick handle, or a hand that is letting go, closes less. At 0 it is open.
4. **Grade the fingers.** The little and ring fingers tight on the handle, the middle one moderate, the index finger and the thumb loose and expressive (§2.1): this is where a style shows.
5. **Let the fingers wrap.** Build the fist from several volumes, so the fingers in front of the handle sort in front of it and the back of the hand sorts behind. Rest a volume `on` the held part only when it is over the handle in every facing, as the sample's plain fist is.
6. **Cover the wrist.** The arm ends at the wrist joint. A cuff, a glove or the sleeve covers it, so the fist reads as part of the arm.
7. **Build from `grip`, never from the side.** The same hand holds the item in all eight facings: use `at.side` for details, not to mirror the hand.

Adding a closed hand to a part that already draws an open one takes a wrapper that passes the part's options on:

```ts
import type { Grip, Part, PartContext } from '@core/rig';
export const withFist = <O>(open: Part<O>, closed: (ctx: PartContext, grip: Grip, options: O) => void): Part<O> => (ctx, options) => (ctx.grip ? closed(ctx, ctx.grip, options) : open(ctx, options));
```

Build the closed hand once on `Grip` (a fist round `grip.at`, §5 steps 1 to 4) and call it from every hand part of the kit (a bare hand, a glove, a gauntlet) while it holds something.

## 6. The checks, and how to fix each

`defineCharacter` measures every sheet of a character whose outfit holds an item that says how it is held (`wield.held` or `wield.grip`) and writes the result to the sheet's atlas as `meta.data.grips` (guide 04). The six checks run per facing and frame, on the pose the outfit draws, with the ratios below, so the limits hold for any body and style. Each reports its worst value and the frame it is in (`<DIR>_<n>`, as in the socket table), the hand, how many frames fail and how many were measured.

| Check | It measures | An error when | Usual cause and fix |
| :--- | :--- | :--- | :--- |
| `gripGap` | The palm centroid against the point of the handle the hand holds, in hand lengths: 0 in the palm, 0.3 at the wrist | Over 0.1 (`GRIP_TOLERANCE.gap`) | The item is placed at the wrist (its `held` call has no `hold`), or the part draws it off the point `held` returned, or places it on another pose than the one drawn. Pass the hold, and place with `held` on the pose the part receives |
| `openHandHolding` | The share of frames, for the worst hand, in which a hand that holds something is given no grip, so its hand part stays open | Above 0 | The part's `wield` has neither `held` with a hold nor `grip`; or the item takes both hands and its hold has no second grip (`Hold.second`) and no `wield.grip`; or the hand is drawn by a part outside the `hand` slot (§8) |
| `wristLimit` | The wrist angle the hold needs, against the hard limit that way: 1 is at the limit | Over 1 (half a degree of slack) | Turn the item less against the forearm: the clip's `weaponYaw` and `weaponPitch`. Or turn the forearm with it (§2.1). Where the clip sets no angle the engine already turns the item to comfort, so this comes from a clip. A **warning** in idle and locomotion clips: within the limits but past the comfortable range (40° of flexion or extension, 20° of deviation), again from the clip's angles |
| `reachStretch` | The other arm's reach against its full length: 1 is straight | Over 1 (0.5% of slack, `GRIP_TOLERANCE.stretch`) | The grip a `wield.grip` names is out of reach: give the grip a range (`Hold.second`), or bring the hands closer in the clip. A **note**: a grip that slid along its range, or a hand that let go, to stay within reach |
| `gripDrift` | The handle moving in the palm between consecutive frames, in hand lengths. It measures the grip point and a point a palm along the handle, so a turn counts too | Over 0.1 (`GRIP_TOLERANCE.drift`) | The item is not placed with its hold in every frame, or the wrist is stopped at a limit and the handle turns in the fist. Fix `wristLimit` first |
| `handleTooShort` | The room on the handle: its length over a palm for each hand that holds it, and the two hands' spacing over a palm | Under 1 | Lengthen `Hold.handle.length`, or move the grips apart. A palm is `HAND.palm` × H (H/24) |

Fix them in this order: `gripGap` and `openHandHolding` mean a part is not wired; `wristLimit` is the clip or the rest; `gripDrift` usually follows it; `reachStretch` and `handleTooShort` are the hold's numbers.

`npm run inspect -- <sheet.png>` prints a `grips:` line with the number of errors, warnings and notes, a line with every check's worst value (hand, frame), then the problems, errors in red. A clean sheet prints `grips: clean`. `--json` carries the whole block. This is a slash whose clip turns the blade a little too far, worn with a round shield whose hand part declares no grip:

```text
  grips: 2 error(s)
    gap 0 (right, NW_8) · open 1 (left, S_0) · wrist 1.102 (right, NE_2) · reach - · drift 0.012 (right, NE_3) · handle 1.32 (right, S_0)
  ✖ grips: openHandHolding: the left hand holds "round-shield" but is given no grip (96 of 96 frames, first S_0), so its hand part stays open: ...
  ✖ grips: wristLimit: the right wrist needs radial deviation 22° (limit 20°) to hold its item (1.102 of its limit; 16 of 96 frames, worst NE_2): ...
```

The numbers read: the palm is on the grip everywhere (`gap 0`); the left hand is open in all frames (`open 1` is the share of frames); the right wrist asks 1.102 of its radial limit in 16 frames, the worst in NE_2; the handle is 1.32 palms long.

A test or a tool calls the checks directly, and a player reads the block from the atlas:

```ts
import { checkGrips, gripSubject, type Clip, type GearCatalog, type OutfitData, type SkeletonSpec } from '@core/rig';
export const gripErrors = (skeleton: SkeletonSpec, clip: Clip, outfit: OutfitData, catalog: GearCatalog) => checkGrips(skeleton, clip, gripSubject(outfit, catalog)).errors;
```

```ts
import type { AtlasData } from '@diorama/runtime';
export const worstWrist = (data: AtlasData) => data.grips?.wristLimit?.worst ?? 0;
```

## 7. Checklist for a held item

- Its `Hold` declares the handle as the part draws it, and one `held` call serves the drawing, the sockets and `wield.held`.
- The handle is drawn round `grip`: the guard and pommel show beyond the hand, and the grip reads as a cylinder.
- The hand parts of both sides close on `ctx.grip` and draw what they drew without it.
- The same hand holds it in all eight facings, never mirrored.
- Zoomed crops of the hand (`npm run contact -- <sheet.png> --rows S,SE,E,N --frames ... --zoom 4`): the handle runs through the fist with no gap, the fingers lie over it, and the hand reads apart from the sleeve and the item.
- `npm run inspect` prints `grips: clean`, or the report says why a finding does not apply.
- An empty hand draws exactly what it drew before: compare an unarmed character's sheets before and after a change to a hand part.

## 8. What the engine does not do yet

- **It never turns what a clip aims.** A direction the clip sets is the animator's: an item no wrist can hold there is reported, not fixed. Only the rest direction, which the engine chose, is turned to spare the wrist. A clip that aims the item against the forearm, in an attack or while the body falls, still reports `wristLimit` and often `gripDrift`.
- **The fall is not simulated.** Letting go follows the clip's channel, not physics: the item moves from the palm to the floor as the channel rises, and does not bounce or roll.
- **Only the `hand` slot is told.** A hand drawn by a part in another slot, such as an arm part that includes its hand, never receives a grip and stays open, and `openHandHolding` reports it. Put the hand in its own `hand`-slot part.
- **Old catalogs get no report.** Parts without `wield.held` or `wield.grip` are placed and drawn as before and are not checked. Add them to get closed hands and the `grips` block.
- **Some defaults are guesses.** The crossbow, the two-hand tool, the carried light, the mace, the axe's and the spear's ranges, the thrown handle's length and the radii are unsourced (§2.2). Override them with a `Hold`.
- **A hand can spin at one pose.** When the handle runs within about 1° of the forearm, the hand's roll is undefined and the hand can turn as the handle passes through.
- **The research left some questions open.** Which hand leads a naginata or a Chinese spear depends on the school; no opened source gave hand spacing for a halberd, glaive or poleaxe, the gap between a kendo player's hands or Fiore's dagger grips; the sources assume right-handed people.

## 9. Sources

Each page was opened and read during the research. Wikipedia is secondary; a forum post is opinion, and is marked.

**The hand and the wrist**
- *Vitruvian Man* (hand, palm, cubit, shoulder width): [Wikipedia](https://en.wikipedia.org/wiki/Vitruvian_Man)
- *OpenXR* (grip pose: palm centroid, palm normal, finger tube): [semantic paths](https://github.com/KhronosGroup/OpenXR-Docs/blob/main/specification/sources/chapters/semantic_paths.adoc)
- *Young 2013* (natural angle between the hand and a handle, 65° ± 7°): [Ergonomics](https://researchprofiles.kettering.edu/en/publications/the-natural-angle-between-the-hand-and-handle-and-the-effect-of-h/)
- *Enlyte* (wrist range of motion): [reference table](https://www.enlyte.com/insights/article/adjuster/understanding-normal-range-motion-joint-functionality)
- *Chung 1986* (measured wrist range, 120 adults): [J Korean Orthop Assoc](https://synapse.koreamed.org/articles/1122791)
- *Ryu 1991* (functional ranges of the wrist): [J Hand Surg](https://mayoclinic.elsevierpure.com/en/publications/functional-ranges-of-motion-of-the-wrist-joint/)
- *Human Factors 2007* (wrist posture and carpal tunnel pressure): [CDC](https://stacks.cdc.gov/view/cdc/185869)
- *Frontiers 2022* (wrist posture for the strongest power grip): [Frontiers in Rehabilitation Sciences](https://www.frontiersin.org/journals/rehabilitation-sciences/articles/10.3389/fresc.2022.1017354/full)
- *Queen's* (functional position, handle sizes): [occupational medicine module](https://queenshealthsci.elentra.cloud/community/carpaltunnelsyndrome:occupational_medicine/hand_tools)
- *CCOHS* (handle diameter and length): [hand tool design](https://ccohs.ca/oshanswers/ergonomics/handtools/tooldesign.html)
- *Dart-thrower's motion*: [PMC6428652](https://pmc.ncbi.nlm.nih.gov/articles/PMC6428652)
- *Musashi*: [Wikiquote](https://en.wikiquote.org/wiki/Miyamoto_Musashi). *Meyer 1570*: [swordfight.uk](https://swordfight.uk/gripping-the-sword/). *Kendo tenouchi*: [Higashi Yoshimi](https://kendojidai.com/2022/09/05/tenouchi-and-sae-higashi-yoshimi/). *HROARR grips*: [how to grip a sword](https://hroarr.com/how-do-you-grip-a-sword/)

**Items by kind**
- *Albion* (Oakeshott types, grip lengths): [article](https://albion-swords.com/articles/oakeshott-typology.htm). *Longsword*: [Wikipedia](https://en.wikipedia.org/wiki/Longsword)
- *Knife fighting* (grip names): [Wikipedia](https://en.wikipedia.org/wiki/Knife_fighting). *Meyer's dagger*: [HROARR](https://hroarr.com/article/joachim-meyers-dagger-system/)
- *Ringeck gloss*: [Wiktenauer](https://www.wiktenauer.com/wiki/User:Christian_Trosclair/Translations/3227a_Longsword). *ARMA forum* (opinion): [thread](https://thearma.org/forum/viewtopic.php?p=34413)
- *Scout Life* and *Art of Manliness* (axe): [Scout Life](https://scoutlife.org/outdoors/157237/how-to-use-an-ax-to-chop-wood/), [Art of Manliness](https://www.artofmanliness.com/skills/outdoors/a-primer-on-the-ax-how-to-use-an-ax-safely-and-effectively/)
- *KungFuToday* and *FlashMavi* (spear): [KungFuToday](https://www.kungfutoday.com/introduction-to-the-spear-the-king-of-all-weapons/), [FlashMavi](https://www.flashmavi.com/learn/stabn-block-wushu-spear-technique)
- *Quarterstaff*: [Wikipedia](https://en.wikipedia.org/wiki/Quarterstaff). *McCarthy*: [EJMAS](https://ejmas.com/jmanly/articles/2001/jmanlyart_mccarthy_0901.htm). *Inside Kung-Fu*: [staff column](https://plumblossom.net/Articles/Inside_Kung-Fu/Nov2005/index.html)
- *Naginata*: [ouhs-athletics.jp](https://ouhs-athletics.jp/budo-tourism/terms/naginata/)
- *Scythe*: [Wikipedia](https://en.wikipedia.org/wiki/Scythe). *Scythe ergonomics* (opinion): [permies](https://permies.com/mobile/t/48746/scythes/scythe-ergonomics)
- *GoHunt* and *Bow International* (bow hand): [GoHunt](https://www.gohunt.com/browse/tips-and-tricks/archery/how-to-hold-a-bow), [Bow International](https://www.bow-international.com/?p=1802). *Archery*: [Wikipedia](https://en.wikipedia.org/wiki/Archery)
- *Bowhunter-ed* (crossbow): [holding the crossbow](https://www.bowhunter-ed.com/hawaii/studyGuide/Holding-the-Crossbow/301012_2405/)
- *Buckler*: [Wikipedia](https://en.wikipedia.org/wiki/Buckler). *I.33 guards*: [ARMA](https://www.thearma.org/Manuals/I33-guards.html)
- *Strapped shield*, *Kite shield*, *Heater shield*: [Strapped shield](https://en.wikipedia.org/wiki/Strapped_shield), [Kite shield](https://en.wikipedia.org/wiki/Kite_shield), [Heater shield](https://en.wikipedia.org/wiki/Heater_shield)
- *Baton* (a wand's closest analogue): [Wikipedia](https://en.wikipedia.org/wiki/Baton_(conducting))
- *Rutgers gardening* (long-handled tools): [NJAES](https://burlington.njaes.rutgers.edu/2021/04/24/ergonomics-for-gardeners-part-2/)
- *Javelin throw*: [Wikipedia](https://en.wikipedia.org/wiki/Javelin_throw)
- *Dual wield*: [Wikipedia](https://en.wikipedia.org/wiki/Dual_wield). *Baldric*: [Wikipedia](https://en.wikipedia.org/wiki/Baldric). *Dory*: [Wikipedia](https://en.wikipedia.org/wiki/Dory_(spear)). *Pike*: [Wikipedia](https://en.wikipedia.org/wiki/Pike_(weapon))

**Engines and tools**
- *Spine two-handed* (a weapon held in two hands): [Esoteric Software](https://en.esotericsoftware.com/blog/Holding-a-two-handed-weapon). *Spine IK*: [constraints](https://en.esotericsoftware.com/spine-ik-constraints)
- *Unity two-bone IK*: [Animation Rigging](https://docs.unity3d.com/Packages/com.unity.animation.rigging@1.3/manual/constraints/TwoBoneIKConstraint.html). *Unity grab*: [XR Grab Interactable](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.0/manual/xr-grab-interactable.html)
- *Unreal two-bone IK*: [animation blueprint](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-blueprint-two-bone-ik-in-unreal-engine)
- *Godot two-bone IK*: [SkeletonModification2DTwoBoneIK](https://docs.godotengine.org/en/latest/classes/class_skeletonmodification2dtwoboneik.html). *Godot grab points*: [XR Tools](https://github.com/godotvr/godot-xr-tools/blob/docs/_docs/objects/grab_point.md)
- *Meta hand grab*: [Interaction SDK](https://developers.meta.com/horizon/documentation/unity/unity-isdk-hand-grab-interaction/). *SteamVR input*: [Skeletal Input](https://github.com/ValveSoftware/openvr/wiki/SteamVR-Skeletal-Input)
- *gamedev.tv IK*: [hand placement](https://www.gamedev.tv/articles//using-inverse-kinematics-for-hand-placement/)

**Sprite conventions**
- *OGA builder*: [16x16 RPG builder](https://opengameart.org/node/135995). *Nuclear Throne hands*: [hands mod](https://splattie.itch.io/hands-mod)
- *LPC*: [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
- *OpenDiablo2 COF*: [cof.go](https://raw.githubusercontent.com/OpenDiablo2/OpenDiablo2/master/d2common/d2fileformats/d2cof/cof.go). *FLARE layers*: [hero_layers.txt](https://raw.githubusercontent.com/flareteam/flare-game/master/mods/fantasycore/engine/hero_layers.txt)
- *Spineboy*: [spineboy-pro.json](https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples/spineboy/export/spineboy-pro.json)
- *Pixelblog 55*: [top-down character animation](https://www.slynyrd.com/blog/2025/3/24/pixelblog-55-top-down-character-animation). *Pixelblog 56*: [attack animation](https://www.slynyrd.com/blog/2025/5/23/pixelblog-56-top-down-character-attack-animation). *Pixelblog 58*: [part 3](https://www.slynyrd.com/blog/2025/10/2/pixelblog-58-top-down-character-animation-part-3)
