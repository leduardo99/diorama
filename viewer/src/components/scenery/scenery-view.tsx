import { useCallback, useEffect, useMemo, useState } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useSelector } from '@tanstack/react-store';
import { validateScene, type SceneData, type ScenePieceInfo, type SceneryCatalog, type SpaceHeight } from '@core/volume';
import { MapIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Rich, useT } from '@/i18n';
import { historyCommand, isTyping, useWindowKeydown } from '@/lib/hotkeys';
import { projectsQuery } from '@/lib/queries';
import { sceneryRoute } from '@/lib/routes';
import { savedScenesQuery, sceneryQuery } from '@/lib/scenery/catalog';
import { canFlip, countCells, duplicateProp, emptyScene, nudgeSelected, pieceOf, removeSelected, rotateProp, validSelection, type EraseLayer, type Layer, type Picked, type Selection } from '@/lib/scenery/edit';
import { NUDGE_KEYS, PAINTER_COMMAND_KEYS, TOOL_OF_KEY, isPainterKey } from '@/lib/scenery/keys';
import { brushOf, type PieceGroup, type Tool } from '@/lib/scenery/labels';
import { fitZoom, geometryOf, stepZoom, ZOOMS, type Zoom } from '@/lib/scenery/render';
import { createCanvasStatus } from '@/lib/scenery/status';
import { useHistory } from '@/lib/scenery/use-history';
import { cn } from '@/lib/utils';
import { usePref } from '@/lib/use-pref';
import { SaveSceneModal } from '@/modals/save-scene-modal';
import { DrawReadout, HoverReadout } from './canvas-readout';
import { SceneCanvas, type Brush } from './scene-canvas';
import { SceneMenu } from './scene-menu';
import { SceneToolbar } from './scene-toolbar';
import type { UseBrush } from './selection-popover';
import { SceneryPalette } from './scenery-palette';
import { ToolOptions } from './tool-options';
import { ToolRail } from './tool-rail';

const DEFAULT_SIZE = { cols: 16, rows: 12 };

/** Unsaved scenes survive leaving the tab, but not a reload. */
const drafts = new Map<string, SceneData>();

/** Open menus and dialogs own the keyboard; the popovers do not (the selection's stays open while the painter is used). */
const OPEN_LAYER = '[role="dialog"]:not([data-slot="popover-content"]), [role="alertdialog"], [role="menu"], [role="listbox"]';

/** Paint a scene of the project's scenery kit and see it drawn by the engine; save it as a scene of the project. */
export function SceneryView() {
  const { project } = sceneryRoute.useParams();
  const { fixture = false } = sceneryRoute.useSearch();
  const { data: projects } = useSuspenseQuery(projectsQuery);
  const meta = projects.find((p) => p.name === project);
  const { data: catalog } = useSuspenseQuery(sceneryQuery(project, fixture, meta?.hasSceneryKit ?? false));
  const { t } = useT();

  if (!catalog) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon"><MapIcon /></EmptyMedia>
          <EmptyTitle>{t('scenery.noKit.title')}</EmptyTitle>
          <EmptyDescription>
            <Rich id="scenery.noKit.description" />
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <Painter key={`${project}:${fixture}`} project={project} catalog={catalog} fixture={fixture} sceneNames={meta?.scenes ?? []} />;
}

const firstOf = (catalog: SceneryCatalog, groups: PieceGroup[]) => catalog.pieces.find((p) => groups.includes(p.group))?.id ?? null;

