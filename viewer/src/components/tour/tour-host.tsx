import { lazy, Suspense, useEffect } from 'react';
import { useSelector } from '@tanstack/react-store';
import { toast } from 'sonner';
import { currentTranslator } from '@/i18n';
import { readTourMemory, rememberTour, shouldOfferTour } from '@/lib/tour';
import { startTour, stopTour, TOUR_OFFER_TOAST, tourStore } from './tour-control';

// The tour (Dice UI's component and the stops) loads only when it runs.
const ProjectTour = lazy(() => import('./project-tour'));

/** Offered once per visit at most: an offer left unanswered (it timed out) comes back on the next visit, not on the next project. */
let offered = false;

/** How long the project page has to settle before the offer shows, and how long the offer stays. */
const OFFER_DELAY = 1500;
const OFFER_DURATION = 20_000;

/**
 * The tour of a project page: offered, never started by itself, the first time this browser opens a project (a toast,
 * "Take the tour" or "Not now"), and shown while `tourStore` says it runs. Keyed by the project: switching projects or
 * leaving them ends a tour that is running.
 */
export function TourHost({ project }: { project: string }) {
  const running = useSelector(tourStore);

  useEffect(() => stopTour, []);

  useEffect(() => {
    if (offered || !shouldOfferTour(readTourMemory())) return;
    const timer = setTimeout(() => {
      if (tourStore.state) return;
      offered = true;
      const { t } = currentTranslator();
      toast(t('tour.offer.title'), {
        id: TOUR_OFFER_TOAST,
        description: t('tour.offer.description'),
        duration: OFFER_DURATION,
        action: { label: t('tour.offer.take'), onClick: startTour },
        cancel: { label: t('tour.offer.later'), onClick: () => rememberTour('declined') },
      });
    }, OFFER_DELAY);
    return () => clearTimeout(timer);
  }, []);

  if (!running) return null;
  return (
    <Suspense fallback={null}>
      <ProjectTour project={project} onEnd={stopTour} />
    </Suspense>
  );
}
