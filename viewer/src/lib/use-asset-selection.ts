import { useState } from 'react';
import { isTyping, useWindowKeydown } from './hotkeys';

export const assetDomId = (key: string) => `entry-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

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

    const perRow = view === 'grid' ? columns : 1;
    const at = activeKey ? keys.indexOf(activeKey) : -1;
    const move = (to: number) => setActiveKey(keys[Math.max(0, Math.min(keys.length - 1, to))]);

    switch (e.key) {
      case 'ArrowDown': move(at < 0 ? 0 : at + perRow); break;
      case 'ArrowUp': move(at < 0 ? 0 : at - perRow); break;
      case 'ArrowRight': if (view !== 'grid') return; move(at + 1); break;
      case 'ArrowLeft': if (view !== 'grid') return; move(at < 0 ? 0 : at - 1); break;
      case 'Home': move(0); break;
      case 'End': move(keys.length - 1); break;
      case 'Enter': if (!activeKey) return; onOpen(activeKey); break;
      case 'Delete': case 'Backspace': if (!activeKey) return; onDelete(activeKey); break;
      case 'Escape': if (!activeKey) return; setActiveKey(null); break;
      default: return;
    }
    e.preventDefault();
  });

  return { activeKey, setActiveKey };
}