function Painter({ project, catalog, fixture, sceneNames }: { project: string; catalog: SceneryCatalog; fixture: boolean; sceneNames: string[] }) {
  const { t, plural } = useT();
  // The list follows the catalog; keeping the previous one while it reloads leaves the painter where it is.
  const { data: saved = [] } = useQuery({ ...savedScenesQuery(project, fixture, sceneNames), placeholderData: keepPreviousData });
  const history = useHistory<SceneData>(() => drafts.get(project) ?? emptyScene(catalog, DEFAULT_SIZE.cols, DEFAULT_SIZE.rows));
  const scene = history.value;
  useEffect(() => {
    drafts.set(project, scene);
  }, [project, scene]);

  const [loaded, setLoaded] = useState<string | null>(null);
  // The scene as it was opened or saved: what differs from it is not saved yet.
  const [baseline, setBaseline] = useState<SceneData | null>(null);
  const [tool, setTool] = useState<Tool>('floor');
  // The eraser takes whatever is on top under the pointer, whatever its type, unless a layer is chosen.
  const [eraseLayer, setEraseLayer] = useState<EraseLayer>('all');
  const [brush, setBrush] = useState<Brush>(() => ({ floor: firstOf(catalog, ['floor']), wall: firstOf(catalog, ['wall', 'fence']), door: firstOf(catalog, ['door']), prop: firstOf(catalog, ['prop', 'decal']) }));
  const [propDir, setPropDir] = useState(0);
  // No variant: the engine picks the look from the position.
  const [propVariant, setPropVariant] = useState<number | undefined>(undefined);
  // The resting state a prop or door is put down in (none: the piece's first), and the side a door faces.
  const [placeState, setPlaceState] = useState<string | undefined>(undefined);
  const [doorFlip, setDoorFlip] = useState(false);
  // The height walls are painted at: one of the piece's heights, none for its default.
  const [wallHeight, setWallHeight] = useState<SpaceHeight | undefined>(undefined);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [visible, setVisible] = useState<Record<Layer, boolean>>({ floor: true, walls: true, props: true });
  // Every scene opens fitted to the canvas; − / + leave Fit until it is chosen again. Not remembered: a zoom that suits one scene and window is wrong for the next.
  const [zoomChoice, setZoom] = useState<Zoom>('fit');
  const [grid, setGrid] = usePref<boolean>('scenery.grid', true);
  // Where characters can go (the engine's navigation), drawn over the scene.
  const [navigation, setNavigation] = usePref<boolean>('scenery.navigation', false);
  const [panelOpen, setPanelOpen] = usePref<boolean>('scenery.panel', true);
  // What the canvas reports at every pointer move or drawing lives outside this component's state: it would re-render it.
  const [status] = useState(createCanvasStatus);
  const drawError = useSelector(status, (s) => s.error);
  // Fit is the step the canvas box holds the whole drawing at. The step is selected, not the box: a resize re-renders the painter only when it changes the step.
  const geo = useMemo(() => geometryOf({ cols: scene.cols, rows: scene.rows }, catalog), [scene.cols, scene.rows, catalog]);
  const fitted = useSelector(status, (s) => (s.view ? fitZoom(geo, s.view) : null));
  const zoom = zoomChoice === 'fit' ? (fitted ?? ZOOMS[0]) : zoomChoice;

  const problems = useMemo(() => validateScene(scene, catalog), [scene, catalog]);
  const empty = useMemo(() => scene.props.length === 0 && countCells(scene.floor) === 0 && countCells(scene.walls) === 0, [scene]);
  const unsaved = loaded === null ? !empty : scene !== baseline;
  // Undo, an erase or a resize can leave the selection pointing at nothing.
  const selected = useMemo(() => validSelection(scene, selection), [scene, selection]);
  const selectedProp = selected?.kind === 'prop' ? selected.index : null;
  const armedProp = brush.prop ? (pieceOf(catalog, brush.prop) ?? null) : null;
  const armedDoor = brush.door ? (pieceOf(catalog, brush.door) ?? null) : null;

  // Stable, so the palette, the toolbar and the canvas (all memoized) do not re-render for what they did not read.
  const choose = useCallback((info: ScenePieceInfo) => {
    const key = brushOf(info.group);
    setBrush((b) => ({ ...b, [key]: info.id }));
    setTool(key);
    if (key === 'prop' || key === 'door') {
      setPropDir(0);
      setPropVariant(undefined);
      setPlaceState(undefined);
      setDoorFlip(false);
    }
    if (key === 'wall') setWallHeight(undefined);
  }, []);

  const pick = useCallback((picked: Picked) => {
    if (picked.kind === 'prop') {
      setSelection({ kind: 'prop', index: picked.index });
      setTool('select');
    } else if (picked.kind === 'wall') {
      setBrush((b) => ({ ...b, wall: picked.id }));
      setWallHeight(picked.height);
      setTool('wall');
    } else {
      setBrush((b) => ({ ...b, floor: picked.id }));
      setTool('floor');
    }
  }, []);

  /** A gesture's scene, made by the canvas: one undo step. */
  const commit = useCallback((next: SceneData) => history.set(() => next), [history.set]);
  const setLayer = useCallback((layer: Layer, on: boolean) => setVisible((v) => ({ ...v, [layer]: on })), []);

  const rotate = (delta: 1 | -1) => {
    if (selectedProp !== null) {
      history.set((s) => rotateProp(s, catalog, selectedProp, delta));
    } else if (tool === 'prop' && armedProp) {
      const count = armedProp.directions ?? 1;
      setPropDir((d) => (((d + delta) % count) + count) % count);
    } else if (tool === 'door' && armedDoor && canFlip(armedDoor)) {
      setDoorFlip((flip) => !flip);
    }
  };

  /** Takes what is selected out of the scene, whatever it is. */
  const remove = () => {
    if (!selected) return;
    history.set((s) => removeSelected(s, selected));
    setSelection(null);
  };

  // The copy is the last placement, and the one selected.
  const duplicate = () => {
    // A door is not copied: an edge holds one.
    if (selectedProp === null || duplicateProp(scene, catalog, selectedProp) === scene) return;
    history.set((s) => duplicateProp(s, catalog, selectedProp));
    setSelection({ kind: 'prop', index: scene.props.length });
  };

  /** A floor or wall lends its piece (and a wall its height) to the brush. */
  const useBrush = useCallback(
    (lent: UseBrush) => {
      const info = pieceOf(catalog, lent.piece);
      if (!info) return;
      const key = brushOf(info.group) === 'floor' ? 'floor' : 'wall';
      setBrush((b) => ({ ...b, [key]: lent.piece }));
      setWallHeight(key === 'wall' ? lent.height : undefined);
      setTool(key);
    },
    [catalog],
  );

  useWindowKeydown((e) => {
    if (isTyping(e.target) || document.querySelector(OPEN_LAYER)) return;
    const key = e.key.toLowerCase();
    // Tab hides the piece panel as in the painting programs, but only from the page itself: on a control it keeps moving the focus.
    if (isPainterKey('panel', key) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && (e.target === document.body || e.target instanceof HTMLCanvasElement)) {
      e.preventDefault();
      setPanelOpen(!panelOpen);
      return;
    }
    const step = historyCommand(e);
    if (step) {
      e.preventDefault();
      if (step === 'redo') history.redo();
      else history.undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && key === PAINTER_COMMAND_KEYS.duplicate && selectedProp !== null) {
      e.preventDefault();
      duplicate();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (TOOL_OF_KEY[key]) {
      setTool(TOOL_OF_KEY[key]);
    } else if (isPainterKey('rotate', key)) {
      rotate(e.shiftKey ? -1 : 1);
    } else if (isPainterKey('remove', key) && selected) {
      remove();
    } else if (isPainterKey('escape', key)) {
      setSelection(null);
    } else if (isPainterKey('grid', key)) {
      setGrid(!grid);
    } else if (isPainterKey('zoomIn', key) || isPainterKey('zoomOut', key)) {
      // As the disabled buttons and the wheel: a step past either end changes nothing, so it does not leave Fit either.
      const next = stepZoom(zoom, isPainterKey('zoomOut', key) ? -1 : 1);
      if (next !== zoom) setZoom(next);
    } else if (isPainterKey('fit', key)) {
      setZoom('fit');
    } else if (NUDGE_KEYS[key] && (selected?.kind === 'prop' || selected?.kind === 'figure' || selected?.kind === 'wall')) {
      const [dc, dr] = NUDGE_KEYS[key];
      const key2 = selected.kind === 'wall' ? `${selected.at.col},${selected.at.row}` : selected.index;
      history.set((s) => nudgeSelected(s, catalog, selected, { col: dc, row: dr }), `nudge:${selected.kind}:${key2}`);
      // A wall's selection is its place: it follows the wall.
      if (selected.kind === 'wall' && nudgeSelected(scene, catalog, selected, { col: dc, row: dr }) !== scene) setSelection({ kind: 'wall', at: { col: selected.at.col + dc, row: selected.at.row + dr } });
    } else {
      return;
    }
    e.preventDefault();
  });

  const open = (next: SceneData, name: string | null) => {
    history.set(() => next);
    setLoaded(name);
    setBaseline(next);
    setSelection(null);
    // An opened or new blank scene is seen whole.
    setZoom('fit');
  };

  const save = () =>
    void NiceModal.show(SaveSceneModal, {
      project,
      scene,
      defaultName: loaded ?? '',
      fixture,
      onSaved: (name: string) => {
        setLoaded(name);
        setBaseline(scene);
      },
    });

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col" aria-label={t('scenery.sceneLabel')}>
        <SceneToolbar
          leading={<SceneMenu catalog={catalog} scene={scene} saved={saved} loaded={loaded} unsaved={unsaved} onEdit={history.set} onLoad={open} />}
          panelOpen={panelOpen}
          onPanel={setPanelOpen}
          visible={visible}
          onVisible={setLayer}
          zoom={zoom}
          fit={zoomChoice === 'fit'}
          onZoom={setZoom}
          grid={grid}
          onGrid={setGrid}
          navigation={navigation}
          onNavigation={setNavigation}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
          onSave={save}
        />
        <ToolOptions
          catalog={catalog}
          tool={tool}
          brush={brush}
          eraseLayer={eraseLayer}
          onEraseLayer={setEraseLayer}
          propDir={propDir}
          propVariant={propVariant}
          onPropDir={setPropDir}
          onPropVariant={setPropVariant}
          placeState={placeState}
          onPlaceState={setPlaceState}
          doorFlip={doorFlip}
          onDoorFlip={setDoorFlip}
          wallHeight={wallHeight}
          onWallHeight={setWallHeight}
        />
        <div className="relative flex min-h-0 flex-1">
          <ToolRail tool={tool} onTool={setTool} />
          <SceneCanvas
            catalog={catalog}
            scene={scene}
            visible={visible}
            zoom={zoom}
            grid={grid}
            tool={tool}
            eraseLayer={eraseLayer}
            brush={brush}
            propDir={propDir}
            propVariant={propVariant}
            placeState={placeState}
            doorFlip={doorFlip}
            navigation={navigation}
            wallHeight={wallHeight}
            selection={selected}
            blocked={problems.length > 0}
            empty={empty}
            status={status}
            onCommit={commit}
            onEdit={history.set}
            onSelect={setSelection}
            onUseBrush={useBrush}
            onPick={pick}
            onZoom={setZoom}
            onDuplicate={duplicate}
            onRemove={remove}
          />
          {/* Over the canvas, not above it: an alert that comes and goes must not move what the pointer is aimed at. */}
          {(problems.length > 0 || drawError) && (
            <Alert variant="destructive" className="absolute top-3 right-3 left-15 max-h-[calc(100%-1.5rem)] w-auto overflow-y-auto bg-background">
              <TriangleAlertIcon />
              <AlertTitle>{problems.length > 0 ? plural('scenery.problems', problems.length) : t('scenery.drawFailed')}</AlertTitle>
              <AlertDescription>
                {problems.length > 0 ? (
                  <ul className="list-disc pl-4">{problems.slice(0, 6).map((problem) => <li key={problem}>{problem}</li>)}</ul>
                ) : (
                  <span className="font-mono">{drawError}</span>
                )}
                {problems.some((problem) => problem.startsWith('walls must be')) && (
                  <p className="mt-1">{t('scenery.legacyWalls')}</p>
                )}
                {problems.length > 0 && <p className="mt-1">{t('scenery.lastDrawable')}</p>}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <div className="flex h-8 shrink-0 items-center gap-4 overflow-hidden border-t px-3 whitespace-nowrap text-muted-foreground tabular-nums">
          <HoverReadout status={status} cols={scene.cols} rows={scene.rows} />
          <span>{scene.cols} × {scene.rows}</span>
          <span className="flex items-center gap-1.5">
            {loaded ?? t('scenery.unnamed')}
            {unsaved && <Badge variant="secondary">{t('scenery.unsaved')}</Badge>}
          </span>
          <DrawReadout status={status} />
        </div>
      </section>

      <aside className={cn('flex w-80 shrink-0 flex-col border-l', !panelOpen && 'hidden')} aria-label={t('scenery.piecesLabel')}>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <SceneryPalette catalog={catalog} brush={brush} tool={tool} onChoose={choose} onTool={setTool} />
        </div>
      </aside>
    </div>
  );
}
