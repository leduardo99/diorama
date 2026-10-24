/**
 * Diorama - Core Noise Utilities
 *
 * A seeded wrapper around simplex-noise (wobbly outlines and displacement in `@core/draw`)
 * and the Bayer matrix used by the 'dither' antialiasing mode of assets.
 */

import { createNoise2D as baseCreateNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { createRng } from './random.js';

export type { NoiseFunction2D };

/**
 * Creates a simplex noise function of x and y, with an optional seed.
 * Returns values roughly in range [-1, 1].
 */
export function createNoise2D(seed?: number | string): NoiseFunction2D {
  if (seed === undefined) {
    return baseCreateNoise2D();
  }
  const rng = createRng(seed);
  return baseCreateNoise2D(rng.random);
}

/** The 4x4 Bayer threshold matrix, normalized to (0, 1), used for ordered dithering. */
export const BAYER_4X4: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map(row => row.map(v => (v + 0.5) / 16));
