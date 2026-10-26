import type { ReactNode } from 'react';
import { EyeIcon, EyeOffIcon, GridIcon, KeyboardIcon, MinusIcon, RouteIcon, PanelRightCloseIcon, PanelRightOpenIcon, PlusIcon, Redo2Icon, SaveIcon, ScanIcon, Undo2Icon } from 'lucide-react';
import { ShortcutList } from '@/components/shortcut-list';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Rich, useT } from '@/i18n';
import type { Layer } from '@/lib/scenery/edit';
import { stepZoom, type Zoom } from '@/lib/scenery/render';
import { SHORTCUTS } from '@/lib/shortcuts';

const LAYERS: Layer[] = ['floor', 'walls', 'props'];

interface Props {
  /** The scene menu: what is open comes first on the bar. */
  leading: ReactNode;
  visible: Record<Layer, boolean>;
  onVisible: (layer: Layer, on: boolean) => void;
  /** The zoom on screen, Fit's included. */
  zoom: number;
  /** Fit is chosen: the zoom follows the canvas box. */
  fit: boolean;
  onZoom: (zoom: Zoom) => void;
  grid: boolean;
  onGrid: (on: boolean) => void;
  /** Shows where characters can go (the scene's navigation) over the drawing. */
  navigation: boolean;
  onNavigation: (on: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  panelOpen: boolean;
  onPanel: (open: boolean) => void;
}

/** The scene, undo, which layers are shown, zoom (with Fit), grid, the piece panel, the shortcut list and save. The tools themselves are in the rail. A single line of a fixed height: the canvas below never moves. When the bar is narrow the layers, Fit and save lose their words, and what still does not fit scrolls. */
export function SceneToolbar(p: Props) {
  const { t, number } = useT();
  return (
    <div className="@container flex h-12 shrink-0 items-center gap-3 overflow-x-auto border-b px-3 [scrollbar-width:none]">
      <div className="shrink-0">{p.leading}</div>
      <ButtonGroup aria-label={t('scenery.toolbar.history')} className="shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label={t('common.undo')} disabled={!p.canUndo} onClick={p.onUndo}><Undo2Icon /></Button>
          </TooltipTrigger>
          <TooltipContent>{t('common.undo')} <Kbd>⌘Z</Kbd></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label={t('scenery.toolbar.keys.redo')} disabled={!p.canRedo} onClick={p.onRedo}><Redo2Icon /></Button>
          </TooltipTrigger>
          <TooltipContent>{t('scenery.toolbar.keys.redo')} <Kbd>⇧⌘Z</Kbd></TooltipContent>
        </Tooltip>
      </ButtonGroup>

      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        spacing={0}
        className="shrink-0"
        aria-label={t('scenery.toolbar.layersLabel')}
        value={LAYERS.filter((layer) => p.visible[layer])}
        onValueChange={(next) => LAYERS.forEach((layer) => next.includes(layer) !== p.visible[layer] && p.onVisible(layer, next.includes(layer)))}
      >
        {LAYERS.map((layer) => (
          <ToggleGroupItem key={layer} value={layer} aria-label={t(p.visible[layer] ? 'scenery.toolbar.hideLayer' : 'scenery.toolbar.showLayer', { layer: t(`scenery.layers.${layer}`).toLowerCase() })} title={t(`scenery.layers.${layer}`)}>
            {p.visible[layer] ? <EyeIcon data-icon="inline-start" /> : <EyeOffIcon data-icon="inline-start" />}
            <span className="hidden @3xl:inline">{t(`scenery.layers.${layer}`)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ButtonGroup aria-label={t('scenery.toolbar.zoom')}>
          <Button variant="outline" size="icon-sm" aria-label={t('scenery.toolbar.zoomOut')} disabled={stepZoom(p.zoom, -1) === p.zoom} onClick={() => p.onZoom(stepZoom(p.zoom, -1))}><MinusIcon /></Button>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Wide enough for "0.75×" (about 55 px with its padding): the buttons beside it do not move when Fit changes the value. */}
              <ButtonGroupText className="min-w-15 justify-center tabular-nums">{t('units.times', { value: number(p.zoom, { maximumFractionDigits: 2 }) })}</ButtonGroupText>
            </TooltipTrigger>
            <TooltipContent><Rich id="scenery.toolbar.zoomHint" /></TooltipContent>
          </Tooltip>
          <Button variant="outline" size="icon-sm" aria-label={t('scenery.toolbar.zoomIn')} disabled={stepZoom(p.zoom, 1) === p.zoom} onClick={() => p.onZoom(stepZoom(p.zoom, 1))}><PlusIcon /></Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle variant="outline" size="sm" pressed={p.fit} onPressedChange={() => p.onZoom('fit')} aria-label={t('scenery.toolbar.keys.fit')}>
                <ScanIcon data-icon="inline-start" />
                <span className="hidden @3xl:inline">{t('scenery.toolbar.fit')}</span>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>{t('scenery.toolbar.keys.fit')} <Kbd>0</Kbd></TooltipContent>
          </Tooltip>
        </ButtonGroup>

        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle variant="outline" size="sm" pressed={p.grid} onPressedChange={p.onGrid} aria-label={t('scenery.toolbar.grid')}><GridIcon /></Toggle>
          </TooltipTrigger>
          <TooltipContent>{t('scenery.toolbar.grid')} <Kbd>G</Kbd></TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle variant="outline" size="sm" pressed={p.navigation} onPressedChange={p.onNavigation} aria-label={t('scenery.toolbar.navigation')}><RouteIcon /></Toggle>
          </TooltipTrigger>
          <TooltipContent>{t('scenery.toolbar.navigationHint')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle variant="outline" size="sm" pressed={p.panelOpen} onPressedChange={p.onPanel} aria-label={t('scenery.toolbar.piecePanel')}>
              {p.panelOpen ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>{t('scenery.toolbar.piecePanel')} <Kbd>Tab</Kbd></TooltipContent>
        </Tooltip>

        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label={t('scenery.toolbar.shortcuts')}><KeyboardIcon /></Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('scenery.toolbar.shortcuts')}</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="max-h-(--radix-popover-content-available-height) w-96 overflow-y-auto">
            <PopoverHeader>
              <PopoverTitle>{t('scenery.toolbar.shortcutsTitle')}</PopoverTitle>
            </PopoverHeader>
            {SHORTCUTS.scenery.map((list) => <ShortcutList key={list.title} section={list} />)}
          </PopoverContent>
        </Popover>

        <Button size="sm" aria-label={t('scenery.toolbar.save')} title={t('scenery.toolbar.save')} onClick={p.onSave}>
          <SaveIcon data-icon="inline-start" />
          <span className="hidden @2xl:inline">{t('scenery.toolbar.save')}</span>
        </Button>
      </div>
    </div>
  );
}
