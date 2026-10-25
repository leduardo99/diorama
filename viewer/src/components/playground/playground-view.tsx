import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQueries, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Gamepad2Icon, GamepadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { assetsQuery, atlasQuery, projectsQuery } from '@/lib/queries';
import { sceneWorldQuery } from '@/lib/scenery/background';
import { FIXTURE_SCENE_NAME } from '@/lib/scenery/catalog';
import { playgroundRoute } from '@/lib/routes';
import { listEntries, pushRecent, sceneToPlay } from '@/lib/playground/catalog';
import { buildLibrary, type Armed } from '@/lib/playground/library';
import type { HudInfo } from '@/lib/playground/actor';
import { DEFAULT_ZOOM, fitZoom, type Zoom } from '@/lib/playground/view';
import { Rich, useT } from '@/i18n';
import { projectUrl } from '@/lib/project-paths';
import { isModalOpen, isTyping, useWindowKeydown } from '@/lib/hotkeys';
import { isKey } from '@/lib/playground/keys';
import { useSheetImages } from '@/lib/playground/use-sheet-images';
import { usePref } from '@/lib/use-pref';
import type { Atlas } from '@/lib/atlas';
import { Palette } from './palette';
import { Hud } from './hud';
import { SceneToolbar } from './scene-toolbar';
import { SpeedBadge } from './speed-badge';
import { SelectionPopover } from './selection-popover';
import { Scene, type SceneHandle, type SceneOptions, type Selection } from './scene';

