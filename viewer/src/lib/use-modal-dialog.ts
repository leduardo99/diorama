import { useState } from 'react';
import { useModal } from '@ebay/nice-modal-react';

/** A menu or a popover is gone once the dialog it opened is up: the control to come back to is the button that opened it. */
const LAYER = '[role="menu"], [data-slot="popover-content"]';

/**
 * The control a dialog gives the focus back to when it closes: what had the focus when it was asked for (the button that
 * opened it, or the canvas a key was pressed on), or, for an item of a menu or a popover, that layer's own button (a menu
 * is labelled by its trigger; a popover is controlled by it). Nothing when the focus was nowhere.
 */
function openerOf(active: Element | null): HTMLElement | null {
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  const layer = active.closest<HTMLElement>(LAYER);
  if (!layer) return active;
  const labelledBy = layer.getAttribute('aria-labelledby');
  const trigger = (labelledBy && document.getElementById(labelledBy)) || (layer.id && document.querySelector(`[aria-controls="${CSS.escape(layer.id)}"]`));
  return trigger instanceof HTMLElement ? trigger : null;
}

/**
 * Binds a shadcn Dialog / AlertDialog to a nice-modal instance.
 * The modal is unmounted after its exit animation, so every `show()` starts from a fresh state.
 *
 * Radix gives the focus back to a dialog's own trigger (`DialogTrigger`), which a dialog opened with `NiceModal.show()`
 * has not got, so it would land on `<body>` and a keyboard user would lose their place. The control that had the focus
 * when the modal was shown is kept (its first render comes before the dialog takes the focus) and focused again on close,
 * if it is still on the page (a deleted asset's card is not).
 */
export function useModalDialog() {
  const modal = useModal();
  const [opener] = useState(() => openerOf(document.activeElement));
  return {
    modal,
    rootProps: {
      open: modal.visible,
      onOpenChange: (open: boolean) => {
        if (!open) modal.hide();
      },
    },
    contentProps: {
      onCloseAutoFocus: (event: Event) => {
        event.preventDefault();
        modal.remove();
        if (opener?.isConnected) opener.focus();
      },
    },
  };
}
