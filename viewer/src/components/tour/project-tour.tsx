import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Tour, TourArrow, TourDescription, TourFooter, TourHeader, TourPortal, TourSpotlight, TourSpotlightRing, TourStep, TourTitle,
} from '@/components/ui/tour';
import { useValueAsRef } from '@/hooks/use-value-as-ref';
import { Rich, useT } from '@/i18n';
import { isModalOpen } from '@/lib/hotkeys';
import { projectsQuery } from '@/lib/queries';
import { SECTION_PATHS, sectionOf } from '@/lib/sections';
import { rememberTour, sectionOfStop, skipFrom, targetSelector, tourStops, type TourStop } from '@/lib/tour';

interface Props {
  project: string;
  onEnd: () => void;
}

/** How often the tour looks for a stop's target, how long it waits for a section to show it, and how long a target may stay hidden. */
const POLL_MS = 100;
const WAIT_MS = 10_000;
const HIDDEN_MS = 500;

/** The target on the page, if it is drawn: a column shut to no width, or a control folded away, does not count. */
function findTarget(stop: TourStop): { element: HTMLElement | null; visible: boolean } {
  const element = document.querySelector<HTMLElement>(targetSelector(stop));
  if (!element) return { element: null, visible: false };
  const box = element.getBoundingClientRect();
  return { element, visible: box.width > 0 && box.height > 0 };
}

/** A dialog or a menu other than the tour's own card is open: the tour waits for it (a closing Shortcuts window, the ⋯ menu it was started from). */
const otherLayerOpen = () => isModalOpen(document.querySelector('[data-slot="tour-step"]'));

/**
 * The tour of a project page, loaded only when it runs (`TourHost`). One stop at a time: it goes to the section the stop
 * is about, waits for its target and points at it with Dice UI's `Tour` (a spotlight on the target, a card beside it).
 * A stop whose target is not there is shown in its fallback form (the section's tab) or skipped. The target cannot be
 * clicked through the spotlight (a card would open Details under the tour), the page's keys wait (the card is a dialog
 * to `isModalOpen`), Esc, Skip or a click outside end it, and the last stop is on the section the tour started from.
 */
