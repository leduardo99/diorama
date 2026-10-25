import { useEffect, useEffectEvent } from 'react';

/** A select (its button or its open list) keeps the arrows, Enter and Space for itself: choosing a language must not also move the list behind it. */
const SELECT_PARTS = '[data-slot="select-trigger"], [data-slot="select-content"]';

/** True when the key press belongs to a text field or an open select and must not trigger a shortcut. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.closest(SELECT_PARTS) !== null;
}

/** A modal dialog or sheet (the shortcuts window, a confirmation), or an open menu (its arrows and letters pick an item); not a popover, which can stay open while the page is used. */
const MODAL = '[role="dialog"]:not([data-slot="popover-content"]), [role="alertdialog"], [role="menu"]';

/** True while a modal dialog or a menu is open: it owns the keyboard, and the page behind it must not act on a key. */
export const isModalOpen = () => document.querySelector(MODAL) !== null;

/**
 * The keys every page answers to, as `KeyboardEvent.key` names them in lower case: N opens the New dialog and ? the
 * shortcuts window (`routes/__root.tsx`), ⌘K or Ctrl+K the project switcher (`project-switcher.tsx`). The shortcut list
 * (`lib/shortcuts.ts`) is tested against them.
 */
export const APP_KEYS = { newThing: 'n', help: '?', switchProject: 'k' } as const;

/** Undo or redo, where a page has them (the painter, Customize): ⌘Z or Ctrl+Z undoes; ⇧⌘Z, Ctrl+Shift+Z or Ctrl+Y redoes. */
export function historyCommand(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>): 'undo' | 'redo' | null {
  const key = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (e.ctrlKey && key === 'y') return 'redo';
  return null;
}

/** Runs the handler on window keydown. The handler always sees the latest props and state. */
export function useWindowKeydown(handler: (event: KeyboardEvent) => void) {
  const onKeyDown = useEffectEvent(handler);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
