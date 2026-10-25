import { createStore } from '@tanstack/react-store';
import type { Cell } from './edit';

/**
 * What the canvas reports while it is used: the cell under the pointer (many times a second), how long the last
 * drawing took, the error it threw, whether a prop is being carried and the size of its box. It lives in a store, not in the painter's state: only the readouts that show
 * one of these re-render when it changes, and the painter does not re-render at every pointer move.
 */
export interface CanvasStatus {
  hover: Cell | null;
  ms: number | null;
  error: string | null;
  /** A prop is being carried: the popover over the selection steps aside until it lands. */
  dragging: boolean;
  /** The canvas's box (CSS px, scrollbars included), which Fit fits the drawing in; null until measured. */
  view: { width: number; height: number } | null;
}

export const createCanvasStatus = () => createStore<CanvasStatus>({ hover: null, ms: null, error: null, dragging: false, view: null });
export type CanvasStatusStore = ReturnType<typeof createCanvasStatus>;
