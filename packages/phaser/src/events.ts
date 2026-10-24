/** The events the binding emits: a character and the plugin's `events` emit `clip`, the plugin's `events` the effects' ones. */
export const EVENTS = {
  /** `(event: ClipEvent, character: DioramaCharacter)`: an event of a character's clip (`hit`, `release`, `step:legL`, `start`, `end`...). */
  CLIP: 'clip',
  /** `(fx: Fx)`: an effect starts, cued by a clip's event or played where a projectile ended. */
  FX_START: 'fxstart',
  /** `(event: FxEvent)`: an effect's event: its sheet's own (`hit` on an impact's frame), a projectile's `hit` where it ended, `end`. */
  FX: 'fx',
} as const;
