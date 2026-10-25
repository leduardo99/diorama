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

/** Runs the handler on window keydown. The handler always sees the latest props and state. */
export function useWindowKeydown(handler: (event: KeyboardEvent) => void) {
  const onKeyDown = useEffectEvent(handler);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