export function PlaygroundView() {
  const { project } = playgroundRoute.useParams();
  const { t } = useT();
  const { fixture = false, scene: linked } = playgroundRoute.useSearch();
  const navigate = playgroundRoute.useNavigate();
  const { data: allAssets } = useSuspenseQuery(assetsQuery);
  const assets = useMemo(() => allAssets.filter((a) => a.project === project), [allAssets, project]);
  const withAtlas = useMemo(() => assets.filter((a) => a.atlas), [assets]);

  // Every atlas is read once; the library is rebuilt only when one of them changes.
  const combine = useCallback(
    (results: Array<{ data?: Atlas }>) => new Map(results.flatMap((r, i) => (r.data ? [[withAtlas[i].subpath, r.data] as const] : []))),
    [withAtlas],
  );
  const atlases = useQueries({ queries: withAtlas.map(atlasQuery), combine });
  const library = useMemo(() => buildLibrary(assets, atlases), [assets, atlases]);
  const images = useSheetImages(assets);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const player = library.characters.find((c) => c.id === playerId) ?? library.characters[0] ?? null;
  // The zoom chosen: a number, or "fit" (the whole scene in view), which is worked out below from the scene and the box it is drawn in.
  const [zoomChoice, setZoom] = usePref<Zoom>('playground.zoom', DEFAULT_ZOOM);
  const [shadow, setShadow] = usePref<boolean>('playground.shadow', true);
  const [anchor, setAnchor] = usePref<boolean>('playground.anchor', false);
  const [bounds, setBounds] = usePref<boolean>('playground.bounds', false);
  const [sockets, setSockets] = usePref<boolean>('playground.sockets', false);
  // The HUD's event row leaves out the strides (`step:<leg>`), which fire on every step, unless asked.
  const [stepEvents, setStepEvents] = usePref<boolean>('playground.stepEvents', false);
  // Where characters can go in the scene (its navigation), drawn over everything.
  const [navigation, setNavigation] = usePref<boolean>('playground.navigation', false);
  // Not remembered between visits: a slow or paused scene left behind would look like a broken one.
  const [speed, setSpeed] = useState(1);
  const { data: projects } = useSuspenseQuery(projectsQuery);
  const meta = projects.find((p) => p.name === project);
  // `?fixture=true` stands the built-in kit's scene behind the actors, to try the scenery without a project kit that has one.
  const scenes = fixture ? [FIXTURE_SCENE_NAME] : meta?.hasSceneryKit ? meta.scenes : [];
  const [chosenScene, setChosenScene] = usePref<string>(`playground.scene.${project}`, '');
  /** A chosen scene opens fitted: the whole of it in view. A scene remembered from the last visit keeps the zoom stored with it. */
  const chooseScene = (name: string) => {
    setChosenScene(name);
    if (name) setZoom('fit');
  };
  // A link that names a scene (Save scene's "Play it in the Playground") plays it from the first frame, makes it the one chosen
  // (fitted, like a scene picked in the select) and leaves the address: from there the select alone decides, and the
  // Playground tab or a reload keeps it.
  const sceneName = sceneToPlay(scenes, linked, chosenScene);
  const takeLink = useEffectEvent((name: string) => {
    if (scenes.includes(name)) chooseScene(name);
    void navigate({ search: (prev) => ({ ...prev, scene: undefined }), replace: true });
  });
  useEffect(() => {
    if (linked !== undefined) takeLink(linked);
  }, [linked]);
  // The scene's ground is drawn once, at the export scale: a zoom only scales it, so it never blinks. The previous scene stays until the next is drawn.
  const { data: world } = useQuery({ ...sceneWorldQuery(project, sceneName, fixture), enabled: sceneName !== '', placeholderData: keepPreviousData });
  const shownWorld = sceneName ? (world ?? null) : null;
  // The size of the box the scene is drawn in, for Fit. A callback ref: the box mounts only once the library has something to play.
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const sceneBoxRef = useRef<HTMLDivElement>(null);
  const sceneBox = useCallback((element: HTMLDivElement | null) => {
    sceneBoxRef.current = element;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => {
      observer.disconnect();
      sceneBoxRef.current = null;
    };
  }, []);
  // Fit stays live: a new scene, a resized window or a toolbar that wraps fits it again (the scene re-centres the actors with it).
  const fitted = zoomChoice === 'fit' && shownWorld && box ? fitZoom(shownWorld, box) : null;
  const zoom = zoomChoice === 'fit' ? (fitted ?? DEFAULT_ZOOM) : zoomChoice;
  const options: SceneOptions = { zoom, shadow, anchor, bounds, sockets, stepEvents, navigation, effects: library.effects, speed, world: shownWorld };
  const [hud, setHud] = useState<HudInfo | null>(null);
  const [armed, setArmed] = useState<Armed | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const sceneRef = useRef<SceneHandle>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const entries = useMemo(() => listEntries(library), [library]);
  const [recentJson, setRecentJson] = usePref<string>(`playground.recent.${project}`, '[]');
  const recent = useMemo<string[]>(() => {
    try {
      const parsed: unknown = JSON.parse(recentJson);
      return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
    } catch {
      return [];
    }
  }, [recentJson]);

  useWindowKeydown((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || isModalOpen()) return;
    if (isKey('escape', e.key) && armed) {
      setArmed(null);
    } else if (isKey('switchCharacter', e.key) && library.characters.length > 1) {
      const at = library.characters.findIndex((c) => c.id === player?.id);
      const next = library.characters[(at + (e.key === ']' ? 1 : -1) + library.characters.length) % library.characters.length];
      setPlayerId(next.id);
    } else if (isKey('search', e.key)) {
      e.preventDefault();
      document.getElementById('playground-search')?.focus();
    }
  });

  if (library.characters.length === 0 && library.sprites.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><GamepadIcon /></EmptyMedia>
          <EmptyTitle>{t('playground.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('playground.empty.description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <Palette library={library} entries={entries} recent={recent} player={player} onPlayer={setPlayerId} armed={armed} onArm={setArmed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <SceneToolbar
          options={options}
          zoom={zoomChoice}
          onZoom={setZoom}
          scenes={scenes}
          scene={sceneName}
          onScene={chooseScene}
          onOptions={(patch) => {
            if (patch.shadow !== undefined) setShadow(patch.shadow);
            if (patch.anchor !== undefined) setAnchor(patch.anchor);
            if (patch.bounds !== undefined) setBounds(patch.bounds);
            if (patch.sockets !== undefined) setSockets(patch.sockets);
            if (patch.stepEvents !== undefined) setStepEvents(patch.stepEvents);
            if (patch.navigation !== undefined) setNavigation(patch.navigation);
            if (patch.speed !== undefined) setSpeed(patch.speed);
          }}
          armed={armed}
          onReset={() => setResetKey((n) => n + 1)}
        />
        {meta?.hasGame && (
          // Both play the same exports: say which is which, and lead to the game (a page of its own, in a new tab).
          <p className="flex flex-wrap items-center gap-x-2 border-b px-4 py-1 text-muted-foreground">
            <span><Rich id="playground.gameHint" /></span>
            <Button variant="link" size="sm" asChild>
              <a href={projectUrl(project, 'game/')} target="_blank" rel="noopener">
                <Gamepad2Icon data-icon="inline-start" />
                {t('playground.playGame')}
              </a>
            </Button>
          </p>
        )}
        <div ref={sceneBox} className="relative min-h-0 flex-1 overflow-hidden">
          <Scene
            handle={sceneRef}
            anchorRef={anchorRef}
            onSelect={setSelection}
            onHud={setHud}
            onControl={setPlayerId}
            player={player}
            images={images}
            options={options}
            armed={armed}
            resetKey={resetKey}
            onPlaced={() => {
              if (armed) setRecentJson(JSON.stringify(pushRecent(recent, armed.key)));
              setArmed(null);
            }}
          />
          <Hud info={hud} onUse={() => sceneRef.current?.interact()} />
          <SpeedBadge speed={speed} onReset={() => setSpeed(1)} />
          <SelectionPopover selection={selection} handle={sceneRef} anchorRef={anchorRef} boundaryRef={sceneBoxRef} />
        </div>
      </div>
    </div>
  );
}
