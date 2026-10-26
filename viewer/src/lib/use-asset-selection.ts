import { useState } from 'react';
import { isTyping, useWindowKeydown } from './hotkeys';

export const assetDomId = (key: string) => `entry-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

/** Keys the ⋯ trigger uses itself: Enter and Space to open, and the arrows while its menu is open. */
export const isMenuTriggerKey = (key: string, open: boolean): boolean =>
  key === 'Enter' || key === ' ' || (open && key.startsWith('Arrow'));

/** Stops only the keys the ⋯ trigger uses, and keeps ArrowDown while closed from opening the menu instead of moving down the list. */
export function stopMenuTriggerKey(e: {
  key: string;
  currentTarget: { getAttribute(name: string): string | null };
  stopPropagation(): void;
  preventDefault(): void;
}) {
  const open = e.currentTarget.getAttribute('aria-expanded') === 'true';
  if (isMenuTriggerKey(e.key, open)) e.stopPropagation();
  else if (e.key === 'ArrowDown') e.preventDefault();
}

interface Options {
  /** Keys of the visible entries, in display order. */
  keys: string[];
  view: 'grid' | 'table';
  /** Cards per row of the grid; the list itself scrolls the active entry into view. */
  columns: number;
  /** True while something else (the Details window, a modal) owns the keyboard. */
  paused: boolean;
  onOpen: (key: string) => void;
  onDelete: (key: string) => void;
}

/** The keyboard-active entry: arrows move it, Enter opens it, Delete asks to remove it, "/" focuses search. */
export function useEntrySelection({ keys, view, columns, paused, onOpen, onDelete }: Options) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useWindowKeydown((e) => {
    if (paused || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('asset-search')?.focus();
      return;
    }
    if (keys.length === 0) return;

    const focusedKey =
      e.target instanceof Element
        ? (keys.find((key) => document.getElementById(assetDomId(key))?.contains(e.target as Node)) ?? null)
        : null;
    const current = focusedKey ?? activeKey;
    const perRow = view === 'grid' ? columns : 1;
    const at = current ? keys.indexOf(current) : -1;
    const move = (to: number) => {
      const next = keys[Math.max(0, Math.min(keys.length - 1, to))];
      setActiveKey(next);
      const el = document.getElementById(assetDomId(next));
      if (el) el.focus({ preventScroll: true });
      else if (e.target instanceof HTMLElement) e.target.blur();
    };

    switch (e.key) {
      case 'ArrowDown': move(at < 0 ? 0 : at + perRow); break;
      case 'ArrowUp': move(at < 0 ? 0 : at - perRow); break;
      case 'ArrowRight': if (view !== 'grid') return; move(at + 1); break;
      case 'ArrowLeft': if (view !== 'grid') return; move(at < 0 ? 0 : at - 1); break;
      case 'Home': move(0); break;
      case 'End': move(keys.length - 1); break;
      case 'Enter': if (!current) return; onOpen(current); break;
      case 'Delete': case 'Backspace': if (!current) return; onDelete(current); break;
      case 'Escape':
        if (!current) return;
        setActiveKey(null);
        if (e.target instanceof HTMLElement) e.target.blur();
        break;
      default: return;
    }
    e.preventDefault();
  });

  return { activeKey, setActiveKey };
}
