import type { ReactNode, RefObject } from 'react';
import { heightsOf, type SceneData, type SceneryCatalog, type SpaceHeight } from '@core/volume';
import { BrushIcon, CopyIcon, PersonStandingIcon, Trash2Icon, XIcon } from 'lucide-react';
import { OptionField } from '@/components/customize/option-field';
import { useT } from '@/i18n';
import type { TFn } from '@/i18n';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { canFlip, flipDoor, isDoor, isFlipped, pieceOf, rotateProp, setPropOption, setState, setVariant, setWallHeight, setWallOption, setWallVariant, validSelection, wallAt, wallsOnBorders, type Cell, type Selection } from '@/lib/scenery/edit';
import { FacingControl, HeightSelect, SideControl, StateSelect, VariantSelect } from './prop-fields';
import { cn } from '@/lib/utils';
import { PieceThumb } from './piece-thumb';

/** A piece the selection lends to a brush: a floor or a wall (at its height). */
export type UseBrush = { piece: string; height?: SpaceHeight };

interface Props {
  catalog: SceneryCatalog;
  scene: SceneData;
  selection: Selection | null;
  open: boolean;
  /** The canvas places and sizes this element over what is selected (its picture, its figure, its cell), so the popover follows it. */
  anchorRef: RefObject<HTMLDivElement | null>;
  /** The popover stays inside this element instead of spilling over the panels. */
  boundaryRef: RefObject<HTMLElement | null>;
  /** `merge` joins the edits that follow one another with the same key (a slider being dragged) into one undo step. */
  onEdit: (update: (scene: SceneData) => SceneData, merge?: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onUseBrush: (brush: UseBrush) => void;
  onClose: () => void;
}

const where = (t: TFn, at: Cell, vertex: boolean) => (vertex ? t('scenery.popover.vertex', { col: at.col, row: at.row }) : t('scenery.popover.column', { col: at.col, row: at.row }));

/**
 * What can be done with what is selected on the scene, in a small popover over it: a prop is turned, given a look and
 * options, copied or deleted; a wall gets its height, look and options; a scale figure or a floor cell can be taken away,
 * and a floor or wall lends its piece to the brush. It never takes focus, so the keyboard keeps driving the painter.
 */
export function SelectionPopover({ catalog, scene, selection, open, anchorRef, boundaryRef, onEdit, onDuplicate, onRemove, onUseBrush, onClose }: Props) {
  const valid = validSelection(scene, selection);
  // A control keeps focus after it is used, and Space or Enter on it would press it again.
  const run = (command: () => void) => {
    command();
    requestAnimationFrame(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  };

  return (
    <Popover open={open && valid !== null}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} aria-hidden className="pointer-events-none absolute top-0 left-0" />
      </PopoverAnchor>
      <PopoverContent
        side="top"
        sideOffset={6}
        collisionBoundary={boundaryRef.current ?? undefined}
        collisionPadding={8}
        updatePositionStrategy="always"
        className="max-h-(--radix-popover-content-available-height) w-64 gap-3 overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // The painter decides when to deselect: clicking the scene must not close the popover on its own.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {valid && (
          <>
            {valid.kind === 'prop' && <PropBody catalog={catalog} scene={scene} index={valid.index} run={run} onEdit={onEdit} onClose={onClose} onDuplicate={onDuplicate} onRemove={onRemove} />}
            {valid.kind === 'wall' && <WallBody catalog={catalog} scene={scene} at={valid.at} run={run} onEdit={onEdit} onClose={onClose} onRemove={onRemove} onUseBrush={onUseBrush} />}
            {valid.kind === 'floor' && <FloorBody catalog={catalog} scene={scene} at={valid.at} run={run} onClose={onClose} onRemove={onRemove} onUseBrush={onUseBrush} />}
            {valid.kind === 'figure' && <FigureBody scene={scene} index={valid.index} run={run} onClose={onClose} onRemove={onRemove} />}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

type Run = (command: () => void) => void;

/** The top of every popover: what it is, where, and the way to close it. */
function Header({ thumb, title, detail, run, onClose }: { thumb: React.ReactNode; title: string; detail: string; run: Run; onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-2">
      {thumb}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{title}</span>
        <span className="truncate text-muted-foreground tabular-nums">{detail}</span>
      </div>
      <Button variant="ghost" size="icon-xs" aria-label={t('scenery.popover.close')} onClick={() => run(onClose)}>
        <XIcon />
      </Button>
    </div>
  );
}

/**
 * The selection's actions: what it lends or copies, then Delete (or Clear), shadcn's destructive button. Delete is a group
 * of its own beside the others (nested button groups stand apart), so its tint never runs into the outline buttons.
 */
function Actions({ children, run, onRemove, label }: { children?: ReactNode; run: Run; onRemove: () => void; label?: string }) {
  const { t } = useT();
  return (
    <ButtonGroup className="w-full">
      {children && <ButtonGroup className="flex-1">{children}</ButtonGroup>}
      <ButtonGroup className={cn(!children && 'flex-1')}>
        <Button variant="destructive" size="sm" className="flex-1" onClick={() => run(onRemove)}>
          <Trash2Icon data-icon="inline-start" />
          {label ?? t('scenery.popover.delete')} <Kbd>⌫</Kbd>
        </Button>
      </ButtonGroup>
    </ButtonGroup>
  );
}

function PropBody({ catalog, scene, index, run, onEdit, onClose, onDuplicate, onRemove }: { catalog: SceneryCatalog; scene: SceneData; index: number; run: Run; onEdit: Props['onEdit']; onClose: () => void; onDuplicate: () => void; onRemove: () => void }) {
  const { t } = useT();
  const prop = scene.props[index];
  const info = pieceOf(catalog, prop.piece);
  if (!info) return null;
  // A door stands on an edge and faces one way or the other; a prop turns through its facings.
  const door = isDoor(prop);
  const facings = door ? 1 : (info.directions ?? 1);
  const variants = info.variants ?? 1;
  const states = info.states && info.states.length > 1 ? info.states : [];
  const place = door ? `${prop.edge === 'N' ? t('scenery.popover.northEdge') : t('scenery.popover.westEdge')} · ${where(t, prop, false)}` : where(t, prop, false);
  return (
    <>
      <Header thumb={<PieceThumb catalog={catalog} info={info} size="sm" />} title={info.label} detail={`${t(`scenery.groups.${info.group}`)} · ${place}`} run={run} onClose={onClose} />
      <FieldGroup className="gap-3">
        {(states.length > 0 || (door && canFlip(info))) && (
          <div className="flex items-end gap-2">
            {states.length > 0 && (
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor="prop-state">{t('scenery.popover.state')}</FieldLabel>
                <StateSelect id="prop-state" states={states} value={prop.state} className="w-full" onChange={(state) => run(() => onEdit((s) => setState(s, catalog, index, state)))} />
              </Field>
            )}
            {door && canFlip(info) && <SideControl flipped={isFlipped(info, prop)} onFlip={() => run(() => onEdit((s) => flipDoor(s, catalog, index)))} />}
          </div>
        )}
        {(facings > 1 || variants > 1) && (
          <div className="flex items-end gap-2">
            {facings > 1 && (
              <Field className="w-auto">
                <FieldLabel>{t('scenery.popover.direction')}</FieldLabel>
                <FacingControl count={facings} value={prop.dir ?? 0} onTurn={(by) => run(() => onEdit((s) => rotateProp(s, catalog, index, by)))} />
              </Field>
            )}
            {variants > 1 && (
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor="prop-variant">{t('scenery.popover.variation')}</FieldLabel>
                <VariantSelect id="prop-variant" count={variants} labels={info.variantLabels} value={prop.variant} className="w-full" onChange={(variant) => run(() => onEdit((s) => setVariant(s, index, variant)))} />
              </Field>
            )}
          </div>
        )}
        {(info.options ?? []).map((option) => (
          <OptionField
            key={option.key}
            id={`prop-opt-${option.key}`}
            option={option}
            value={prop.options?.[option.key] ?? option.default}
            onChange={(value) => onEdit((s) => setPropOption(s, index, option.key, value, option.default), `option:${index}:${option.key}`)}
          />
        ))}
      </FieldGroup>
      <Actions run={run} onRemove={onRemove}>
        {!door && (
          <Button variant="outline" size="sm" className="flex-1" onClick={() => run(onDuplicate)}>
            <CopyIcon data-icon="inline-start" />
            {t('scenery.popover.duplicate')} <Kbd>⌘D</Kbd>
          </Button>
        )}
      </Actions>
    </>
  );
}

function WallBody({ catalog, scene, at, run, onEdit, onClose, onRemove, onUseBrush }: { catalog: SceneryCatalog; scene: SceneData; at: Cell; run: Run; onEdit: Props['onEdit']; onClose: () => void; onRemove: () => void; onUseBrush: Props['onUseBrush'] }) {
  const { t } = useT();
  const look = wallAt(scene, at);
  const info = look && pieceOf(catalog, look.piece);
  if (!look || !info) return null;
  const heights = info.heights && info.heights.length > 1 ? info.heights : [];
  const variants = info.variants ?? 1;
  return (
    <>
      <Header thumb={<PieceThumb catalog={catalog} info={info} size="sm" />} title={info.label} detail={`${t(`scenery.groups.${info.group}`)} · ${where(t, at, wallsOnBorders(scene))}`} run={run} onClose={onClose} />
      <FieldGroup className="gap-3">
        {(heights.length > 0 || variants > 1) && (
          <div className="flex items-end gap-2">
            {heights.length > 0 && (
              <Field className="min-w-0 flex-1">
                <FieldLabel>{t('scenery.popover.height')}</FieldLabel>
                <HeightSelect heights={heights} units={heightsOf(info, catalog)} value={look.height} className="w-full" onChange={(height) => run(() => onEdit((s) => setWallHeight(s, at, height)))} />
              </Field>
            )}
            {variants > 1 && (
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor="wall-variant">{t('scenery.popover.variation')}</FieldLabel>
                <VariantSelect id="wall-variant" count={variants} labels={info.variantLabels} value={look.variant} className="w-full" onChange={(variant) => run(() => onEdit((s) => setWallVariant(s, at, variant)))} />
              </Field>
            )}
          </div>
        )}
        {(info.options ?? []).map((option) => (
          <OptionField
            key={option.key}
            id={`wall-opt-${option.key}`}
            option={option}
            value={look.options?.[option.key] ?? option.default}
            onChange={(value) => onEdit((s) => setWallOption(s, at, option.key, value, option.default), `wall:${at.col},${at.row}:${option.key}`)}
          />
        ))}
      </FieldGroup>
      <Actions run={run} onRemove={onRemove}>
        <Button variant="outline" size="sm" className="flex-1" onClick={() => run(() => onUseBrush({ piece: look.piece, height: look.height }))}>
          <BrushIcon data-icon="inline-start" />
          {t('scenery.popover.paintWithWall')}
        </Button>
      </Actions>
    </>
  );
}

function FloorBody({ catalog, scene, at, run, onClose, onRemove, onUseBrush }: { catalog: SceneryCatalog; scene: SceneData; at: Cell; run: Run; onClose: () => void; onRemove: () => void; onUseBrush: Props['onUseBrush'] }) {
  const { t } = useT();
  const id = scene.floor[at.row]?.[at.col];
  const info = id ? pieceOf(catalog, id) : undefined;
  if (!id || !info) return null;
  return (
    <>
      <Header thumb={<PieceThumb catalog={catalog} info={info} size="sm" />} title={info.label} detail={`${t('scenery.groups.floor')} · ${where(t, at, false)}`} run={run} onClose={onClose} />
      <Actions run={run} onRemove={onRemove} label={t('scenery.popover.clear')}>
        <Button variant="outline" size="sm" className="flex-1" onClick={() => run(() => onUseBrush({ piece: id }))}>
          <BrushIcon data-icon="inline-start" />
          {t('scenery.popover.paintWithFloor')}
        </Button>
      </Actions>
    </>
  );
}

function FigureBody({ scene, index, run, onClose, onRemove }: { scene: SceneData; index: number; run: Run; onClose: () => void; onRemove: () => void }) {
  const { t } = useT();
  const figure = scene.figures?.[index];
  if (!figure) return null;
  return (
    <>
      <Header
        thumb={<span className="grid size-8 shrink-0 place-items-center rounded-sm bg-muted ring-1 ring-foreground/10"><PersonStandingIcon /></span>}
        title={t('scenery.popover.figure')}
        detail={where(t, figure, false)}
        run={run}
        onClose={onClose}
      />
      <p className="text-muted-foreground">{t('scenery.popover.figureHint')}</p>
      <Actions run={run} onRemove={onRemove} />
    </>
  );
}
