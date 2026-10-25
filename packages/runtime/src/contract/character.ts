/** The character manifest every sheet of a character repeats (`meta.data.character`, contract §4). */

import type { AtlasEvent } from './atlas.js';

/** One clip of the manifest: its key (the sheet's file name), kind, timing, ground speed, events and root motion. */
export interface ManifestClip {
  key: string;
  name?: string;
  kind: string;
  category: string;
  tags: string[];
  loop: boolean;
  hold: boolean;
  seconds: number;
  frames: number;
  fps: number;
  groundSpeed: number;
  events: AtlasEvent[];
  travel?: number[];
  /** The classes of held parts, by hand, the clip is made for (`core/rig` `ClipWields`); none suits anything. */
  wields?: { main?: string[]; off?: string[] };
  /** False when the clip is made for something the character does not hold: it is left out of `controls` and must not be played. */
  usable?: boolean;
}

/** An effect a character plays on an event of one of its clips (docs/guides/rig/04-atlas-contract.md §4). */
export interface EffectCue {
  /** The clip event ('release', 'hit', 'cast', 'land', 'step:left'), or 'start' / 'end' of the clip. */
  on: string;
  /** The effect's id: its sheet is `vfx/<id>`. */
  effect: string;
  /** The socket it starts at; default the socket of a `spawn:<socket>` event on the same frame, else 'center'; 'feet' is the pivot on the floor. */
  at?: string;
  motion?: 'fly' | 'follow' | 'stay';
}

/** A part held in one hand: the gear part, its class ('blade', 'staff') and how many hands it takes. */
export interface WieldHand {
  part: string;
  class: string;
  hands: 1 | 2;
}

/** Every sheet of a character repeats this: reading any one of them describes them all. */
export interface CharacterManifest {
  /** The character's id ('ossuary-guard'). */
  name: string;
  /** The name to show ('Ossuary Guard'). Older atlases have none: show `name`. */
  label?: string;
  skeleton?: string;
  /** The cell's logical size and the pivot in it. */
  cell?: { width: number; height: number };
  pivot?: { x: number; y: number };
  scale: number;
  directions: string[];
  /** The camera the sheets were rendered with: `tilt` in degrees above the ground plane. */
  camera?: { tilt: number; heightBoost?: number };
  sockets: string[];
  clips: ManifestClip[];
  controls: { idle?: string; move: string[]; actions: Partial<Record<string, string[]>> };
  /** Effects to play on clip events, by clip key. */
  effects?: Record<string, EffectCue[]>;
  /** What the outfit holds in each hand (`wield`), when the character was made from one. */
  wield?: { main?: WieldHand; off?: WieldHand };
  warnings?: string[];
}
