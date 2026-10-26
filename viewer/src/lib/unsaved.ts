import { useBlocker } from '@tanstack/react-router';

/**
 * While `unsaved` is true, reloading or closing the page asks first (the browser's own "Leave site?" prompt). Moving
 * between the viewer's tabs is not blocked: the scene and outfit drafts are kept for the session.
 */
export function useWarnOnUnload(unsaved: boolean) {
  useBlocker({ shouldBlockFn: () => false, enableBeforeUnload: () => unsaved });
}
