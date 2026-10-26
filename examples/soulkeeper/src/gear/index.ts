/**
 * The gear kit of Soulkeeper: reusable parts for the `humanoid()` skeleton, written once from the
 * Ossuary guard (see `docs/guides/rig/05-gear-and-outfits.md`). A character is an outfit of these
 * parts, saved as data (`characters/<name>/outfit.ts`) and drawn with `outfitFromData(OUTFIT,
 * CATALOG)`; `catalog.ts` lists every part, its slots, material roles and options, the base body
 * and the characters an outfit can be put on (the viewer's customizer and `new-outfit-character`
 * read it). Import the parts from this index (`../gear` from another kit or a character); the catalog is its
 * own module because it also imports the characters' rigs.
 *
 * Parts by family, with the slot each is made for:
 * - `bodies.ts`: `boneLeg` (thigh), `boneSpine` and `ribCage` (chest), `boneArm` (shoulder), `boneHand`
 *   (hand: an open palm, a fist round what it holds), and `boneLegs`, the base body of both legs (it
 *   receives the outfit's materials);
 * - `flesh.ts`: `fleshHead` (head, with a face that reads `extra.brow`, `extra.mouth` and
 *   `extra.eyes`, and a resting face set by its options), `fleshTorso` (chest), `fleshArm`
 *   (shoulder), `fleshHand` (hand), `fleshLeg` (thigh), `hairCrop`, `hairTail` and `hairWaves`
 *   (head), and `fleshLegs`, the base body of a living figure; all of it follows the skeleton's scale;
 * - `clothes.ts`: `hood` (head), `cloak` (back), `apron` (pelvis), `shawl` (chest), `boot` (foot),
 *   `glove` (hand), `fittedSleeve` (shoulder) and `leggings` (thigh), the soft garments a living body wears;
 * - `heads.ts`: `boneSkull`, `skullSutures`, `hornedHelm` and `fireCrown` (head), `headFrame`;
 * - `crests.ts`: `helmCrest` (head, resting on a helm);
 * - `shoulders.ts`: `lamedPauldron` and `skullPauldron` (shoulder);
 * - `torso.ts`: `tunic`, `tabard` and `longCoat` (pelvis), `baldric` (shoulder), `coatTorso`,
 *   `ribBreastplate` and `highCollar` (chest), `coatRing`, the coat's section at a height;
 * - `garments.ts`: `belt`, `pouch`, `sashTail`, `skullBuckle` and `grimoire` (pelvis), `greave` and
 *   `legWraps` (shin), `bracer` (forearm), `coatSleeve` (shoulder);
 * - `plate.ts`: `wingedHelm` (head, resting on the hair or the head), `cuirass` (chest), `platePauldron`
 *   (shoulder), `tassets` (pelvis), `plateVambrace` (forearm) and `plateGreave` (shin), plate with
 *   gilded edges for the flesh body;
 * - `shields.ts`: `roundShield` (forearm), `shieldDisc`, and the hand on its grip (`shieldGrip`, `SHIELD_HOLD`);
 * - `weapons.ts`: `notchedSword` (hand), `swordHeld`, `SWORD_HOLD` and `SWORD_HILT`; `reaperScythe`,
 *   `scytheFist` and `soulLantern` (hand), `snathHeld`, `scytheHeld`, `SCYTHE_HOLD` and the
 *   `SCYTHE_REST_*` constants; `spear` and `spearFist` (hand), `spearHeld`, `spearHold`, `SPEAR` and the
 *   `SPEAR_REST_*` constants. Each weapon's hold puts its grip in the palm; the hand parts (`boneHand`,
 *   `fleshHand`, `glove`) close into a plain fist round it (`closedHand` in `util.ts`) when the outfit
 *   tells them their hand holds it (`ctx.grip`);
 * - `effects.ts`: `weaponSmear`, `chargedEdge`, `groundShockwave` (hand, resting on the blade),
 *   `scytheSmear` (hand, resting on the snath) and `palmFlame` (hand), `palmPoint`;
 * - `wings.ts`: `spiritWings` (back), spectral wings of soul fire, spread by `extra.wings`;
 * - `fire.ts`: the flat soul flame every fire part paints (`paintFlame`, `flamePath`, `paintEmber`);
 * - `catalog.ts`: `CATALOG` (parts, bases, materials) and `CHARACTERS`, as editors see the kit.
 *
 * Material roles the parts read (an outfit maps each to a theme material):
 * - `metal`: helm, crest comb, pauldron, greave, bracer, shield rim and boss, sword guard and pommel, buckle,
 *   the plate of `plate.ts`, the spear's ferrule and socket;
 * - `trim` (optional): the gilded edges of the plate and the spear's bands (`metal` when not set);
 * - `plume` (optional): the crest's horsehair (`clothAccent`, then `cloth`, when not set);
 * - `blade`: the blade and the spear's head (falls back to `metalAccent`, then `metal`);
 * - `cloth`: tunic, fitted sleeves; `clothAccent`: tabard, the painted band of the shield;
 * - `leather`: belt, pouch, baldric, wraps, sword grip, boots, gloves, leggings, the fist on the spear (`skin` without it);
 * - `cloak` (optional): the cloak's fall (`cloth` when not set);
 * - `wood`: shield disc, the spear's shaft; `woodSeam` (optional): its plank seams, `woodDark` of the theme when not set;
 * - `bone`: skull, jaw, teeth, horns; `boneLimb`: limb bones, spine, ribs (falls back to `bone`);
 * - `boneGroove` (optional): the flat grooves carved into bone (cranial sutures), `hollow` when not set;
 * - `skin`: the living body (flesh parts); `hair`: brows and hair parts;
 * - `hollow`: inside of the rib cage, mouth and sockets;
 * - `glow`: soul fire, for eyes, runes, the fire effects and the spirit wings;
 * - the long coat also reads `cloth` (coat, collar, sleeves), `clothAccent` (sash tail, grimoire cover),
 *   `leather` (the belt it wears), `wood` (the snath) and `metal` (pauldron shell, scythe fittings,
 *   lantern cage, chain).
 *
 * Parts never import `VOLUMES`; a missing role stops the export with an error that names it.
 */

export * from './bodies';
export * from './clothes';
export * from './flesh';
export * from './heads';
export * from './crests';
export * from './shoulders';
export * from './torso';
export * from './garments';
export * from './plate';
export * from './shields';
export * from './weapons';
export * from './effects';
export * from './wings';
export { paintEmber, paintFlame, flamePath, type FlameOptions } from './fire';
export { role, type NoOptions } from './util';
