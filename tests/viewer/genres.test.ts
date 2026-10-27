import assert from 'node:assert/strict';
import { SPACE_PRESETS } from '@core/volume';
import { GENRES, genreSizes } from '../../viewer/src/lib/genres';
import { createTranslator } from '../../viewer/src/i18n/core';

console.log('🧪 Checking the kinds of game the New dialog offers...\n');

// 1. Every preset of the engine, in its order: one the engine adds shows up in the dialog.
assert.deepEqual(GENRES, Object.keys(SPACE_PRESETS));

// 2. What a preset sets, from its own numbers, in each language (the decimal mark is the language's).
const en = createTranslator('en');
const pt = createTranslator('pt-BR');
assert.equal(genreSizes('jrpg', en), 'A cell is 0.6\u00a0× the character\'s height; walls 1.25\u00a0×, doors 1.15\u00a0×, fences 0.55\u00a0×. Walls stand on the borders between cells.');
assert.equal(genreSizes('tactics', pt), 'Uma célula tem 1\u00a0× a altura do personagem; paredes 0,9\u00a0×, portas 1,1\u00a0×, cercas 0,45\u00a0×. As paredes ficam no meio das suas células.');
for (const genre of GENRES) {
  const { ratios } = SPACE_PRESETS[genre];
  assert.ok(genreSizes(genre, en).includes(`walls ${ratios.wall}\u00a0×`), `${genre}: the text says the preset's own wall height`);
  for (const t of [en.t, pt.t]) {
    assert.ok(t(`genres.${genre}.label`) && !t(`genres.${genre}.label`).startsWith('genres.'), `${genre} has a name`);
    assert.ok(t(`genres.${genre}.description`).length > 40, `${genre} has a description`);
  }
}

console.log('✅ Kind of game checks passed');
