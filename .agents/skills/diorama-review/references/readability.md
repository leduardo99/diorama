# Readability of 2.5D assets

Judgment rules for the 3/4 camera. Numbers marked *convention* come from practice, not from a published source.

## Silhouette first

- The black silhouette of every facing must identify the object (Riot's "who's this champ" test). Big shapes that blur the contour (oversized hats, capes, wide trims) are the usual culprits. Source: <https://www.leagueoflegends.com/en-us/news/dev/ask-riot-let-s-talk-clarity/>
- Pick one **primary feature** per design that no variant may hide, and let secondary features vary. Palette variants change colors only, never the shape language (same source).
- Keep one asymmetric element that shows which way the object faces (a lock and hinges, a tool in one hand, a crest or a feather). Asymmetric designs need every direction rendered; mirroring swaps the sides. Source on mirrored sides: <https://forums.kleientertainment.com/forums/topic/44706-help-how-to-have-different-art-for-right-looking-face-and-left-looking-face-aka-when-your-character-is-turned-right-or-left/>

## Value and contrast

- Desaturate the export: adjacent parts that merge into one gray read as one blob. *Convention:* aim for a lightness gap of about 15–20 L* between adjacent zones and between the object and the floor it will stand on.
- The playfield is usually calmer and lower in contrast than the actors on it, so they read against it. Whether it is darker or paler is the style's choice. Source: <https://bugnet.io/blog/readable-game-art-why-clarity-beats-detail>
- The project light picks lit, base and dark tones automatically. If a part looks flat in every facing, its ramp is too narrow, not the light.

## Proportions for the camera

- With a 48° tilt, vertical parts project at cos 48° ≈ 0.67 and depth at sin 48° ≈ 0.74. The camera's `heightBoost` (1.2) compensates; do not stretch by hand as well.
- Movement towards or away from the camera points along the view and nearly vanishes. Make motion read with a lateral component: knees open slightly, arms cross towards the body, hips roll. Diagonals and profiles read best; front and back need the most care.
- Small sprites need bigger heads, hands and held items than real proportions (*convention*: held items and hands 15–30% larger at 100–160 px characters; heads 1/5–1/6 of the height). Source on small sprites: <https://gamedev.net/forums/topic/625955-pixel-art-sprite-proportions-and-size/4946717>

## Faces and details

- Details sit on surfaces as decals and vanish when the surface turns away; put the identifying detail on a surface seen from most facings (top or front), or repeat it.
- Texture density is tuned at the export size. One texture family per surface; noise reads as dirt, not material.