export default function ProjectTour({ project, onEnd }: Props) {
  const { t } = useT();
  const { data: projects } = useSuspenseQuery(projectsQuery);
  const meta = projects.find((p) => p.name === project);
  const hasAssets = (meta?.assetCount ?? 0) > 0;
  const hasGearKit = meta?.hasGearKit ?? false;
  const hasSceneryKit = meta?.hasSceneryKit ?? false;
  const stops = useMemo(() => tourStops({ assetCount: hasAssets ? 1 : 0, hasGearKit, hasSceneryKit }), [hasAssets, hasGearKit, hasSceneryKit]);

  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const here = useLocation({ select: (location) => sectionOf(location.pathname) });
  // Where the tour comes back to for its last stop, with the list's search and filters as they were (the browser's own
  // address: the router's leaves out the viewer's base path).
  const [start] = useState(() => {
    const { pathname, search, hash } = router.history.location;
    return { section: here, href: `${pathname}${search}${hash}` };
  });

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [fallback, setFallback] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [blocked, setBlocked] = useState(false);
  // Looked for again when the target leaves the page (the list refetched, a column shut).
  const [search, setSearch] = useState(0);
  // What had the focus before the tour took it, given back when it ends.
  const opener = useRef<HTMLElement | null>(null);

  const stop = stops[Math.min(index, stops.length - 1)];
  const shown = fallback && stop.fallback ? stop.fallback : stop;

  const end = (answer: 'skipped' | 'finished') => {
    rememberTour(answer);
    const back = opener.current;
    onEnd();
    setTimeout(() => {
      if (back?.isConnected) back.focus({ preventScroll: true });
    }, 0);
  };

  const go = (next: number | null, towards: 1 | -1) => {
    if (next === null) return end('finished');
    setDirection(towards);
    setFallback(false);
    setTarget(null);
    setIndex(next);
  };

  /** The stop cannot be shown: its fallback, else the next stop the way the tour is going. */
  const unavailable = useEffectEvent(() => {
    if (!fallback && stop.fallback) {
      setFallback(true);
      setTarget(null);
    } else {
      go(skipFrom(index, direction, stops.length), direction);
    }
  });
  const found = useEffectEvent((element: HTMLElement) => {
    if (!opener.current && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      opener.current = document.activeElement;
    }
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    setTarget(element);
  });
  const goTo = useEffectEvent((stopToShow: TourStop) => {
    const section = sectionOfStop(stopToShow, here, start.section);
    if (section === here) return false;
    if (section === start.section) router.history.push(start.href);
    else void navigate({ to: SECTION_PATHS[section], params: { project } });
    return true;
  });
  const onSection = useEffectEvent((stopToShow: TourStop) => sectionOfStop(stopToShow, here, start.section) === here);

  // Go where the stop is and wait for its target. A dialog or a menu still open (the window or menu the tour was
  // started from) is waited out, not counted.
  useEffect(() => {
    const moved = goTo(shown);
    let waited = 0;
    let hidden = 0;
    const timer = setInterval(() => {
      if (otherLayerOpen()) return;
      waited += POLL_MS;
      const { element, visible } = findTarget(shown);
      if (element && visible) {
        clearInterval(timer);
        found(element);
        return;
      }
      hidden = element ? hidden + POLL_MS : 0;
      // On its section, the page says it has nothing to show (an empty list, a library with nothing to play, a kit with no
      // characters) and is not loading anything more (the Playground is empty until its atlases are in): no use waiting.
      const empty = onSection(shown) && document.querySelector('main [data-slot="empty"]') !== null && queryClient.isFetching() === 0;
      if (hidden >= HIDDEN_MS || (empty && waited >= POLL_MS * 3) || waited >= (moved ? WAIT_MS : WAIT_MS / 5)) {
        clearInterval(timer);
        unavailable();
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [shown, search]);

  // While a stop is shown: step aside for a dialog that opens, and look again for a target that leaves the page.
  useEffect(() => {
    if (!target) return;
    const timer = setInterval(() => {
      setBlocked(otherLayerOpen());
      const box = target.getBoundingClientRect();
      if (!target.isConnected || box.width === 0 || box.height === 0) {
        setTarget(null);
        setSearch((n) => n + 1);
      }
    }, POLL_MS * 2.5);
    return () => clearInterval(timer);
  }, [target]);

  // Stable handlers: the tour's context holds them, and a new one on every render would make each card drop and set up its
  // listeners again (a click outside landing in between would not end the tour).
  const showing = useValueAsRef(target !== null && !blocked);
  const onEscapeKeyDown = useCallback((event: KeyboardEvent) => {
    // A dialog over the tour keeps Esc for itself.
    if (!showing.current) event.preventDefault();
  }, [showing]);
  const onPointerDownOutside = useCallback((event: CustomEvent<{ originalEvent: PointerEvent }>) => {
    // The spotlit target is covered by its ring, which takes the click without ending the tour.
    const at = event.detail.originalEvent.target;
    if (at instanceof Element && at.closest('[data-slot="tour-spotlight-ring"]')) event.preventDefault();
  }, []);
  const onInteractOutside = useCallback((event: CustomEvent<{ originalEvent: PointerEvent | FocusEvent }>) => {
    // Only a click outside ends the tour: the page moving the focus by itself (a canvas taking it) does not.
    if (!(event.detail.originalEvent instanceof PointerEvent)) event.preventDefault();
  }, []);
  const onOpenAutoFocus = useCallback((event: Event) => {
    // The card opens on Next, so Enter goes on.
    event.preventDefault();
    const card = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    card?.querySelector<HTMLElement>('[data-tour-next]')?.focus({ preventScroll: true });
  }, []);
  // The focus goes back to what had it before the tour (`end`), not to the last thing the card had.
  const onCloseAutoFocus = useCallback((event: Event) => event.preventDefault(), []);

  const last = index === stops.length - 1;
  const titleId = `tour-${shown.id}-title`;
  const bodyId = `tour-${shown.id}-body`;

  return (
    <Tour
      open
      onOpenChange={(open) => {
        if (!open) end('skipped');
      }}
      autoScroll={false}
      sideOffset={12}
      spotlightPadding={6}
      className="contents"
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      onInteractOutside={onInteractOutside}
      onOpenAutoFocus={onOpenAutoFocus}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {target && !blocked && (
        <TourPortal>
          <TourSpotlight className="bg-black/60" />
          <TourSpotlightRing className="pointer-events-auto rounded-md" />
          <TourStep
            key={shown.id}
            target={target}
            side={shown.side}
            align={shown.align}
            collisionPadding={12}
            role="dialog"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            className="w-80 gap-3 p-3"
          >
            <TourArrow />
            <TourHeader>
              <TourTitle id={titleId}>{t(shown.title)}</TourTitle>
              <TourDescription id={bodyId}><Rich id={shown.body} /></TourDescription>
            </TourHeader>
            <TourFooter className="flex-row items-center sm:justify-start">
              <span className="mr-auto text-xs text-muted-foreground tabular-nums">{t('tour.counter', { current: index + 1, total: stops.length })}</span>
              {!last && <Button variant="ghost" size="sm" onClick={() => end('skipped')}>{t('tour.skip')}</Button>}
              <Button variant="outline" size="sm" disabled={index === 0} onClick={() => go(index - 1, -1)}>{t('tour.back')}</Button>
              <Button size="sm" data-tour-next="" onClick={() => go(last ? null : index + 1, 1)}>
                {last ? t('tour.done') : t('tour.next')}
              </Button>
            </TourFooter>
          </TourStep>
        </TourPortal>
      )}
    </Tour>
  );
}
