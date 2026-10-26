/**
 * @core/rig - Procedural skeletons, gaits and clips for characters and creatures
 *
 * Skeletons are data (a trunk, legs with or without a foot segment, arms, tails), so a
 * humanoid, a quadruped or an invented creature use the same engine. Clips turn normalized
 * time into a drive; `solvePose` turns a drive into joints; a project skin draws the joints
 * with `@core/volume` parts; `defineCharacterAsset` exports directions × frames with the
 * clip's ground speed and events.
 */

import '../draw/index.js';

export { defineSkeleton, type SkeletonSpec, type TrunkJoint, type LegSpec, type ArmSpec, type TailSpec, type Local } from './skeleton.js';
export { footCycle, groundSpeed, strideWarp, type GaitSpec } from './gait.js';
export { twoBone, ikReach } from './ik.js';
export { solvePose, partFrame, type Drive, type ArmDrive, type TailDrive, type Pose } from './pose.js';
export { locomotion, idle, defineClip, restFeet, categoryOf, stepEvent, spawnEvent, EVENTS, LOCOMOTION_KINDS, type ActionKind, type Clip, type ClipEvent, type IdleOptions } from './clips.js';
export { humanoid, quadruped, slash, bite, hit, death, jump, dodge, stepsAlong, type HitOptions, type JumpOptions, type DodgeOptions } from './presets.js';
export { track, beat, bell, bump, BEAT, linear, smooth, easeOutCubic, easeInCubic, easeOutQuad, type Ease, type Key, type Beat } from './tracks.js';
export { checkClip, checkGrips, gripSubject, GRIP_TOLERANCE, type ClipCheck, type GripCheck, type GripMeasure, type GripSubject } from './verify.js';
export {
  defineCharacter,
  defineCharacterAsset,
  drawCharacterFrame,
  mannequinSkin,
  ringsAlong,
  along,
  type Character,
  type CharacterOptions,
  type ClipKey,
  type CharacterClip,
  type ClipWields,
  type CharacterManifest,
  type EffectCue,
  type ManifestClip,
  type SocketFn,
  type SocketTable,
  type Skin,
  type SkinKit,
  type CharacterAssetOptions,
  type CharacterView,
} from './character.js';
export {
  bodyFrames,
  chestJoint,
  slotFrame,
  slotsOf,
  isPairedSlot,
  isHandSlot,
  weaponChannel,
  partKind,
  partRequires,
  held,
  outfit,
  outfitFromData,
  outfitHolds,
  holdPose,
  holdsMoveArms,
  validateOutfit,
  type GearCatalog,
  type PartInfo,
  type PartKind,
  type WieldInfo,
  type WieldSocket,
  type WieldHeld,
  type WieldGrip,
  type PartOption,
  type BaseInfo,
  type OutfitData,
  type OutfitCharacterInfo,
  type BodyFrames,
  type Slot,
  type SlotFrame,
  type HeldOptions,
  type Held,
  type MaterialSet,
  type Part,
  type PartContext,
  type OutfitPiece,
  type OutfitSpec,
  type OutfitHold,
  type HoldPose,
} from './gear.js';
export {
  HAND,
  WRIST,
  HOLD_KINDS,
  HOLD_DEFAULT,
  GRIP_SLACK,
  resolveHold,
  handSize,
  palmFrame,
  palmGrip,
  heldGrip,
  curlFor,
  secondHand,
  restAxis,
  type Hold,
  type HoldKind,
  type HoldDefaults,
  type ResolvedHold,
  type WristAngles,
  type Palm,
  type Grip,
  type SecondHand,
} from './grip.js';
export { wieldOf, wieldsOf, checkWield, weaponSockets, type Wielded, type WieldCheck } from './wield.js';
export { swapCandidates, swapBlocker, swapPiece, equipPart, removePiece, type OutfitEdit, type SwapBlocker } from './outfit-edit.js';
export { defineGearAsset, type GearAssetOptions } from './gear-asset.js';
export { defineItemIcon, validateItems, itemRng, type ItemIconData, type ItemInfo, type ItemCatalog, type ItemPiece, type ItemContext, type Rarity, type IconBox, type ItemIconOptions } from './items.js';
