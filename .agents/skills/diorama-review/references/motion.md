# Motion principles for animated assets

Applies to any asset with `frames > 1`: props (chests, doors, levers, flames, banners) and characters and creatures (`@core/rig`, see the diorama-rig skill). These rules were checked with per-frame measurements; numbers are at 60 Hz unless noted. They fit any action: a swing, a wave, a pick-up, a lid opening.

## Loops and timing

- Sample loops at `t = frameIndex / frameCount`. Never include `t = 1`: it repeats frame 0 and makes a visible hitch.
- Every periodic motion must complete a whole number of cycles per loop (a flame flicker of 2 cycles and a bob of 1 both close the loop).
- Typical counts: idle 6–12 frames, walk 8, run 6–8, dash 4–6, attacks 6–12 (*convention*). Derive 6- and 4-frame walks from 8 by skipping frames so contacts are kept. Source: <https://opengameart.org/forumtopic/lpc-walk-cycle-with-varying-speed>
- Playback speed is **fps = frames ÷ seconds**, independent of the game's frame rate. Hand-timed clips (idles, emotes, hits) read well at 8–12 fps. Locomotion plays at frames × cadence, usually 12–20 fps (a humanoid walk at 8 frames is about 12 fps, a run about 16). Fast strikes may reach 24–30 fps: their few strike frames are what sell the speed. Choose frames from these targets, never the other way round (*convention*).
- Determinism: no `Math.random`, no wall-clock time (`npm run check` reports both). Simulations (hair, cloth, chains) step at a fixed rate from an identical start, with a pre-roll so they have settled by frame 0. Source: <https://gafferongames.com/post/fix_your_timestep/>

## Strong moves: anticipation, strike, hold, settle

Every deliberate action (a lid flipping open, a lever, a swing) follows the same rhythm:

1. **Anticipation**, eased in and out. Even one frame helps; the player's own actions keep it short, enemies telegraph longer. Source: <https://80.lv/articles/tips-on-making-fluid-and-powerful-animations>
2. **Apex hold**, about 2 frames with a small creep so the pose never goes dead.
3. **Strike**, 2–3 frames with an ease-out, going 15–20° past the target (overshoot). A cubic ease over 2 frames puts ~80% of the motion in one frame and reads as a teleport; spread it over 3 frames with a quadratic ease.
4. **Extreme hold**, about 3 frames, still creeping slightly. A hold of zero velocity for many frames reads as frozen.
5. **Settle** back to the target, then an eased recovery.

Source for overshoot and holds: <https://babel.speldesign.uu.se/?p=113918>

## Smears

- At most one smear per strike (two for a charged one), placed mid-strike between the two strong poses, never on the impact or extreme frame. Source: <https://slynyrd.com/blog/2018/9/8/pixelblog-9-melee-attacks>
- Shape it as a crescent that is widest at the current position and tapers to a point at the oldest, fading in alpha. Interpolate the moving part between samples (rotate, do not spline the tips) or fast arcs kink.

## Secondary motion and transitions

- Overlapping parts (forearms, cloth, flames) trail the main motion; a phase offset of 1–2 frames between symmetric parts removes stiffness.
- Springs on everything make the whole object feel like rubber. Use them on loose parts only (cloth, hair, chains), never on structural ones.
- Switching between actions blends out the old pose and its velocity with a critically damped spring (inertialization, 0.05–0.1 s half-life), not a linear cross-fade, which pops at both ends. Sources: <https://www.gdcvault.com/play/1025165/Inertialization>, <https://theorangeduck.com/page/spring-roll-call>

## Locomotion (characters and creatures)

- Feet are planted at world points and only move while swinging; the gait phase advances with ground distance (including pushes), so nothing slides. Ground speed = stride × cadence ÷ duty factor. Source: <https://shengyugames.com/devlog/two-bone-ik-stick-figure-animation>
- Duty factor about 0.6 walking and 0.32–0.4 running (a clear flight phase). Walking keeps the torso upright; a forward lean reads as a hunch from a high camera.
- Swings leave and land with zero vertical speed; a running swing lifts the heel early, then drives forward.
- Two-bone IK clamps reach and eases in near full extension so knees never snap straight; re-solve limbs after any blend so bone lengths stay exact.

## How to check motion

Export, then review frame by frame: a contact sheet per facing, a zoom of the parts that move, and the same frames side by side before and after a change (`npm run contact -- <a.png> --with <b.png>`, see the diorama-review skill). Measure what can be measured (slides, bone lengths, per-frame speed of the moving part) and say what still needs to be judged in motion.
