/**
 * Clip keys of a character: `defineCharacter` infers them from `clips`, so `character.sheet('<key>')`
 * with a key the character does not declare is a type error in the sheet file (issue #4).
 *
 * This file is part of the repository's tsc project (tsconfig.json `include`), so `npx tsc --noEmit -p .`
 * checks the type half: every `// @ts-expect-error` below must still be an error (tsc reports an
 * unused one) and every other line must compile. The runtime half runs with the other engine tests.
 */

import assert from 'node:assert/strict';
import { Camera } from '../../core/volume/index.js';
import {
  defineCharacter,
  humanoid,
  idle,
  locomotion,
  slash,
  type Character,
  type CharacterClip,
  type ClipKey,
  type OutfitCharacterInfo,
} from '../../core/rig/index.js';

/** Compile-time assertions: `Expect<Equal<A, B>>` fails to compile unless A and B are the same type. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const h = humanoid();
const base = { skeleton: h, skin: () => {}, camera: new Camera(), width: 8, height: 8, pivot: { x: 4, y: 8 } };

// 1. An object literal of clips: its keys are the only ones `sheet` accepts, in any clip form.
{
  const character = defineCharacter({
    ...base,
    name: 'literal',
    clips: {
      idle: idle(h),
      walk: { clip: locomotion(h, 'walk'), frames: 12 },
      'slash-wide': { clip: slash(h), wields: { main: ['blade'] } },
    },
  });
  type Keys = ClipKey<typeof character>;
  type Declared = Expect<Equal<Keys, 'idle' | 'walk' | 'slash-wide'>>;
  const sheets = [character.sheet('idle'), character.sheet('walk'), character.sheet('slash-wide')];
  assert.deepEqual(sheets.map(s => (s.data as { key: string }).key), ['idle', 'walk', 'slash-wide']);
  // @ts-expect-error 'run' is not one of the character's clips
  assert.throws(() => character.sheet('run'), /character "literal" has no clip "run" \(clips: idle, walk, slash-wide\)/, 'an undeclared key still throws at run time');
  // @ts-expect-error a typo in the key
  assert.throws(() => character.sheet('wlak'), /no clip "wlak"/);
  // @ts-expect-error not even a string
  assert.throws(() => character.sheet(3), /no clip "3"/);
  // The union is usable on its own.
  const frameOf: Record<ClipKey<typeof character>, number> = { idle: 8, walk: 12, 'slash-wide': 8 };
  assert.equal(Object.keys(frameOf).length, character.manifest.clips.length, 'ClipKey lists exactly the clips of the manifest');
}

// 2. A rig spec typed with `satisfies` keeps its keys through the spread (the sample's guard, Malvek and captain).
{
  const SPEC = {
    label: 'Spec Warden',
    skeleton: h,
    camera: new Camera(),
    width: 8,
    height: 8,
    pivot: { x: 4, y: 8 },
    clips: { idle: idle(h), slash: { clip: slash(h), frames: 12 } },
  } satisfies Omit<OutfitCharacterInfo, 'id' | 'outfit'>;
  const character = defineCharacter({ ...SPEC, name: 'spec', skin: () => {} });
  type Declared = Expect<Equal<ClipKey<typeof character>, 'idle' | 'slash'>>;
  assert.equal(character.manifest.label, 'Spec Warden', 'the spec\'s label is the manifest\'s, so the kit and the exports name it alike');
  assert.equal(character.sheet('slash').width, 8);
  // @ts-expect-error not declared in the spec
  assert.throws(() => character.sheet('walk'), /no clip "walk"/);
}

// 3. Clips that are not an object literal fall back to string keys: any key compiles, a wrong one throws at export.
{
  const clips: Record<string, CharacterClip> = { idle: idle(h), walk: locomotion(h, 'walk') };
  const widened = defineCharacter({ ...base, name: 'widened', clips });
  type Widened = Expect<Equal<ClipKey<typeof widened>, string>>;
  assert.equal((widened.sheet('walk').data as { key: string }).key, 'walk');
  assert.throws(() => widened.sheet('run'), /no clip "run"/);
  // What new-outfit-character writes: the clips are filtered and rebuilt with Object.fromEntries.
  const usable = ['idle', 'walk'];
  const rebuilt = defineCharacter({ ...base, name: 'rebuilt', clips: Object.fromEntries(usable.map(key => [key, clips[key]])) });
  type Rebuilt = Expect<Equal<ClipKey<typeof rebuilt>, string>>;
  assert.equal((rebuilt.sheet('idle').data as { key: string }).key, 'idle');
  // OutfitCharacterInfo (what CHARACTERS lists) types its clips as a Record<string, ...>: spreading it falls back too.
  const info: Omit<OutfitCharacterInfo, 'id' | 'label' | 'outfit'> = { ...base, clips };
  const fromInfo = defineCharacter({ ...info, name: 'from-info', skin: () => {} });
  type FromInfo = Expect<Equal<ClipKey<typeof fromInfo>, string>>;
  assert.equal(fromInfo.sheet('idle').frames, 8);
}

// 4. A character with keys is still a Character: code that holds characters with different clips type-checks as before.
{
  const a = defineCharacter({ ...base, name: 'a', clips: { idle: idle(h) } });
  const b = defineCharacter({ ...base, name: 'b', clips: { idle: idle(h), walk: locomotion(h, 'walk') } });
  const all: Character[] = [a, b];
  assert.deepEqual(all.map(c => c.manifest.name), ['a', 'b']);
  const named: Character<'idle' | 'walk'> = b;
  assert.equal(named.sheet('walk').frames, 8);
}

console.log('✔ Clip keys: defineCharacter infers them and character.sheet type-checks them.');
