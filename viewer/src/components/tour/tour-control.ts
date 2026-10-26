import { createStore } from '@tanstack/react-store';
import { toast } from 'sonner';

/** The id of the toast that offers the tour, so starting it from elsewhere takes the offer away. */
export const TOUR_OFFER_TOAST = 'tour-offer';

/** Whether the tour is running. `TourHost` (on every project page) loads and shows it while it is. */
export const tourStore = createStore(false);

/** Starts the tour of the project page: from its offer, the Shortcuts window or the project's ⋯ menu. */
export function startTour() {
  toast.dismiss(TOUR_OFFER_TOAST);
  tourStore.setState(() => true);
}

export function stopTour() {
  tourStore.setState(() => false);
}
